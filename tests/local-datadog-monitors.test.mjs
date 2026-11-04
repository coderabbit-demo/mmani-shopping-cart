import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ensureZeroMatches, idDowntime, installationTag, inventory, inventoryHash, monitorDefinitions, ownedMonitor, selector, tagDowntime, verifyDowntime } from '../scripts/demo/datadog-monitors.mjs';

const templates = JSON.parse(await readFile(new URL('../deploy/datadog/local-monitors.json', import.meta.url)));
const owner = 'local_owner:1234567890abcdef1234567890abcdef';
const definitions = monitorDefinitions(templates, owner);
test('every monitor uses accepted query order, exact thresholds and scoped identity', () => {
  assert.equal(definitions.length, 3);
  for (const [index, m] of definitions.entries()) {
    assert.match(m.query, /\.by\("host"\)\.last\(2\)\.count_by_status\(\)$/);
    const changed = structuredClone(templates);
    changed[index].query = changed[index].query.replace('.by("host").last(2)', '.last(2).by("host")');
    assert.throws(() => monitorDefinitions(changed, owner));
    assert.deepEqual(m.options.thresholds, { critical: 2, ok: 2 });
    assert.deepEqual(m.tags, selector(owner));
  }
  assert.equal(definitions[2].options.notify_no_data, true);
  assert.equal(definitions[2].options.no_data_timeframe, 2);
  assert.match(installationTag(), /^local_owner:[a-f0-9]{32}$/);
});
test('inventory consumes every page and rejects duplicate or malformed results', async () => {
  const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]];
  assert.deepEqual((await inventory(async page => pages[page], 2)).map(x => x.id), [1, 2, 3]);
  await assert.rejects(inventory(async page => page ? [{ id: 1 }] : [{ id: 1 }, { id: 2 }], 2));
  await assert.rejects(inventory(async () => null));
});
test('zero-match and exact ownership checks reject collisions and changed monitors', () => {
  assert.throws(() => ensureZeroMatches([{ id: 5, tags: selector(owner) }], owner));
  assert.throws(() => ensureZeroMatches([{ id: 5, name: definitions[0].name, tags: [] }], owner));
  assert.doesNotThrow(() => ensureZeroMatches([{ id: 5, tags: ['env:local-demo'] }], owner));
  const existing = { ...definitions[0], id: 8 };
  assert.equal(ownedMonitor(existing, definitions[0]), 8);
  assert.throws(() => ownedMonitor({ ...existing, tags: existing.tags.slice(1) }, definitions[0]));
  assert.throws(() => ownedMonitor({ ...existing, query: '*' }, definitions[0]));
});
test('downtime selector is exact, AND-scoped, active and non-expiring', () => {
  const expected = tagDowntime(owner), attrs = expected.data.attributes;
  assert.deepEqual(attrs.monitor_identifier.monitor_tags, selector(owner));
  assert.equal(attrs.scope, '*');
  const response = { data: { id: 'dt-1', type: 'downtime', attributes: { ...attrs, status: 'active' } } };
  assert.equal(verifyDowntime(response, expected), 'dt-1');
  const altered = structuredClone(response); altered.data.attributes.monitor_identifier.monitor_tags.pop();
  assert.throws(() => verifyDowntime(altered, expected));
  const expired = structuredClone(response); expired.data.attributes.status = 'ended';
  assert.throws(() => verifyDowntime(expired, expected));
  const owned = idDowntime(8);
  const ownedResponse = { data: { id: 'dt-2', type: 'downtime', attributes: { ...owned.data.attributes, status: 'active' } } };
  assert.equal(verifyDowntime(ownedResponse, owned), 'dt-2');
  assert.throws(() => verifyDowntime(ownedResponse, idDowntime(9)));
});

function service() {
  const monitors = [], downtimes = new Map(), calls = [];
  let nextId = 1;
  const api = {
    async listMonitors(page, size) { return monitors.slice(page * size, (page + 1) * size); },
    async createDowntime(spec) { const id = `dt-${nextId++}`; calls.push(`create:${id}`); downtimes.set(id, { data: { id, type: 'downtime', attributes: { ...structuredClone(spec.data.attributes), status: 'active' } } }); return { data: { id } }; },
    async getDowntime(id) { return downtimes.get(id); },
    async createMonitor(spec) { assert.ok([...downtimes.values()].some(d => d.data.attributes.monitor_identifier.monitor_tags)); const monitor = { ...structuredClone(spec), id: nextId++ }; monitors.push(monitor); calls.push(`monitor:${monitor.id}`); return monitor; },
    async getMonitor(id) { return monitors.find(m => m.id === id); },
    async matches(id) { const m = monitors.find(x => x.id === id); return [...downtimes.values()].filter(d => { const a = d.data.attributes, t = a.monitor_identifier; return a.status === 'active' && (t.monitor_id === id || t.monitor_tags?.every(tag => m.tags.includes(tag))); }).map(d => d.data.id); },
    async cancelDowntime(id) { calls.push(`cancel:${id}`); downtimes.get(id).data.attributes.status = 'canceled'; },
  };
  return { api, monitors, downtimes, calls };
}
test('suppression exists before create and hands off to three owned ID downtimes', async () => {
  const { createSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const { api, calls, downtimes } = service(), state = {}, snapshots = [];
  await createSuppressed({ api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save: async s => snapshots.push(structuredClone(s)) });
  assert.equal(state.monitors.length, 3);
  assert.equal(state.tagDowntime, null);
  assert.equal(calls.filter(c => c.startsWith('monitor:')).length, 3);
  assert.equal(calls.filter(c => c.startsWith('cancel:')).length, 1);
  assert.ok(snapshots.some(s => s.pending === 'create-monitor'));
  assert.equal([...downtimes.values()].filter(d => d.data.attributes.status === 'active').length, 3);
});
test('unknown monitor write leaves pending journal and preserves initial suppression', async () => {
  const { createSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const { api, downtimes, calls } = service(), state = {}, snapshots = [];
  api.createMonitor = async () => { throw new Error('timeout'); };
  await assert.rejects(createSuppressed({ api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save: async s => snapshots.push(structuredClone(s)) }));
  assert.equal(state.pending, 'create-monitor');
  assert.equal(snapshots.at(-1).pending, 'create-monitor');
  assert.equal([...downtimes.values()][0].data.attributes.status, 'active');
  assert.equal(calls.some(c => c.startsWith('cancel:')), false);
  await assert.rejects(createSuppressed({ api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save: async () => {} }));
});
test('stale plans and lost cancellation outcomes never trigger a retry', async () => {
  const { createSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const fresh = service(), staleState = {};
  await assert.rejects(createSuppressed({ api: fresh.api, owner, definitions: templates, expectedInventory: '0'.repeat(64), state: staleState, save: async () => {} }));
  assert.deepEqual(fresh.calls, []);
  const scenario = service(), state = {};
  scenario.api.cancelDowntime = async () => { throw new Error('timeout'); };
  await assert.rejects(createSuppressed({ api: scenario.api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save: async () => {} }));
  assert.equal(state.pending, 'cancel-tag-downtime');
  assert.equal([...scenario.downtimes.values()].filter(d => d.data.attributes.status === 'active').length, 4);
  await assert.rejects(createSuppressed({ api: scenario.api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save: async () => {} }));
});
test('US3 client fixes host and endpoint and sanitizes API failures', async () => {
  const { makeApi } = await import('../scripts/demo/datadog-monitors.mjs');
  const { EventEmitter } = await import('node:events');
  let captured;
  function request(options, callback) {
    captured = options;
    const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => req.emit('error', new Error('private response'));
    req.end = () => queueMicrotask(() => { const response = new EventEmitter(); response.statusCode = 403; response.resume = () => {}; callback(response); });
    return req;
  }
  const api = makeApi({ apiKey: 'example-api', appKey: 'example-app', request });
  await assert.rejects(api.listMonitors(0, 100), error => error.message === 'Datadog API access denied');
  assert.equal(captured.hostname, 'api.us3.datadoghq.com');
  assert.equal(captured.path, '/api/v1/monitor?page=0&page_size=100');
  assert.equal(captured.headers['DD-API-KEY'], 'example-api');
  await assert.rejects(api.getMonitor('../../other'));
});
test('shutdown suppression creates only missing owned downtimes and fails closed on unknown status', async () => {
  const { createSuppressed, ensureSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const fixture = service(), state = { owner }, save = async () => {};
  await createSuppressed({ api: fixture.api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save });
  const before = fixture.calls.length;
  assert.equal(await ensureSuppressed({ api: fixture.api, state, definitions: templates, save }), true);
  assert.equal(fixture.calls.length, before);
  fixture.downtimes.get(state.monitors[0].downtime).data.attributes.status = 'scheduled';
  await assert.rejects(ensureSuppressed({ api: fixture.api, state, definitions: templates, save, allowCreate: true }));
  assert.equal(fixture.calls.length, before);
  fixture.downtimes.get(state.monitors[0].downtime).data.attributes.status = 'canceled';
  await ensureSuppressed({ api: fixture.api, state, definitions: templates, save, allowCreate: true });
  assert.equal(fixture.calls.length, before + 1);
});
test('notification enable requires a current approved window, scoped evidence and healthy groups', async () => {
  const { createSuppressed, enableOwned } = await import('../scripts/demo/datadog-monitors.mjs');
  const fixture = service(), state = { owner }, save = async () => {}, now = Date.now();
  await createSuppressed({ api: fixture.api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save });
  const approval = { approved: true, scopeVerified: true, owner: 'demo owner', usageLimit: 10, windowStart: new Date(now - 1000).toISOString(), windowEnd: new Date(now + 60000).toISOString(), healthyObservedAt: new Date(now).toISOString(), evidence: 'US3 checked by operator', monitorIds: state.monitors.map(x => x.id) };
  const original = fixture.api.getMonitor;
  fixture.api.getMonitor = async id => ({ ...await original(id), overall_state: 'OK', state: { groups: { 'host:deskdrop-mmani-local': { status: 'OK' } } } });
  const before = fixture.calls.length;
  await assert.rejects(enableOwned({ api: fixture.api, state, definitions: templates, save, approval: { ...approval, scopeVerified: false }, now }));
  await assert.rejects(enableOwned({ api: fixture.api, state, definitions: templates, save, approval: { ...approval, healthyObservedAt: new Date(now - 61000).toISOString() }, now }));
  assert.equal(fixture.calls.length, before);
  await enableOwned({ api: fixture.api, state, definitions: templates, save, approval, now });
  assert.equal(fixture.calls.filter(x => x.startsWith('cancel:')).length, 4);
});
test('read-only plan exposes intended scoped changes and binds the definition bytes', async () => {
  const { makePlan } = await import('../scripts/demo/datadog-monitors.mjs');
  const plan = makePlan(templates, owner, []);
  assert.equal(plan.changes.length, 3);
  assert.equal(plan.changes.every(x => x.action === 'create'), true);
  assert.equal(plan.inventoryHash, inventoryHash([]));
  assert.match(plan.definitionsHash, /^[a-f0-9]{64}$/);
  assert.throws(() => makePlan(templates, owner, [{ id: 1, tags: selector(owner) }]));
});
test('apply rejects a plan whose displayed changes or reviewed definition hash changed', async () => {
  const { makePlan, validatePlan } = await import('../scripts/demo/datadog-monitors.mjs');
  const plan = makePlan(templates, owner, []);
  assert.equal(validatePlan(plan, templates), plan);
  const altered = structuredClone(plan); altered.changes[0].query = '*';
  assert.throws(() => validatePlan(altered, templates));
  assert.throws(() => validatePlan({ ...plan, definitionsHash: '0'.repeat(64) }, templates));
});
test('unknown notification cancellation is journaled and never automatically retried', async () => {
  const { createSuppressed, enableOwned } = await import('../scripts/demo/datadog-monitors.mjs');
  const fixture = service(), state = { owner }, now = Date.now(), saves = [];
  const save = async value => saves.push(structuredClone(value));
  await createSuppressed({ api: fixture.api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save });
  const original = fixture.api.getMonitor;
  fixture.api.getMonitor = async id => ({ ...await original(id), overall_state: 'OK', state: { groups: { 'host:deskdrop-mmani-local': { status: 'OK' } } } });
  const approval = { approved: true, scopeVerified: true, owner: 'demo owner', usageLimit: 10, windowStart: new Date(now - 1000).toISOString(), windowEnd: new Date(now + 60000).toISOString(), healthyObservedAt: new Date(now).toISOString(), evidence: 'verified', monitorIds: state.monitors.map(m => m.id) };
  let attempts = 0; fixture.api.cancelDowntime = async () => { attempts++; throw new Error('timeout'); };
  await assert.rejects(enableOwned({ api: fixture.api, state, definitions: templates, save, approval, now }));
  assert.match(state.pending, /^enable:/);
  assert.equal(saves.at(-1).pending, state.pending);
  await assert.rejects(enableOwned({ api: fixture.api, state, definitions: templates, save, approval, now }));
  assert.equal(attempts, 1);
});
test('help and definitions do not contact Datadog or expose inherited secrets', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  for (const name of ['help', 'definitions']) {
    const result = await run(process.execPath, ['scripts/demo/datadog-monitors.mjs', name], { env: { ...process.env, DD_API_KEY: 'synthetic-secret-value', DD_APP_KEY: 'synthetic-app-value' } });
    assert.equal(result.stdout.includes('synthetic-secret-value'), false);
    assert.equal(result.stdout.includes('synthetic-app-value'), false);
  }
});
test('saving a reviewed plan preserves existing files and rejects unsafe paths', async () => {
  const { makePlan, savePlan } = await import('../scripts/demo/datadog-monitors.mjs');
  const { mkdtemp, readFile, realpath, rm, symlink, unlink } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'deskdrop-plan-')));
  try {
    const plan = makePlan(templates, owner, []);
    await savePlan(dir, plan, templates);
    const file = join(dir, 'monitor-plan.json');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).owner, owner);
    await assert.rejects(savePlan(dir, plan, templates));
    await unlink(file); await symlink('/dev/null', file);
    await assert.rejects(savePlan(dir, plan, templates));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
