import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, chmod, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cli, bounds, target, readState, writeState, exclusive, validateReceipt, bounded } from '../scripts/demo/trigger-alert.mjs';
import { rehearse, routeIdentity, healthyController } from '../scripts/demo/trigger-watchdog.mjs';
import { EventEmitter } from 'node:events';
import { makeApi, fixedTags } from '../scripts/demo/datadog-monitors.mjs';
const run = promisify(execFile);
const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' });
function fixture(overrides = {}) {
  let state, time = 100000, recovered = false;
  const calls = [];
  const op = (name, value) => async (...args) => { calls.push([name, ...args]); return typeof value === 'function' ? value(...args) : value; };
  const a = {
    identity: { checkout: target.checkout, commit: 'a'.repeat(40), toolingCommit: 'b'.repeat(40), appImageId: `sha256:${'c'.repeat(64)}`, appContainer: 'd'.repeat(64), owner: `local_owner:${'e'.repeat(32)}` }, oldDowntime: 'old',
    baseline: op('baseline'), verify: op('verify'), verifyProtection: op('verifyProtection'), restoreProtection: async (run,id) => a.replace(id), reserve: op('reserve'), cancel: op('cancel'), canceled: op('canceled', true), stop: op('stop'),
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
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'deskdrop-trigger-'))); await chmod(dir, 0o700);
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
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'trigger-process-')));
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
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'tl-'))); await chmod(dir, 0o700);
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
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'tc-'))); await chmod(dir, 0o700);
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

test('complete-before-release crash and expired receipts reconcile release with a fresh attempt', async () => {
  const f = fixture(); const r = await rehearse(f.a, f.store, f.options);
  await f.store.save({ ...r, releaseConfirmed: false });
  const calls = f.calls.length;
  const now = () => r.deadline + 100000;
  const recovered = await rehearse(f.a, f.store, { ...f.options, now, recover: true });
  assert.equal(recovered.releaseConfirmed, true);
  assert.equal(recovered.deadline, r.deadline);
  assert.equal(recovered.attempt.deadline, now() + bounds.recovery);
  assert.ok(f.calls.slice(calls).some(c => c[0] === 'release'));
  assert.ok(!f.calls.slice(calls).some(c => ['cancel', 'stop', 'create'].includes(c[0])));
});
test('expired unknown create is adopted once and recovery uses fresh readbacks', async () => {
  const f = fixture({ create: async () => { throw new Error('unknown'); } });
  const old = await rehearse(f.a, f.store, f.options);
  let creates = 0; f.a.create = async () => { creates++; }; f.a.reconcileCreate = async () => 'replacement';
  const r = await rehearse(f.a, f.store, { ...f.options, now: () => old.deadline + 1, recover: true });
  assert.equal(r.phase, 'complete'); assert.equal(r.releaseConfirmed, true); assert.equal(creates, 0);
});
test('safe evidence distinguishes no-alert cleanup and excludes untrusted receipt strings', async () => {
  const { evidence } = await import('../scripts/demo/trigger-alert.mjs');
  const f = fixture({ monitor: async () => ({ status: 'OK' }) }); const r = await rehearse(f.a, f.store, f.options);
  const result = evidence({ ...r, failure: 'credential-canary', unexpected: 'credential-canary', attempt: { started: 1, deadline: 2, secret: 'credential-canary' } });
  assert.equal(result.outcome, 'no-alert-observed-restored'); assert.equal(result.alertObserved, false);
  assert.equal(result.identity.commit, f.a.identity.commit); assert.equal(result.protected, true);
  assert.ok(!JSON.stringify(result).includes('credential-canary'));
});
test('observer resolves supervisor exit after acceptance using a disposable subprocess', async () => {
  const { spawn } = await import('node:child_process');
  const { observeSupervisor } = await import('../scripts/demo/trigger-alert.mjs');
  const child = spawn(process.execPath, ['-e', "process.send({status:'accepted'});setTimeout(()=>process.exit(7),20)"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const result = await observeSupervisor(child, async () => ({ unknown: true, phase: 'observe' }), 1000);
  assert.equal(result.unknown, true); assert.ok(['exited', 'connection-lost'].includes(result.supervisor));
});
test('lease paths respect Darwin socket length and aliased fixture roots stay strict', async () => {
  const { leaseSocket } = await import('../scripts/demo/trigger-alert.mjs');
  assert.ok(Buffer.byteLength(leaseSocket('/private/var/folders/xx/abcdefghijklmnopqrstuvwxyz/T/demo123456', 'a'.repeat(36))) <= 103);
  assert.throws(() => leaseSocket('/' + 'x'.repeat(100), 'a'.repeat(36)));
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'alias-')));
  try { await symlink(dir, path.join(dir, 'alias')); await assert.rejects(writeState(path.join(dir, 'alias'), 'x.json', {})); } finally { await rm(dir, {recursive:true}); }
});

async function adapterFixture(deadlineMs = 10000) {
  const { productionAdapter } = await import('../scripts/demo/trigger-watchdog.mjs');
  const { monitorDefinitions, idDowntime } = await import('../scripts/demo/datadog-monitors.mjs');
  const definitions = JSON.parse(await readFile(new URL('../deploy/datadog/local-monitors.json', import.meta.url), 'utf8'));
  const owner = `local_owner:${'f'.repeat(32)}`, wanted = monitorDefinitions(definitions, owner);
  const ids = [target.availability, target.checkout, target.heartbeat];
  const state = { owner, pending: null, monitors: wanted.map((d,i) => ({id:ids[i],name:d.name,downtime:`dt-${i}`})) };
  const monitors = wanted.map((d,i) => ({...structuredClone(d),id:ids[i],overall_state:'OK',state:{groups:{'host:deskdrop-mmani-local':{status:'OK'}}}}));
  const downtime = new Map(ids.map((id,i)=> [`dt-${i}`, {data:{...idDowntime(id).data,id:`dt-${i}`,attributes:{...idDowntime(id).data.attributes,status:'active'}}}]));
  let journal = structuredClone(state); const calls = [];
  const status = {triggerProtocol:1,journeyBlocked:false,operationIdentity:{operationId:'owned'},commit:'a'.repeat(40),appImageId:`sha256:${'b'.repeat(64)}`,checks:{telemetry:'sent',availability:{status:0,time:Date.now()},checkout:{status:0,time:Date.now()}}};
  const rule={data:{id:target.rule,attributes:{name:'DeskDrop local demo to CodeRabbit MMANI',filter:{tags:[...fixedTags,owner]},recipients:[target.recipient]}}};
  const readers={site:target.site,definitions,api:{async getMonitor(id){calls.push(['monitor',id]);return monitors.find(m=>m.id===id);},async getDowntime(id){calls.push(['downtime',id]);return downtime.get(id);},async matches(id){return [journal.monitors.find(m=>m.id===id).downtime];},async getNotificationRule(){calls.push(['rule']);return rule;}},read:async()=>structuredClone(journal),write:async(n,v)=>{journal=structuredClone(v);},control:async()=>status,runtime:async()=>({ctx:{commit:status.commit,ids:{app:status.appImageId}},owned:['app','agent','runner','forwarder'].map(service=>({Id:'c'.repeat(64),Config:{Labels:{'com.docker.compose.service':service}},State:{Running:true,Health:{Status:'healthy'}}}))}),operation:async()=>status.operationIdentity,availability:async()=>true,tooling:async()=>'d'.repeat(40)};
  const rules = [rule.data];
  const routing = {status:200, delay:0, page:page => ({data:rules.slice(page*100,(page+1)*100),meta:{page:{total_count:rules.length}}})};
  const routeApi = makeApi({apiKey:'fixture',appKey:'fixture',deadlineMs,request(options, callback) {
    calls.push(['rule-page', options]);
    const req = new EventEmitter(); let timer; req.destroy = () => clearTimeout(timer); req.end = () => {
      const page = Number(new URL(options.path, 'https://fixture.invalid').searchParams.get('page'));
      const respond = () => {
        const response = new EventEmitter(); response.statusCode = options.path.includes('?') ? routing.status : 200; response.destroy = () => {}; callback(response);
        queueMicrotask(() => {response.emit('data', Buffer.from(JSON.stringify(options.path.includes('?') ? routing.page(page) : rule)));response.emit('end');});
      };
      if(routing.delay && options.path.includes('?')) timer = setTimeout(respond,routing.delay); else respond();
    }; return req;
  }});
  readers.api.notificationRules = routeApi.notificationRules;
  readers.api.getNotificationRule = async () => {calls.push(['rule']);return routeApi.getNotificationRule();};
  return {readers,state,monitors,downtime,status,rule,rules,routing,calls,make:()=>productionAdapter(readers),journal:()=>journal};
}
test('production validation reads actual definitions, journal, ownership, routing and runtime', async () => {
  const good = await adapterFixture(); await assert.rejects((await good.make()).baseline(), /Alert-only/); assert.ok(good.calls.some(c=>c[0]==='rule'));
  for (const mutate of [f=>f.readers.site='other',f=>f.monitors[1].id=1,f=>f.monitors[1].tags.pop(),f=>f.monitors[1].query='wrong',f=>f.rule.data.attributes.recipients=['other'],f=>f.status.journeyBlocked=true,f=>f.monitors[1].overall_state='Alert',f=>f.monitors[1].state.groups['host:deskdrop-mmani-local'].status='Alert',f=>f.readers.api.matches=async()=>['foreign'],f=>f.readers.api.getMonitor=async()=>({...f.monitors[1],id:1}),f=>{const runtime=f.readers.runtime;f.readers.runtime=async()=>{const r=await runtime();r.owned[1].State.Health.Status='unhealthy';return r;};},f=>f.status.checks.checkout.time=0,f=>f.readers.runtime=async()=>({ctx:{ids:{app:'wrong'}},owned:[]}),f=>f.readers.operation=async()=>{throw new Error('operation mismatch');},f=>f.readers.read=async()=>({...f.state,pending:'unknown'}),f=>f.readers.read=async()=>({...f.state,extra:true})]) {
    const f=await adapterFixture();mutate(f);await assert.rejects(async()=>{const a=await f.make();await a.baseline();},e=>!e.message.includes('Alert-only'));
  }
});
test('production replacement preserves other monitor entries and strict journal shape', async()=>{
  const f=await adapterFixture();conditionalRule(f);const a=await f.make();await a.replace('replacement');
  assert.deepEqual(f.journal().monitors[0],f.state.monitors[0]);assert.deepEqual(f.journal().monitors[2],f.state.monitors[2]);
  assert.equal(f.journal().monitors[1].downtime,'replacement');assert.deepEqual(Object.keys(f.journal()),Object.keys(f.state));
});

test('expired operation scope aborts actual API and prevents a delayed subsequent write', async()=>{
  const {makeApi}=await import('../scripts/demo/datadog-monitors.mjs');const {EventEmitter}=await import('node:events');
  let destroyed=false,requests=0;
  const api=makeApi({apiKey:'fixture',appKey:'fixture',request(){requests++;const req=new EventEmitter();req.end=()=>{};req.destroy=()=>{destroyed=true;};return req;}});
  await assert.rejects(bounded(()=>api.getMonitor(target.checkout),15));
  await new Promise(r=>setTimeout(r,10));assert.equal(destroyed,true);assert.equal(requests,1);
  let late;
  await assert.rejects(bounded(async()=>{await new Promise(r=>setTimeout(r,25));try{await api.cancelDowntime('owned');}catch{late='aborted';}},5));
  await new Promise(r=>setTimeout(r,40));assert.equal(late,'aborted');assert.equal(requests,1);
});

test('unknown reservation release on either side reconciles without a second fault', async () => {
  for (const removed of [false, true]) {
    const f = fixture(); let reserved = true, releases = 0;
    f.a.release = async () => { releases++; if (removed) reserved = false; throw new Error('lost release response'); };
    const first = await rehearse(f.a, f.store, f.options);
    assert.equal(first.phase, 'uncertain'); assert.equal(first.releaseConfirmed, false);
    const priorCalls = f.calls.length;
    f.a.release = async () => { releases++; reserved = false; };
    const next = await rehearse(f.a, f.store, { ...f.options, recover: true });
    assert.equal(next.phase, 'complete'); assert.equal(next.releaseConfirmed, true);
    assert.equal(reserved, false); assert.equal(releases, 2);
    assert.ok(!f.calls.slice(priorCalls).some(c => ['stop', 'cancel', 'create'].includes(c[0])));
  }
});
test('nested production operation deadline cannot extend its parent or mutate late', async () => {
  const { operationContext } = await import('../scripts/demo/trigger-alert.mjs');
  let deadline, lateWrite = false;
  await assert.rejects(bounded(async () => {
    deadline = operationContext().deadline;
    await bounded(async signal => {
      assert.equal(operationContext().deadline, deadline);
      await new Promise(resolve => setTimeout(resolve, 35));
      signal.throwIfAborted(); lateWrite = true;
    }, 1000);
  }, 10));
  await new Promise(resolve => setTimeout(resolve, 45)); assert.equal(lateWrite, false);
});
test('observer resolves pre-accept exit and IPC loss without killing a continuing supervisor', {timeout: 3000}, async t => {
  const { spawn } = await import('node:child_process');
  const { observeSupervisor } = await import('../scripts/demo/trigger-alert.mjs');
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'ob-')));
  const children = [];
  t.after(async () => {
    try {
      for (const child of children) {
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          child.ref();
          const exited = new Promise(resolve => child.once('exit', resolve));
          child.kill('SIGKILL');
          await exited;
        }
      }
    } finally { await rm(dir, {recursive: true}); }
  });
  const early = spawn(process.execPath, ['-e', 'process.exit(9)'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  children.push(early);
  assert.ok(['exited', 'connection-lost'].includes((await observeSupervisor(early, async () => ({ unknown: true }), 1000)).supervisor));
  const file = path.join(dir, 'recovered');
  const child = spawn(process.execPath, ['-e', `process.send({status:'accepted'});process.disconnect();setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(file)},'protected'),50);`], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  children.push(child);
  const done = new Promise(resolve => child.once('exit', resolve));
  assert.equal((await observeSupervisor(child, async () => ({ unknown: true }), 1000)).supervisor, 'connection-lost');
  child.ref();
  await done; assert.equal(await readFile(file, 'utf8'), 'protected');
});

test('recovery retains fault identity while recording the current tooling source separately', async () => {
  const f = fixture(); const before = structuredClone(await rehearse(f.a, f.store, f.options));
  f.a.identity.toolingCommit = 'f'.repeat(40);
  const after = await rehearse(f.a, f.store, { ...f.options, recover: true });
  assert.equal(after.identity.toolingCommit, before.identity.toolingCommit);
  assert.equal(after.attempt.toolingCommit, f.a.identity.toolingCommit);
  f.a.identity.appContainer = '9'.repeat(64);
  await assert.rejects(rehearse(f.a, f.store, { ...f.options, recover: true }), /identity changed/);
});
test('production recovery fallback requires run-bound confirmed control journals', async () => {
  const f = await adapterFixture(); let fallbacks = 0, barrierLost = false;
  const run = '11111111-1111-1111-1111-111111111111', read = f.readers.read;
  const stop = { run, action: 'stop', status: 'pending' }, restart = { run, action: 'restart', status: 'confirmed' };
  f.readers.read = async name => name === 'trigger.json' ? { run } : name.endsWith('-stop.json') ? stop : name.endsWith('-restart.json') ? restart : read(name);
  const control = f.readers.control;
  f.readers.control = async command => { if (command.startsWith('trigger:barrier')) { if (barrierLost) throw new Error('unknown'); return { status: 'settled' }; } return control(command); };
  f.readers.fallback = async () => { fallbacks++; };
  const a = await f.make(); await assert.rejects(a.fallback()); assert.equal(fallbacks, 0);
  stop.status = 'confirmed'; barrierLost = true;
  await a.fallback(); assert.equal(fallbacks, 1);
  restart.run = 'other'; await assert.rejects(a.fallback()); assert.equal(fallbacks, 1);
});

test('actual status command prints safe operational evidence without credential or raw failure values', async () => {
  const { mkdir } = await import('node:fs/promises');
  const home = await realpath(await mkdtemp(path.join(tmpdir(), 'st-'))), dir = path.join(home, '.deskdrop-mmani-local');
  try {
    await mkdir(dir, {mode: 0o700});
    const f = fixture({ monitor: async () => ({status: 'OK'}) }); const r = await rehearse(f.a, f.store, f.options);
    await writeState(dir, 'trigger.json', { ...r, failure: 'secret-canary', providerResponse: 'secret-canary' });
    const {stdout, stderr} = await run('bash', ['scripts/demo/trigger-alert.sh', 'status'], {env: {...process.env, HOME: home, DD_API_KEY: 'secret-canary'}});
    const result = JSON.parse(stdout);
    assert.equal(result.outcome, 'no-alert-observed-restored'); assert.equal(result.alertObserved, false);
    assert.equal(result.identity.commit, f.a.identity.commit); assert.equal(result.identity.toolingCommit, f.a.identity.toolingCommit);
    assert.equal(result.identity.appImageId, f.a.identity.appImageId);
    assert.equal(result.protected, true); assert.equal(result.recovered, true); assert.equal(result.released, true);
    assert.equal(result.failure, true); assert.equal(result.unknown, false); assert.equal(stderr, '');
    assert.ok(!stdout.includes('secret-canary')); assert.equal(result.providerEvent, 'unavailable');
  } finally { await rm(home, {recursive: true}); }
});

test('an elapsed attempt cannot initiate provider creation or app recovery controls', async () => {
  let time = 100000; const f = fixture({stop: async () => {time += bounds.recovery + 1;}});
  const r = await rehearse(f.a, f.store, {...f.options, now: () => time});
  assert.equal(r.phase, 'uncertain');
  assert.ok(!f.calls.some(c => ['create', 'restart', 'fallback'].includes(c[0])));
});
test('phase abort kills an owned delayed command before its later filesystem action', async () => {
  const { runCommand } = await import('../scripts/demo/local.mjs');
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'ab-'))), marker = path.join(dir, 'late');
  try {
    await assert.rejects(bounded(() => runCommand('bash', ['-c', 'sleep .15; printf late > "$1"', 'fixture', marker]), 15));
    await new Promise(r => setTimeout(r, 200));
    await assert.rejects(readFile(marker), {code: 'ENOENT'});
  } finally { await rm(dir, {recursive: true}); }
});

test('supervisor survives IPC loss before acceptance and still records recovery', {timeout: 3000}, async () => {
  const {spawn} = await import('node:child_process');
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'ip-'))), marker = path.join(dir, 'recovery');
  const module = new URL('../scripts/demo/trigger-watchdog.mjs', import.meta.url).href;
  const script = `import {supervisorSession} from ${JSON.stringify(module)};import {writeFile} from 'node:fs/promises';await supervisorSession(async o=>{process.send('ready');await new Promise(r=>setTimeout(r,40));o.accepted('owned');await writeFile(${JSON.stringify(marker)},String(o.interrupted()));});if(process.connected)process.disconnect();`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
  const done = new Promise(resolve => child.once('exit', resolve));
  try {
    await new Promise(resolve => child.once('message', resolve));child.disconnect();
    assert.equal(await done, 0);assert.equal(await readFile(marker, 'utf8'), 'true');
  } finally {if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');await done;await rm(dir,{recursive:true});}
});

test('an active old downtime cannot settle an unknown cancellation; later reconciliation adopts one replacement', async () => {
  let canceled = false, cancelCalls = 0, createCalls = 0, releases = 0;
  const f = fixture({
    cancel: async () => { cancelCalls++; throw new Error('lost DELETE response'); },
    canceled: async () => canceled,
    protection: async id => id === 'old' ? !canceled : id === 'replacement',
    monitor: async () => ({status: 'OK'}),
    create: async () => { createCalls++; throw new Error('lost create response'); },
    release: async () => { releases++; }
  });
  let r = await rehearse(f.a, f.store, f.options);
  assert.equal(r.phase, 'uncertain'); assert.equal(r.cancelIntent, true); assert.equal(r.protected, false);
  assert.equal(r.recovered, true); assert.equal(releases, 0); assert.equal(createCalls, 0);
  assert.ok(f.calls.some(c => c[0] === 'localHealthy'));
  r = await rehearse(f.a, f.store, {...f.options, recover: true});
  assert.equal(r.phase, 'uncertain'); assert.equal(cancelCalls, 1); assert.equal(createCalls, 0);
  canceled = true;
  r = await rehearse(f.a, f.store, {...f.options, recover: true});
  assert.equal(r.canceled, true); assert.equal(r.createIntent, true); assert.equal(r.phase, 'uncertain'); assert.equal(createCalls, 1);
  f.a.reconcileCreate = async () => 'replacement';
  r = await rehearse(f.a, f.store, {...f.options, recover: true});
  assert.equal(r.phase, 'complete'); assert.equal(r.releaseConfirmed, true); assert.equal(r.newDowntime, 'replacement');
  assert.equal(cancelCalls, 1); assert.equal(createCalls, 1); assert.equal(releases, 1);
  assert.ok(f.calls.some(c => c[0] === 'replace' && c[1] === 'replacement'));
});

function conditionalRule(f) {
  delete f.rule.data.attributes.recipients;
  f.rule.data.attributes.conditional_recipients = {conditions: [{scope: 'transition_type:is_alert', recipients: [target.recipient]}]};
}
test('production baseline accepts the exact healthy Alert-only conditional rule', async () => {
  const f = await adapterFixture(); conditionalRule(f);
  await (await f.make()).baseline();
  assert.ok(f.calls.some(c => c[0] === 'rule'));
});

test('conditional routing rejects broader or malformed delivery and rechecks recovery', async () => {
  const cases = [
    f => { delete f.rule.data.attributes.conditional_recipients; f.rule.data.attributes.recipients = [target.recipient]; },
    f => f.rule.data.attributes.recipients = [target.recipient],
    f => f.rule.data.attributes.recipients = null,
    f => f.rule.data.attributes.conditional_recipients.fallback_recipients = [target.recipient],
    f => f.rule.data.attributes.conditional_recipients.fallback_recipients = null,
    f => f.rule.data.attributes.conditional_recipients.conditions.push({scope: 'transition_type:is_recovery', recipients: [target.recipient]}),
    ...['transition_type:is_recovery', 'transition_type:is_warning', 'env:local-demo', 'transition_type:is_alert OR env:prod', 'is_alert', ''].map(scope => f => f.rule.data.attributes.conditional_recipients.conditions[0].scope = scope),
    f => f.rule.data.attributes.conditional_recipients.conditions[0].recipients.push('other'),
    f => f.rule.data.attributes.conditional_recipients.conditions[0].recipients = ['other'],
    f => f.rule.data.attributes.conditional_recipients.conditions[0].recipients = target.recipient,
    f => f.rule.data.attributes.conditional_recipients.conditions[0].status = 'Alert',
    f => f.rule.data.attributes.conditional_recipients.conditions = [],
    f => f.rule.data.attributes.conditional_recipients.conditions = null,
    f => f.rule.data.attributes.conditional_recipients = null,
    f => f.rule.data.attributes.conditional_recipients.conditions = [null],
    f => f.rule.data.attributes.bundle_config = {duration: 60},
    f => f.rule.data.attributes.bundle_config = null,
    f => f.rule.data.attributes.rule_options = {is_threaded: true},
    f => f.rule.data.attributes.rule_options = {is_threaded: false, dynamic: true},
    f => f.rule.data.attributes.dynamic_recipients = true,
    f => f.rule.data.id = 'other',
    f => f.rule.data.type = 'other',
    f => f.rule.data.attributes.name = 'other',
    f => f.rule.data.attributes.filter.tags.pop(),
    f => f.rule.data.attributes.filter.tags[4] = `local_owner:${'9'.repeat(32)}`,
    f => f.rule.data.attributes.filter.scope = 'env:local-demo',
    f => f.rule.data.attributes.filter.tags.push('other'),
    f => f.rule.data.attributes = null,
    f => f.rule.data = null,
    f => f.status.journeyBlocked = true,
    f => f.status.checks.checkout.time = 0,
    f => f.monitors[1].overall_state = 'Alert',
    f => f.monitors[1].state.groups['host:deskdrop-mmani-local'].status = 'Alert',
    f => f.monitors[1].id = 1,
    f => f.monitors[1].query = 'other',
    f => f.monitors[1].tags.pop()
  ];
  for (const mutate of cases) {
    const f = await adapterFixture(); conditionalRule(f); mutate(f);
    await assert.rejects(async () => (await f.make()).baseline());
  }
  const f = await adapterFixture(); conditionalRule(f); const a = await f.make();
  await a.baseline(); await a.verify(true);
  f.rule.data.attributes.conditional_recipients.fallback_recipients = [target.recipient];
  await assert.rejects(a.verify(true), /Alert-only/);
  await assert.rejects(a.verify(), /Alert-only/);
  await assert.rejects(a.verify(true, undefined, false), /Alert-only/);
});
test('optional empty delivery arrays are deliberate and inspect reports only actual preflight readiness', async () => {
  const {inspectProduction} = await import('../scripts/demo/trigger-watchdog.mjs');
  for (const explicit of [false, true]) {
    const f = await adapterFixture(); conditionalRule(f);
    if (explicit) {
      f.rule.data.attributes.recipients = [];
      f.rule.data.attributes.conditional_recipients.fallback_recipients = [];
      f.rule.data.attributes.rule_options = {is_threaded: false};
    }
    const result = await inspectProduction(f.make);
    assert.equal(result.status, 'ready'); assert.deepEqual(result.blockers, []);
  }
  const legacy = await adapterFixture();
  const result = await inspectProduction(legacy.make);
  assert.equal(result.status, 'blocked'); assert.deepEqual(result.blockers, ['Effective Alert-only delivery unverified']);
  const unhealthy = await adapterFixture(); conditionalRule(unhealthy); unhealthy.status.journeyBlocked = true;
  assert.deepEqual((await inspectProduction(unhealthy.make)).blockers, ['Runtime unhealthy']);
  assert.ok(!JSON.stringify(await inspectProduction(async () => {throw new Error('credential-canary');})).includes('credential-canary'));
});
test('approved rehearsal executes through the validated production adapter with scoped fixture operations', async () => {
  const f = await adapterFixture(); conditionalRule(f); const calls = [];
  f.rules.push({id:'unrelated',attributes:{filter:{scope:'env:prod AND host:other'},recipients:['unrelated-private-recipient']}});
  f.rules.push({id:'safe-host',attributes:{...structuredClone(f.rule.data.attributes),name:'Another safe route',filter:{scope:'host:deskdrop-mmani-local'}}});
  f.readers.api.matches = async id => [...f.downtime.values()].filter(d => d.data.attributes.monitor_identifier.monitor_id === id && d.data.attributes.status === 'active').map(d => d.data.id);
  f.readers.api.cancelDowntime = async id => {calls.push(['cancel', id]); f.downtime.get(id).data.attributes.status = 'canceled';};
  f.readers.api.createDowntime = async spec => {
    calls.push(['create', spec.data.attributes.monitor_identifier.monitor_id]);
    f.downtime.set('replacement', {data: {...structuredClone(spec.data), id: 'replacement', attributes: {...structuredClone(spec.data.attributes), status: 'active'}}});
    return {data: {id: 'replacement'}};
  };
  f.readers.control = async command => {
    if (command === 'status') return f.status;
    const [,action,run] = command.split(':'); calls.push([action, run]);
    const group = f.monitors[1].state.groups['host:deskdrop-mmani-local'];
    if (action === 'stop') {group.status = 'Alert';group.last_triggered_ts = Math.ceil(Date.now()/1000);}
    if (action === 'restart') group.status = 'OK';
    return {status: action};
  };
  const initial = structuredClone(f.journal());
  const a = await f.make(); const r = await rehearse(a, fixture().store);
  assert.equal(r.phase, 'complete'); assert.equal(r.alertObserved, true); assert.equal(r.releaseConfirmed, true);
  assert.deepEqual(calls.map(c => c[0]), ['reserve', 'cancel', 'stop', 'create', 'restart', 'release']);
  assert.equal(calls.find(c => c[0] === 'cancel')[1], initial.monitors[1].downtime);
  assert.equal(calls.find(c => c[0] === 'create')[1], target.checkout);
  assert.deepEqual(f.journal().monitors[0], initial.monitors[0]); assert.deepEqual(f.journal().monitors[2], initial.monitors[2]);
  assert.equal(f.journal().monitors[1].downtime, 'replacement');
  assert.ok(f.calls.filter(c => c[0] === 'rule').length > 2);
});

test('claim and pre-monitor crash windows recover without stealing live or ambiguous locks', {timeout: 10000}, async () => {
  const {spawn} = await import('node:child_process');
  const {supervisorLease, supervisorClaim, claimPort} = await import('../scripts/demo/trigger-alert.mjs');
  const url = new URL('../scripts/demo/trigger-alert.mjs', import.meta.url).href;
  for (const stage of ['claim', 'trigger']) {
    const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'cw-'))); await chmod(dir, 0o700);
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import {supervisorLease} from ${JSON.stringify(url)};await supervisorLease(${JSON.stringify(dir)},false,async()=>{},async phase=>{if(phase===${JSON.stringify(stage)}){process.send(phase);await new Promise(()=>{});}});`], {stdio: ['ignore','ignore','ignore','ipc']});
    const done = new Promise(resolve => child.once('exit', resolve));
    try {
      await new Promise(resolve => child.once('message', resolve));
      await assert.rejects(supervisorLease(dir, true, () => assert.fail('stole active claim')));
      child.kill('SIGKILL'); await done;
      if (stage === 'trigger') {
        await assert.rejects(readState(dir, 'monitor.lock'), {code: 'ENOENT'});
        for (const contents of ['', '{', 'null', JSON.stringify({token: 'foreign'})]) {
          await writeFile(path.join(dir, 'monitor.lock'), contents, {mode: 0o600});
          await assert.rejects(supervisorLease(dir, true, () => assert.fail('accepted ambiguous monitor lock')));
          assert.equal(await readFile(path.join(dir, 'monitor.lock'), 'utf8'), contents);
          await (await import('node:fs/promises')).unlink(path.join(dir, 'monitor.lock'));
        }
      }
      let recovered = false; await supervisorLease(dir, true, async () => {recovered = true;}); assert.equal(recovered, true);
      await supervisorClaim(dir, async () => {await assert.rejects(supervisorClaim(dir, () => assert.fail('overlap')));});
      const foreign = (await import('node:net')).createServer(socket => socket.destroy());
      await new Promise(resolve => foreign.listen({host:'127.0.0.1',port:claimPort(dir),exclusive:true},resolve));
      try {await assert.rejects(supervisorLease(dir,true,()=>assert.fail('stole foreign port')));assert.equal(foreign.listening,true);}
      finally {await new Promise(resolve=>foreign.close(resolve));}
      await writeFile(path.join(dir, 'trigger-claim.lock'), '', {mode: 0o600});
      await assert.rejects(supervisorLease(dir, true, () => assert.fail('accepted unknown legacy claim')));
      assert.equal(await readFile(path.join(dir, 'trigger-claim.lock'), 'utf8'), '');
    } finally {if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');await done;await rm(dir,{recursive:true});}
  }
});
test('supervisor launch decodes spaces and Unicode paths without leaking inherited credentials', {timeout: 3000}, async () => {
  const {mkdir} = await import('node:fs/promises'); const {pathToFileURL} = await import('node:url');
  const {spawnSupervisor} = await import('../scripts/demo/trigger-alert.mjs');
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'sp-'))), nested = path.join(dir, 'checkout space é');
  await mkdir(nested); const entry = path.join(nested, 'supervisor fixture.mjs');
  await writeFile(entry, "process.send({argument:process.argv[2],clean:!process.env.DD_API_KEY});process.disconnect();");
  const saved = process.env.DD_API_KEY; process.env.DD_API_KEY = 'fixture-canary';
  const child = spawnSupervisor(pathToFileURL(entry), 'recover'); const done = new Promise(resolve => child.once('exit', resolve));
  try {
    const result = await new Promise((resolve,reject) => {child.once('message',resolve);child.once('error',reject);});
    assert.deepEqual(result,{argument:'recover',clean:true}); assert.equal(await done,0);
  } finally {if(saved===undefined)delete process.env.DD_API_KEY;else process.env.DD_API_KEY=saved;if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');await done;await rm(dir,{recursive:true});}
});

test('effective route proof rejects an additional host-only ordinary recipient before arming', async () => {
  const f = await adapterFixture(); conditionalRule(f);
  f.rules.push({id:'host-rule',attributes:{name:'Host route',filter:{scope:'host:deskdrop-mmani-local'},recipients:['unexpected']}});
  await assert.rejects((await f.make()).baseline(), /Alert-only/);
});

test('complete production coverage rejects every matching unsafe route without mutations', async () => {
  const filters = [
    {tags:[]}, {tags:['host:deskdrop-mmani-local']},
    ...['host:*', 'NOT env:prod', 'env:prod OR host:deskdrop-mmani-local',
      'host:(other OR deskdrop-mmani-local)', 'host:"deskdrop-mmani-local"',
      '(env:local-demo AND host:deskdrop-mmani-local) OR env:prod',
      'env:local-demo host:deskdrop-mmani-local', 'NOT host:*'].map(scope=>({scope}))
  ];
  const delivery = [
    a=>{delete a.conditional_recipients;a.recipients=[target.recipient];},
    a=>a.conditional_recipients.fallback_recipients=[target.recipient],
    a=>a.conditional_recipients.conditions[0].recipients.push('private-extra-recipient'),
    a=>a.conditional_recipients.conditions[0].scope='env:local-demo',
    a=>a.bundle_config={duration:60}, a=>a.dynamic_recipients={team:'private-team'}
  ];
  for(const filter of filters) for(const mutate of delivery) {
    const f=await adapterFixture();conditionalRule(f);
    const attributes={...structuredClone(f.rule.data.attributes),name:'Other route',filter};mutate(attributes);
    f.rules.push({id:'other-rule',attributes}); const mutations=[];
    f.readers.control=async command=>{if(command!=='status')mutations.push(command);return f.status;};
    f.readers.api.cancelDowntime=async()=>mutations.push('cancel');
    f.readers.api.createDowntime=async()=>mutations.push('create');
    await assert.rejects(rehearse(await f.make(),fixture().store),/Alert-only/);
    assert.deepEqual(mutations,[]);
    assert.ok(f.calls.filter(c=>c[0]==='rule-page').every(c=>c[1].method==='GET'));
    const {inspectProduction}=await import('../scripts/demo/trigger-watchdog.mjs');
    const safe=JSON.stringify(await inspectProduction(f.make));
    assert.ok(!safe.includes('private-extra-recipient'));assert.ok(!safe.includes('Other route'));assert.ok(!safe.includes('private-team'));
  }
});
test('scope matching preserves multi-values, group union, quoting and conservative grammar limits', async () => {
  const {notificationMatches}=await import('../scripts/demo/trigger-watchdog.mjs');
  const candidates=[['env:local-demo','team:data platform','host:monitor-host'],['env:local-demo','team:data platform','host:monitor-host','host:deskdrop-mmani-local']];
  for(const scope of ['host:monitor-host AND host:deskdrop-mmani-local','host:(monitor-host AND deskdrop-mmani-local)', 'team:"data platform"', 'host:*','NOT env:prod','env:prod OR (host:monitor-host AND host:deskdrop-mmani-local)']) assert.equal(notificationMatches({scope},candidates),true,scope);
  for(const scope of ['NOT host:monitor-host','env:prod','host:(other OR missing)','NOT (host:monitor-host OR env:prod)']) assert.equal(notificationMatches({scope},candidates),false,scope);
  assert.equal(notificationMatches({tags:['host:monitor-host','host:deskdrop-mmani-local']},candidates),true);
  assert.equal(notificationMatches({tags:['env:local-demo','env:prod']},candidates),false);
  for(const scope of ['', '*','keyless','env:prod-*','env:pr?d','env:"pr?d"','env:','env:()','env:(prod OR)','env:prod AND','env:prod OR host:* AND team:x','env:"bad\\escape"','env:"unterminated','env:prod XOR env:dev','NOT '.repeat(34)+'env:prod','('.repeat(34)+'env:prod'+')'.repeat(34),'env:prod '.repeat(400),'env:prod '.repeat(172), 'env:prod OR (unsupported)']) assert.throws(()=>notificationMatches({scope},candidates),/filter unverified/,scope);
  for(const filter of [null,{}, {tags:null},{scope:'env:prod',tags:[]},{unknown:'env:prod'},{tags:['host:*']},{tags:['keyless']}]) assert.throws(()=>notificationMatches(filter,candidates),/filter unverified/);
});
test('production rule inventory rejects missing, conflicting, malformed and incomplete evidence', async () => {
  const cases=[
    f=>f.rules.splice(0),
    f=>f.rules[0]=structuredClone({...f.rule.data,attributes:{...f.rule.data.attributes,name:'conflicting'}}),
    f=>f.rules.push(f.rule.data),
    f=>f.routing.page=()=>({data:[],meta:{page:{total_count:1}}}),
    f=>f.routing.page=page=>({data:page?[]:[f.rule.data],meta:{page:{total_count:page?2:1}}}),
    f=>f.routing.page=()=>({data:[],meta:{page:{total_count:1001}}}),
    f=>f.routing.page=()=>({data:[f.rule.data]}),
    f=>f.rules.push({id:'unknown-filter',attributes:{filter:{scope:'env:prod OR unknown'},recipients:[]}}),
    f=>f.monitors[1].state.groups['host:other']={status:'OK'},
    ...[401,403,429,302].map(status=>f=>f.routing.status=status)
  ];
  for(const mutate of cases){
    const f=await adapterFixture();conditionalRule(f);mutate(f);const mutations=[];
    f.readers.control=async command=>{if(command!=='status')mutations.push(command);return f.status;};
    await assert.rejects(rehearse(await f.make(),fixture().store));assert.deepEqual(mutations,[]);
  }
  const f=await adapterFixture();conditionalRule(f);f.routing.delay=100;
  await assert.rejects(bounded(async()=>(await f.make()).baseline(),15));
  await new Promise(r=>setTimeout(r,110));assert.equal(f.calls.filter(c=>c[0]==='rule-page').length,2);
});
test('verification and recovery re-enumerate and reject a newly matching unsafe rule', async () => {
  const f=await adapterFixture();conditionalRule(f);const a=await f.make();await a.baseline();
  const before=f.calls.filter(c=>c[0]==='rule-page').length;
  f.rules.push({id:'new-unsafe',attributes:{filter:{scope:'host:*'},recipients:['unexpected']}});
  await assert.rejects(a.verify(),/Alert-only/);await assert.rejects(a.verify(true),/Alert-only/);
  await assert.rejects(a.replace('new-suppression'),/Alert-only/);
  assert.equal(f.journal().monitors[1].downtime,'dt-1');
  assert.ok(f.calls.filter(c=>c[0]==='rule-page').length>=before+9);
});

test('a route introduced during the fake outage fences completion while owned app recovery is still attempted', async()=>{
  const f=await adapterFixture();conditionalRule(f);const calls=[];
  f.readers.api.matches=async id=>[...f.downtime.values()].filter(d=>d.data.attributes.monitor_identifier.monitor_id===id&&d.data.attributes.status==='active').map(d=>d.data.id);
  f.readers.api.cancelDowntime=async id=>{calls.push('cancel');f.downtime.get(id).data.attributes.status='canceled';};
  f.readers.api.createDowntime=async spec=>{
    calls.push('create');assert.equal(spec.data.attributes.monitor_identifier.monitor_id,target.checkout);
    f.downtime.set('replacement',{data:{...structuredClone(spec.data),id:'replacement',attributes:{...structuredClone(spec.data.attributes),status:'active'}}});
    return {data:{id:'replacement'}};
  };
  f.readers.control=async command=>{
    if(command==='status')return f.status;
    const action=command.split(':')[1];calls.push(action);
    const group=f.monitors[1].state.groups['host:deskdrop-mmani-local'];
    if(action==='stop'){
      group.status='Alert';group.last_triggered_ts=Math.ceil(Date.now()/1000);
      f.rules.push({id:'late-unsafe',attributes:{filter:{scope:'host:*'},recipients:['private-route-canary']}});
    }
    if(action==='restart')group.status='OK';
    return {status:action};
  };
  const r=await rehearse(await f.make(),fixture().store);
  assert.equal(r.phase,'uncertain');assert.equal(r.protected,true);assert.equal(r.recovered,false);
  assert.deepEqual(calls,['reserve','cancel','stop','create','restart']);
  assert.equal(f.monitors[1].state.groups['host:deskdrop-mmani-local'].status,'OK');
  assert.equal(r.releaseConfirmed,undefined);assert.equal(r.createIntent,true);
  assert.ok(!JSON.stringify(r).includes('private-route-canary'));
  assert.equal(f.journal().monitors[1].downtime,'replacement');
  assert.deepEqual(f.journal().monitors[0],f.state.monitors[0]);assert.deepEqual(f.journal().monitors[2],f.state.monitors[2]);
});

async function protectionFixture(onStop, {unknownCreate=false}={}) {
  const f=await adapterFixture(150);conditionalRule(f);
  const calls=[],store=fixture().store,read=f.readers.read,write=f.readers.write;
  f.readers.read=async name=>{
    if(name==='monitors.json')return read(name);
    const r=await store.load();
    if(name==='trigger.json')return r;
    for(const action of ['stop','restart'])if(name===`trigger-${r.run}-${action}.json`)return {run:r.run,action,status:'confirmed'};
    throw missing();
  };
  f.readers.write=async(name,value)=>{calls.push(['journal',name]);await write(name,value);};
  f.readers.api.matches=async id=>[...f.downtime.values()].filter(d=>d.data.attributes.monitor_identifier.monitor_id===id&&d.data.attributes.status==='active').map(d=>d.data.id);
  f.readers.api.cancelDowntime=async id=>{calls.push(['cancel',id]);f.downtime.get(id).data.attributes.status='canceled';};
  f.readers.api.createDowntime=async spec=>{
    calls.push(['create',structuredClone(spec)]);
    assert.equal(spec.data.attributes.monitor_identifier.monitor_id,target.checkout);
    const r=await store.load();assert.equal(r.createIntent,true);assert.equal(r.canceled,true);
    f.downtime.set('replacement',{data:{...structuredClone(spec.data),id:'replacement',attributes:{...structuredClone(spec.data.attributes),status:'active'}}});
    if(unknownCreate)throw new Error('lost create response');
    return {data:{id:'replacement'}};
  };
  const group=f.monitors[1].state.groups['host:deskdrop-mmani-local'];
  f.readers.control=async command=>{
    if(command==='status')return f.status;
    const action=command.split(':')[1];calls.push([action]);
    if(action==='stop'){group.status='Alert';group.last_triggered_ts=Math.ceil(Date.now()/1000);await onStop(f);}
    if(action==='restart')group.status='OK';
    return {status:action};
  };
  f.readers.fallback=async identity=>{assert.equal(identity.appImageId,f.status.appImageId);calls.push(['fallback']);group.status='OK';};
  const a=await f.make();return {...f,a,store,actions:calls};
}
test('protective restoration survives unsafe routing and collection access failures but never releases on incomplete proof', async()=>{
  const changes=[
    f=>f.rules.push({id:'unsafe',attributes:{filter:{scope:'host:*'},recipients:['private-routing-canary']}}),
    f=>f.routing.status=401,f=>f.routing.status=429,f=>f.routing.delay=1000,
    f=>f.rule.data.attributes.name='changed-direct-rule'
  ];
  for(const change of changes){
    const f=await protectionFixture(change),r=await rehearse(f.a,f.store);
    assert.equal(r.phase,'uncertain');assert.equal(r.protected,true);assert.equal(r.recovered,false);assert.notEqual(r.releaseConfirmed,true);
    assert.deepEqual(f.actions.map(c=>c[0]),['reserve','cancel','stop','create','journal','restart']);
    assert.equal(f.actions.find(c=>c[0]==='cancel')[1],'dt-1');
    const spec=f.actions.find(c=>c[0]==='create')[1].data.attributes;
    assert.deepEqual(spec.monitor_identifier,{monitor_id:target.checkout});assert.equal(spec.scope,'*');assert.deepEqual(spec.schedule,{start:null});
    assert.equal(spec.mute_first_recovery_notification,true);assert.deepEqual(spec.notify_end_states,[]);assert.deepEqual(spec.notify_end_types,[]);
    assert.equal(f.journal().monitors[1].downtime,'replacement');assert.deepEqual(f.journal().monitors[0],f.state.monitors[0]);assert.deepEqual(f.journal().monitors[2],f.state.monitors[2]);
    assert.equal(f.monitors[1].state.groups['host:deskdrop-mmani-local'].status,'OK');
    assert.ok(f.calls.some(c=>c[0]==='downtime'&&c[1]==='replacement'));
    assert.ok(!JSON.stringify(r).includes('private-routing-canary'));
  }
});
test('unknown protection create is adopted once without retry while routing remains blocked, then full proof releases', async()=>{
  const f=await protectionFixture(f=>f.routing.status=401,{unknownCreate:true});
  let r=await rehearse(f.a,f.store);
  assert.equal(r.phase,'uncertain');assert.equal(r.createIntent,true);assert.equal(r.newDowntime,undefined);assert.equal(r.protected,false);
  r=await rehearse(f.a,f.store,{recover:true});
  assert.equal(r.phase,'uncertain');assert.equal(r.protected,true);assert.equal(r.newDowntime,'replacement');assert.equal(r.releaseConfirmed,undefined);
  assert.equal(f.journal().monitors[1].downtime,'replacement');
  r=await rehearse(f.a,f.store,{recover:true});
  assert.equal(r.phase,'uncertain');assert.equal(r.protected,true);
  f.routing.status=200;
  r=await rehearse(f.a,f.store,{recover:true});
  assert.equal(r.phase,'complete');assert.equal(r.protected,true);assert.equal(r.recovered,true);assert.equal(r.releaseConfirmed,true);
  for(const action of ['cancel','create','stop','restart','release'])assert.equal(f.actions.filter(c=>c[0]===action).length,1,action);
  assert.ok(f.actions.some(c=>c[0]==='fallback'));
  assert.deepEqual(f.journal().monitors[0],f.state.monitors[0]);assert.deepEqual(f.journal().monitors[2],f.state.monitors[2]);
});
test('recovery-only protection still refuses changed ownership, journals, downtimes and ambiguous creates', async()=>{
  const changes=[
    f=>f.monitors[1].query='wrong',f=>f.monitors[1].id=1,f=>f.monitors[1].tags.pop(),
    f=>f.readers.api.getMonitor=async()=>{throw new Error('unverifiable monitor');},
    f=>f.readers.operation=async()=>{throw new Error('changed runtime operation');},
    f=>{const read=f.readers.read;f.readers.read=async name=>name==='monitors.json'?{...await read(name),pending:'unknown'}:read(name);},
    f=>f.downtime.get('dt-0').data.attributes.status='canceled',
    f=>f.downtime.get('dt-1').data.attributes.monitor_identifier={monitor_id:target.availability},
    f=>f.downtime.get('dt-1').data.attributes.status='active',
    f=>f.readers.api.matches=async()=>['foreign']
  ];
  for(const change of changes){
    const f=await protectionFixture(async f=>{f.routing.status=401;await change(f);});
    const r=await rehearse(f.a,f.store);
    assert.equal(r.phase,'uncertain');assert.equal(r.protected,false);assert.notEqual(r.releaseConfirmed,true);
    assert.deepEqual(f.actions.map(c=>c[0]),['reserve','cancel','stop','restart']);assert.equal(f.journal().monitors[1].downtime,'dt-1');
  }
  for(const mutate of [f=>f.downtime.delete('replacement'),f=>f.downtime.get('replacement').data.attributes.message='foreign-run',f=>f.downtime.get('replacement').data.attributes.schedule.end='tomorrow',f=>{const d=structuredClone(f.downtime.get('replacement'));d.data.id='second';f.downtime.set('second',d);}]){
    const f=await protectionFixture(f=>f.routing.status=429,{unknownCreate:true});await rehearse(f.a,f.store);mutate(f);
    const r=await rehearse(f.a,f.store,{recover:true});
    assert.equal(r.phase,'uncertain');assert.equal(r.protected,false);assert.equal(f.actions.filter(c=>c[0]==='create').length,1);
    assert.equal(f.actions.filter(c=>c[0]==='cancel').length,1);assert.equal(f.journal().monitors[1].downtime,'dt-1');
    assert.ok(f.actions.some(c=>c[0]==='fallback'));assert.ok(!f.actions.some(c=>c[0]==='release'));
  }
});

test('routing failure cannot settle an unknown cancel or trigger a second cancel before definitive readback', async()=>{
  const f=await protectionFixture(()=>{});let cancellations=0;
  f.readers.api.cancelDowntime=async id=>{assert.equal(id,'dt-1');cancellations++;f.routing.status=401;throw new Error('lost cancel response');};
  let r=await rehearse(f.a,f.store);
  assert.equal(r.cancelIntent,true);assert.notEqual(r.canceled,true);assert.equal(r.phase,'uncertain');assert.equal(r.protected,false);
  r=await rehearse(f.a,f.store,{recover:true});
  assert.equal(r.phase,'uncertain');assert.equal(cancellations,1);assert.equal(f.actions.filter(c=>c[0]==='create').length,0);
  f.downtime.get('dt-1').data.attributes.status='canceled';
  r=await rehearse(f.a,f.store,{recover:true});
  assert.equal(r.phase,'uncertain');assert.equal(r.canceled,true);assert.equal(r.protected,true);assert.equal(r.releaseConfirmed,undefined);
  assert.equal(f.journal().monitors[1].downtime,'replacement');assert.equal(f.actions.filter(c=>c[0]==='create').length,1);
  f.routing.status=200;r=await rehearse(f.a,f.store,{recover:true});
  assert.equal(r.phase,'complete');assert.equal(r.releaseConfirmed,true);assert.equal(cancellations,1);
  assert.equal(f.actions.filter(c=>c[0]==='create').length,1);assert.ok(!f.actions.some(c=>c[0]==='stop'));assert.equal(r.alertObserved,undefined);
});
