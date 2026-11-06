import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recover, attempt, limits } from '../scripts/demo/cloud-trigger.mjs';

function fixture(overrides = {}) {
  const calls = [], saves = [], intents = [];
  const record = { run: '11111111-1111-4111-8111-111111111111', phase: 'admitted' };
  const adapter = Object.fromEntries(['protect', 'restoreApp', 'fence', 'verify', 'suppressed', 'release'].map(name => [name, async (...args) => { calls.push(name); return overrides[name] ? overrides[name](...args) : true; }]));
  const store = { load: async () => record, save: async value => saves.push(value), intent: async value => intents.push(value) };
  return { adapter, store, calls, saves, intents };
}
test('recovery restores owned app despite failed suppression and retains uncertainty', async () => {
  const f = fixture({ protect: () => { throw Error('provider'); }, suppressed: () => false });
  const result = await recover(f.adapter, f.store);
  assert.equal(result.app, true);
  assert.equal(result.outcome, 'reconciliation-required');
  assert.deepEqual(f.calls, ['protect', 'restoreApp', 'fence', 'verify', 'suppressed']);
  assert.equal(f.saves.at(-1).phase, 'uncertain');
  assert.equal(f.intents[1].operation, 'restore-app');
  assert.equal(result.deadline - result.started, 360000);
});
test('recovery releases only after all independent confirmations', async () => {
  const f = fixture();
  const result = await recover(f.adapter, f.store);
  assert.equal(result.outcome, 'restored');
  assert.deepEqual(f.calls, ['protect', 'restoreApp', 'fence', 'verify', 'suppressed', 'release']);
  assert.equal(f.saves.at(-1).phase, 'complete');
});
test('unknown late mutation cannot release reservation even with healthy app', async () => {
  const f = fixture({ fence: () => false });
  const result = await recover(f.adapter, f.store);
  assert.equal(result.app, true);
  assert.equal(result.released, false);
  assert.deepEqual(f.calls, ['protect', 'restoreApp', 'fence']);
});
test('wrong app or source and uncertain release retain evidence', async () => {
  for (const key of ['restoreApp', 'verify', 'release']) {
    const f = fixture({ [key]: () => false });
    assert.equal((await recover(f.adapter, f.store)).outcome, 'reconciliation-required');
    assert.equal(f.saves.at(-1).phase, 'uncertain');
  }
});
test('hung operation aborts within bound; late success is not confirmation', async () => {
  let signal;
  const result = await attempt(s => { signal = s; return new Promise(resolve => setTimeout(() => resolve(true), 40)); }, 5);
  assert.equal(result.confirmed, false);
  assert.equal(signal.aborted, true);
  assert.equal(limits.alert, 180000);
});
