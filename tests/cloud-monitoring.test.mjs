import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduler, heartbeat, datagram, boundedRun, dockerTransport } from '../scripts/demo/cloud-runtime.mjs';
const flush = () => new Promise(r => setImmediate(r));
test('30s cadence has no overlap or catch-up storm; heartbeat is independent', async () => {
  let time = 0, release; const calls = [], reports = [], health = [];
  const hung = new Promise(r => { release = r; });
  const s = scheduler({ now: () => time, setTimer: () => 1, clearTimer() {}, run: async name => { calls.push(name); if (name === 'checkout') await hung; return true; }, report: async (...a) => reports.push(a), health: async v => health.push(v) });
  await flush(); time = 30000; s.tick(); await flush();
  assert.equal(calls.filter(x => x === 'checkout').length, 1);
  assert.equal(heartbeat({ healthy: false, updated: time }, time), 2);
  assert.equal(heartbeat({ healthy: true, updated: time }, time), 0);
  assert.equal(heartbeat({ healthy: true, updated: 0 }, 65001), 2);
  time = 300000; s.tick(); await flush();
  assert.equal(calls.filter(x => x === 'availability').length, 3);
  release(); await flush(); await s.stop(); assert.equal(health.at(-1), false);
});
test('telemetry failure makes controller unhealthy and blocks replacement', async () => {
  let time = 0, count = 0;
  const s = scheduler({ now: () => time, setTimer: () => 1, clearTimer() {}, run: async () => { count++; return true; }, report: async () => { throw Error('intake down'); }, health: async () => {} });
  await flush(); assert.equal(s.status().healthy, false); time = 30000; s.tick(); await flush(); assert.equal(count, 2); await s.stop();
});
test('cloud telemetry carries only approved identity/status', () => {
  const owner = `cloud_owner:${'a'.repeat(32)}`;
  assert.ok(datagram(owner, 'checkout', 2).toString().includes(owner));
  assert.throws(() => datagram(owner, 'checkout', 1)); assert.throws(() => datagram(owner, 'other', 0));
});
test('completed children clear deadlines; rejected execution cannot be reported healthy', async () => {
  let stopped = false;
  const child = { wait: async () => 0, term: async () => { stopped = true; }, remove: async () => {}, running: async () => false };
  assert.equal(await boundedRun(child), true);
  assert.equal(stopped, true);
  assert.equal(await boundedRun({ ...child, wait: async () => { throw Error('unknown child'); } }), false);
  await assert.rejects(boundedRun({ ...child, running: async () => true }));
});
test('Docker transport rejects non-container operations before contacting socket', async () => {
  let called = false; const call = dockerTransport({ request: () => { called = true; } });
  for (const endpoint of ['/images/create', '/v1.45/images/create', '/v1.45/containers/../../images/create']) await assert.rejects(call('POST', endpoint));
  assert.equal(called, false);
});

test('hung real child is terminated, removed and cannot overlap its replacement', async () => {
  const { spawn } = await import('node:child_process');
  const processChild = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const exited = new Promise(resolve => processChild.once('exit', code => resolve(code)));
  const actions = [];
  try {
    const result = await boundedRun({ wait: () => exited, term: async () => { actions.push('term'); processChild.kill('SIGTERM'); }, remove: async () => { actions.push('remove'); if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill('SIGKILL'); await exited; }, running: async () => processChild.exitCode === null && processChild.signalCode === null }, { setTimer: (fn, ms) => setTimeout(fn, ms / 100), clearTimer: clearTimeout });
    assert.equal(result, false); assert.deepEqual(actions, ['term', 'remove']);
    assert.equal(unrelated.exitCode, null); assert.equal(unrelated.signalCode, null);
  } finally { processChild.kill('SIGKILL'); unrelated.kill('SIGTERM'); }
});
