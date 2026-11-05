import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cli, bounds, target, readState, writeState, exclusive, validateReceipt, bounded } from '../scripts/demo/trigger-alert.mjs';
import { rehearse, routeIdentity, healthyController } from '../scripts/demo/trigger-watchdog.mjs';
import { fixedTags } from '../scripts/demo/datadog-monitors.mjs';
const run = promisify(execFile);
const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' });
function fixture(overrides = {}) {
  let state, time = 100000, recovered = false;
  const calls = [];
  const op = (name, value) => async (...args) => { calls.push([name, ...args]); return typeof value === 'function' ? value(...args) : value; };
  const a = {
    identity: { checkout: target.checkout, commit: 'a'.repeat(40), toolingCommit: 'b'.repeat(40), appImageId: `sha256:${'c'.repeat(64)}`, appContainer: 'd'.repeat(64), owner: `local_owner:${'e'.repeat(32)}` }, oldDowntime: 'old',
    baseline: op('baseline'), verify: op('verify'), reserve: op('reserve'), cancel: op('cancel'), canceled: op('canceled', true), stop: op('stop'),
    monitor: op('monitor', () => recovered ? { status: 'OK' } : { status: 'Alert', last_triggered_ts: 101 }),
    create: op('create', 'replacement'), protection: op('protection', id => id === 'replacement'), replace: op('replace'),
    restart: op('restart', () => { recovered = true; }), fallback: op('fallback', () => { recovered = true; }), localHealthy: op('localHealthy', true), release: op('release'), ...overrides
  };
  return { a, calls, store: { async load() { if (!state) throw missing(); return structuredClone(state); }, async save(r) { state = structuredClone(r); } }, options: { now: () => time, sleep: async ms => { time += ms; } } };
}
test('help is static, strict args reject before adapters and plan/status only read', async () => {
  assert.equal((await cli(['help'])).target.checkout, 29524290);
  for (const args of [['run'], ['run', '--execute', '--id=1'], ['enable'], ['plan', '--execute'], ['recover', '--all']]) await assert.rejects(cli(args));
  const calls = [];
  const adapters = { inspect: async () => calls.push('read-plan'), status: async () => calls.push('read-status'), launch: async () => assert.fail('write') };
  await cli(['plan'], adapters); await cli(['status'], adapters);
  assert.deepEqual(calls, ['read-plan', 'read-status']);
});
test('Bash wrapper preserves arguments and help does not echo inherited credentials', async () => {
  const { stdout, stderr } = await run('bash', ['scripts/demo/trigger-alert.sh', 'help'], { env: { ...process.env, DD_API_KEY: 'canary-do-not-print' } });
  assert.equal(JSON.parse(stdout).target.checkout, target.checkout); assert.equal(stderr, ''); assert.ok(!stdout.includes('canary'));
  await assert.rejects(run('bash', ['scripts/demo/trigger-alert.sh', 'run', '--execute;touch /tmp/not-a-command']));
});
test('actual rule identity is necessary but not an Alert-only proof', () => {
  const owner = `local_owner:${'a'.repeat(32)}`;
  const rule = { data: { id: target.rule, attributes: { name: 'DeskDrop local demo to CodeRabbit MMANI', filter: { tags: [...fixedTags, owner] }, recipients: [target.recipient] } } };
  assert.equal(routeIdentity(rule, owner), true);
  for (const mutate of [r => r.data.id = 'other', r => r.data.attributes.recipients.push('other'), r => r.data.attributes.filter.tags.pop()]) { const r = structuredClone(rule); mutate(r); assert.equal(routeIdentity(r, owner), false); }
  assert.equal(rule.data.attributes.transition, undefined);
});
test('fresh successful controller checks require healthy protocol and telemetry', () => {
  const s = { triggerProtocol: 1, journeyBlocked: false, checks: { telemetry: 'sent', availability: { status: 0, time: 100 }, checkout: { status: 0, time: 100 } } };
  assert.equal(healthyController(s, 101), true);
  assert.equal(healthyController(s, 70000), false);
  assert.equal(healthyController({ ...s, journeyBlocked: true }, 101), false);
  assert.equal(healthyController({ ...s, triggerProtocol: 0 }, 101), false);
});
test('healthy scoped sequence restores suppression before app; only checkout writes', async () => {
  const f = fixture(); const r = await rehearse(f.a, f.store, f.options);
  assert.equal(r.phase, 'complete'); assert.equal(r.alertObserved, true);
  const names = f.calls.map(c => c[0]);
  assert.ok(names.indexOf('reserve') < names.indexOf('cancel'));
  assert.ok(names.indexOf('cancel') < names.indexOf('stop'));
  assert.ok(names.indexOf('replace') < names.indexOf('restart'));
  assert.equal(f.calls.find(c => c[0] === 'cancel')[1], 'old');
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 1);
  assert.ok(!names.some(n => /enable|createMonitor|emit/.test(n)));
});
test('unhealthy or unverified baseline never mutates', async () => {
  for (const error of ['Agent exit 133', 'journeyBlocked', 'pre-existing Alert', 'wrong owner', 'unverified Alert-only']) {
    const f = fixture({ baseline: async () => { throw new Error(error); } });
    await assert.rejects(rehearse(f.a, f.store, f.options)); assert.deepEqual(f.calls, []);
  }
});
test('provider failures still recover app; unknown creates are never duplicated', async () => {
  for (const failure of ['401', '403', '429', 'redirect', 'timeout']) {
    const f = fixture({ create: async () => { throw new Error(failure); } });
    const r = await rehearse(f.a, f.store, f.options);
    assert.equal(r.phase, 'uncertain'); assert.equal(r.recovered, true); assert.equal(r.createIntent, true);
    let attempts = 0; f.a.create = async () => { attempts++; return 'duplicate'; };
    await rehearse(f.a, f.store, { ...f.options, recover: true }); assert.equal(attempts, 0);
  }
});
test('unknown cancellation does not stop app and protection is attempted', async () => {
  const f = fixture({ cancel: async () => { throw new Error('unknown'); } });
  const r = await rehearse(f.a, f.store, f.options);
  assert.ok(!f.calls.some(c => c[0] === 'stop')); assert.ok(f.calls.some(c => c[0] === 'create')); assert.equal(r.recovered, false);
});
test('unknown stop triggers recovery, interruption skips alert observation, deadlines bound polling', async () => {
  const f = fixture({ stop: async () => { throw new Error('unknown'); } });
  const r = await rehearse(f.a, f.store, f.options); assert.equal(r.recovered, true);
  const g = fixture(); await rehearse(g.a, g.store, { ...g.options, interrupted: () => true });
  assert.ok(g.calls.findIndex(c => c[0] === 'create') < g.calls.findIndex(c => c[0] === 'monitor'));
  const h = fixture({ monitor: async () => ({ status: 'OK' }) });
  const receipt = await rehearse(h.a, h.store, h.options); assert.equal(receipt.alertObserved, undefined); assert.equal(receipt.phase, 'complete');
});
test('protected journal rejects symlinks, unsafe modes, corrupt data and overlaps', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'deskdrop-trigger-')); await chmod(dir, 0o700);
  try {
    await writeState(dir, 'receipt.json', { status: 'safe' }); assert.deepEqual(await readState(dir, 'receipt.json'), { status: 'safe' });
    await symlink(path.join(dir, 'receipt.json'), path.join(dir, 'alias.json'));
    await assert.rejects(readState(dir, 'alias.json'));
    await chmod(path.join(dir, 'receipt.json'), 0o644); await assert.rejects(readState(dir, 'receipt.json'));
    await chmod(path.join(dir, 'receipt.json'), 0o600); await writeFile(path.join(dir, 'receipt.json'), '{'); await assert.rejects(readState(dir, 'receipt.json'));
    await exclusive(dir, 'test.lock', async () => { await assert.rejects(exclusive(dir, 'test.lock', () => assert.fail('overlap'))); });
    assert.throws(() => validateReceipt({ version: 1 }));
  } finally { await rm(dir, { recursive: true }); }
});
test('bounded requests reject stalled operations and abort adapter signal', async () => {
  let aborted = false;
  await assert.rejects(bounded(signal => new Promise(() => signal.addEventListener('abort', () => { aborted = true; })), 10));
  assert.equal(aborted, true);
});

test('independent supervisor observes terminal disconnect and SIGTERM using real subprocesses', { timeout: 10000 }, async () => {
  const { spawn } = await import('node:child_process');
  const dir = await mkdtemp(path.join(tmpdir(), 'trigger-process-'));
  try {
    for (const mode of ['disconnect', 'SIGTERM']) {
      const result = path.join(dir, mode);
      const moduleUrl = new URL('../scripts/demo/trigger-watchdog.mjs', import.meta.url).href;
      const code = `import {supervisorSession} from ${JSON.stringify(moduleUrl)}; import {writeFile} from 'node:fs/promises'; await supervisorSession(async o=>{o.accepted('owned-disposable'); const end=Date.now()+3000; while(!o.interrupted() && Date.now()<end) await new Promise(r=>setTimeout(r,10)); await writeFile(${JSON.stringify(result)},o.interrupted()?'recovery-requested':'missed');}); if(process.connected)process.disconnect();`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', code], { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
      try {
        await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); });
        if (mode === 'disconnect') child.disconnect(); else child.kill(mode);
        assert.deepEqual(await done, { code: 0, signal: null });
        assert.equal(await readFile(result, 'utf8'), 'recovery-requested');
      } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await done; }
    }
  } finally { await rm(dir, { recursive: true }); }
});

test('supervisor lease excludes overlap without signaling or stealing a live owner', async () => {
  const { supervisorLease } = await import('../scripts/demo/trigger-alert.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'trigger-lease-')); await chmod(dir, 0o700);
  try {
    await supervisorLease(dir, false, async () => {
      await assert.rejects(supervisorLease(dir, false, () => assert.fail('overlap')));
      await assert.rejects(supervisorLease(dir, true, () => assert.fail('stole live owner')));
    });
    await supervisorLease(dir, true, async () => {});
  } finally { await rm(dir, { recursive: true }); }
});

test('SIGKILL leaves a durable lease that explicit recovery reconciles without a PID', { timeout: 10000 }, async () => {
  const { spawn } = await import('node:child_process');
  const { supervisorLease } = await import('../scripts/demo/trigger-alert.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'trigger-crash-')); await chmod(dir, 0o700);
  const url = new URL('../scripts/demo/trigger-alert.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import {supervisorLease} from ${JSON.stringify(url)}; await supervisorLease(${JSON.stringify(dir)},false,async()=>{process.send('locked');await new Promise(()=>{});});`], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const done = new Promise(resolve => child.once('exit', resolve));
  try {
    await new Promise(resolve => child.once('message', resolve)); child.kill('SIGKILL'); await done;
    assert.ok((await readState(dir, 'trigger.lock')).token);
    let recovered = false; await supervisorLease(dir, true, async () => { recovered = true; }); assert.equal(recovered, true);
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await done; await rm(dir, { recursive: true }); }
});

test('explicit recovery adopts one confirmed create result without another create', async () => {
  const f = fixture({ create: async () => { throw new Error('lost result'); } });
  assert.equal((await rehearse(f.a, f.store, f.options)).phase, 'uncertain');
  let creates = 0; f.a.create = async () => { creates++; return 'wrong'; };
  f.a.reconcileCreate = async () => 'replacement';
  const receipt = await rehearse(f.a, f.store, { ...f.options, recover: true });
  assert.equal(receipt.phase, 'complete'); assert.equal(creates, 0); assert.equal(receipt.newDowntime, 'replacement');
});
