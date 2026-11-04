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

test('US3 request deadline bounds a trickling response and a pre-response stall', { timeout: 4000 }, async () => {
  const { makeApi } = await import('../scripts/demo/datadog-monitors.mjs');
  const http = await import('node:http');
  let mode = 'trickle';
  const server = http.createServer((_req, res) => {
    if (mode === 'trickle') { res.writeHead(200); res.write('{'); const timer = setInterval(() => res.write(' '), 30); res.on('close', () => clearInterval(timer)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = (options, callback) => http.request({ hostname: '127.0.0.1', port: server.address().port, method: options.method, path: options.path }, callback);
  try {
    const api = makeApi({ apiKey: 'fixture-api', appKey: 'fixture-app', request, deadlineMs: 160 });
    for (const current of ['trickle', 'stall']) {
      mode = current;
      const started = Date.now();
      await assert.rejects(Promise.race([api.listMonitors(0, 100), new Promise((_, reject) => setTimeout(() => reject(new Error('fixture deadline exceeded')), 700))]), error => error.message === 'Datadog request outcome unknown');
      assert.ok(Date.now() - started < 650);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('read-only suppression match propagation is bounded before any next write', async () => {
  const { createSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const fixture = service(), state = {}, original = fixture.api.matches;
  let reads = 0, sleeps = 0;
  fixture.api.matches = async id => { reads++; if (reads <= 2) { assert.equal(fixture.calls.filter(c => c.startsWith('create:')).length, 1); return []; } return original(id); };
  await createSuppressed({ api: fixture.api, owner, definitions: templates, expectedInventory: inventoryHash([]), state, save: async () => {}, sleep: async () => { sleeps++; } });
  assert.equal(reads >= 3, true); assert.equal(sleeps, 2);
  assert.equal(fixture.calls.filter(c => c.startsWith('monitor:')).length, 3);
  assert.equal(state.tagDowntime, null);
});

async function partiallyProtectedFixture(stage = 'id') {
  const { createSuppressed, makePlan } = await import('../scripts/demo/datadog-monitors.mjs');
  const fixture = service(), state = { owner, monitors: [] }, plan = makePlan(templates, owner, []), actualMatches = fixture.api.matches;
  fixture.api.matches = async id => {
    const matches = await actualMatches(id);
    return stage === 'tag' ? [] : matches.filter(value => value === state.tagDowntime);
  };
  await assert.rejects(createSuppressed({ api: fixture.api, owner, definitions: templates, expectedInventory: plan.inventoryHash, state, save: async () => {}, sleep: async () => {} }), stage === 'tag' ? /Tag suppression not effective/ : /ID suppression not effective/);
  fixture.api.matches = actualMatches;
  return { ...fixture, state, plan };
}

test('resume revalidates and preserves a known partial handoff, creating only missing resources', async () => {
  const { resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  for (const stage of ['tag', 'id']) {
    const fixture = await partiallyProtectedFixture(stage), { api, state, plan, calls, downtimes } = fixture;
    const initial = state.tagDowntime, first = structuredClone(state.monitors[0]);
    assert.equal(state.pending, null);
    assert.equal(state.monitors.length, 1);
    assert.equal(!!first.downtime, stage === 'id');
    await resumeSuppressed({ api, state, plan, definitions: templates, save: async () => {}, sleep: async () => {} });
    assert.equal(state.monitors.length, 3);
    assert.equal(state.monitors[0].id, first.id);
    if (first.downtime) assert.equal(state.monitors[0].downtime, first.downtime);
    assert.equal(calls.filter(x => x.startsWith('monitor:')).length, 3);
    assert.equal(calls.filter(x => x.startsWith('create:')).length, 4);
    assert.deepEqual(calls.filter(x => x.startsWith('cancel:')), [`cancel:${initial}`]);
    assert.equal([...downtimes.values()].filter(x => x.data.attributes.status === 'active').length, 3);
    assert.equal(state.tagDowntime, null);
  }
});

test('resume refuses pending, stale, unowned, changed and unprotected states before writes', async () => {
  const { resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const variants = [
    { name: 'pending', change: f => { f.state.pending = 'create-monitor'; } },
    { name: 'missing journal marker', change: f => { delete f.state.pending; } },
    { name: 'transition', change: f => { f.state.transition = 'enabling'; } },
    { name: 'unknown field', change: f => { f.state.unknown = true; } },
    { name: 'duplicate id', change: f => { f.state.monitors.push({ ...f.state.monitors[0], name: definitions[1].name }); } },
    { name: 'changed plan', change: f => { f.plan.changes[0].query = '*'; } },
    { name: 'wrong owner', change: f => { f.state.owner = 'local_owner:00000000000000000000000000000000'; } },
    { name: 'reserved name collision', change: f => { f.monitors.push({ id: 99, name: definitions[1].name, tags: [], query: 'other' }); } },
    { name: 'unexpected owner match', change: f => { f.monitors.push({ id: 99, name: 'foreign', tags: selector(owner), query: 'other' }); } },
    { name: 'stale inventory', change: f => { f.monitors.push({ id: 99, name: 'foreign', tags: [], query: 'other' }); } },
    { name: 'incomplete inventory details', change: f => { f.monitors.push({ id: 99 }); } },
    { name: 'changed monitor query', change: f => { f.monitors[0].query = '*'; } },
    { name: 'changed monitor option', change: f => { f.monitors[0].options.include_tags = false; } },
    { name: 'extra threshold', change: f => { f.monitors[0].options.thresholds.warning = 1; } },
    { name: 'tag downtime inactive', change: f => { f.downtimes.get(f.state.tagDowntime).data.attributes.status = 'canceled'; } },
    { name: 'tag selector changed', change: f => { f.downtimes.get(f.state.tagDowntime).data.attributes.monitor_identifier.monitor_tags.pop(); } },
    { name: 'id selector changed', change: f => { f.downtimes.get(f.state.monitors[0].downtime).data.attributes.monitor_identifier.monitor_id = 999; } },
    { name: 'unexpected downtime match', change: f => { const original = f.api.matches; f.api.matches = async id => [...await original(id), 'foreign-downtime']; } },
    { name: 'tag match missing', change: f => { f.api.matches = async () => []; } },
    { name: 'read outcome unknown', change: f => { f.api.matches = async () => { throw new Error('read timeout'); }; } },
  ];
  for (const variant of variants) {
    const f = await partiallyProtectedFixture(); variant.change(f);
    const before = f.calls.length;
    await assert.rejects(resumeSuppressed({ api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async () => {}, sleep: async () => {} }), undefined, variant.name);
    assert.equal(f.calls.length, before, `${variant.name} must not mutate`);
    assert.equal(f.calls.some(x => x.startsWith('cancel:')), false, variant.name);
  }
});

test('unknown resume write is journaled and never automatically retried', async () => {
  const { resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const f = await partiallyProtectedFixture(); let attempts = 0; const snapshots = [];
  f.api.createMonitor = async () => { attempts++; throw new Error('unknown response'); };
  const args = { api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async s => snapshots.push(structuredClone(s)), sleep: async () => {} };
  await assert.rejects(resumeSuppressed(args));
  assert.equal(f.state.pending, 'create-monitor'); assert.equal(snapshots.at(-1).pending, 'create-monitor');
  await assert.rejects(resumeSuppressed(args), /Reconciliation required/);
  assert.equal(attempts, 1);
  assert.equal(f.calls.some(x => x.startsWith('cancel:')), false);
});

test('readback failures are bounded, never retry an error, and expose only safe classes', async () => {
  const { resumeSuppressed, safeMonitorError } = await import('../scripts/demo/datadog-monitors.mjs');
  const f = await partiallyProtectedFixture(); let attempts = 0, sleeps = 0;
  f.api.matches = async () => { attempts++; return []; };
  const before = f.calls.length;
  await assert.rejects(resumeSuppressed({ api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async () => {}, sleep: async () => { sleeps++; } }), /Tag suppression not effective/);
  assert.equal(attempts, 4); assert.equal(sleeps, 3); assert.equal(f.calls.length, before);
  attempts = 0; sleeps = 0;
  f.api.matches = async () => { attempts++; throw new Error('private body'); };
  await assert.rejects(resumeSuppressed({ api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async () => {}, sleep: async () => { sleeps++; } }));
  assert.equal(attempts, 1); assert.equal(sleeps, 0); assert.equal(f.calls.length, before);
  assert.equal(safeMonitorError(new Error('Tag suppression not effective')), 'Tag suppression not effective');
  assert.equal(safeMonitorError(new Error('private body')), 'Monitor operation failed; inspect owned state and journal');
});

test('partial reconciliation is read-only and returns only verified ownership and remaining names', async () => {
  const { inspectSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const f = await partiallyProtectedFixture(), before = f.calls.length, state = structuredClone(f.state);
  const result = await inspectSuppressed({ api: f.api, state: f.state, plan: f.plan, definitions: templates, sleep: async () => {} });
  assert.equal(result.status, 'reconciled');
  assert.equal(result.owner, owner); assert.equal(result.tagDowntime, state.tagDowntime);
  assert.equal(result.inventoryHash, f.plan.inventoryHash); assert.equal(result.definitionsHash, f.plan.definitionsHash);
  assert.deepEqual(result.monitors, state.monitors);
  assert.deepEqual(result.remaining, [definitions[1].name, definitions[2].name]);
  assert.deepEqual(f.state, state); assert.equal(f.calls.length, before);
  assert.equal(JSON.stringify(result).includes('fixture-api'), false);
});

test('unknown ID downtime write in recovery stays pending and is not repeated', async () => {
  const { resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const f = await partiallyProtectedFixture('tag'); let attempts = 0;
  f.api.createDowntime = async () => { attempts++; throw new Error('timeout'); };
  const args = { api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async () => {}, sleep: async () => {} };
  await assert.rejects(resumeSuppressed(args));
  assert.equal(f.state.pending, 'create-id-downtime');
  await assert.rejects(resumeSuppressed(args), /Reconciliation required/);
  assert.equal(attempts, 1);
  assert.equal(f.calls.some(x => x.startsWith('cancel:')), false);
});

test('downtime match pagination obeys a total request deadline', { timeout: 3000 }, async () => {
  const { makeApi } = await import('../scripts/demo/datadog-monitors.mjs');
  const http = await import('node:http'); let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    const offset = Number(new URL(req.url, 'http://fixture.test').searchParams.get('page[offset]'));
    setTimeout(() => { if (!res.destroyed) res.end(JSON.stringify({ data: Array.from({ length: 100 }, (_, i) => ({ id: `dt-${offset + i}` })) })); }, 55);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = (options, callback) => http.request({ hostname: '127.0.0.1', port: server.address().port, method: options.method, path: options.path }, callback);
  try {
    const api = makeApi({ apiKey: 'fixture-api', appKey: 'fixture-app', request, deadlineMs: 180 });
    const started = Date.now();
    await assert.rejects(api.matches(7), error => ['Datadog request outcome unknown', 'Downtime match read deadline exceeded'].includes(error.message));
    assert.ok(requests >= 2); assert.ok(Date.now() - started < 900);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('full monitor inventory has a bounded total pagination deadline', { timeout: 3000 }, async () => {
  const { makeApi } = await import('../scripts/demo/datadog-monitors.mjs');
  const http = await import('node:http'); let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    const page = Number(new URL(req.url, 'http://fixture.test').searchParams.get('page'));
    setTimeout(() => { if (!res.destroyed) res.end(JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: page * 100 + i + 1 })))); }, 55);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = (options, callback) => http.request({ hostname: '127.0.0.1', port: server.address().port, method: options.method, path: options.path }, callback);
  try {
    const api = makeApi({ apiKey: 'fixture-api', appKey: 'fixture-app', request, deadlineMs: 1000 });
    const started = Date.now();
    await assert.rejects(inventory(api.listMonitors, 100, { deadlineMs: 180 }), error => ['Datadog request outcome unknown', 'Inventory read deadline exceeded'].includes(error.message));
    assert.ok(requests >= 2); assert.ok(Date.now() - started < 900);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('downtime match pagination rejects duplicate identities', { timeout: 3000 }, async () => {
  const { makeApi } = await import('../scripts/demo/datadog-monitors.mjs');
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    const offset = Number(new URL(req.url, 'http://fixture.test').searchParams.get('page[offset]'));
    res.end(JSON.stringify({ data: offset ? [{ id: 'dt-0' }] : Array.from({ length: 100 }, (_, i) => ({ id: `dt-${i}` })) }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = (options, callback) => http.request({ hostname: '127.0.0.1', port: server.address().port, method: options.method, path: options.path }, callback);
  try {
    const api = makeApi({ apiKey: 'fixture-api', appKey: 'fixture-app', request });
    await assert.rejects(api.matches(7), /Incomplete downtime matches/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('resume preserves the original nonempty inventory and detects unrelated changes', async () => {
  const { createSuppressed, makePlan, resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const f = service(), foreign = { id: 900, name: 'unrelated', tags: ['service:other'], query: 'other.query' };
  f.monitors.push(foreign);
  const plan = makePlan(templates, owner, f.monitors), state = { owner, monitors: [] }, original = f.api.matches;
  f.api.matches = async () => [];
  await assert.rejects(createSuppressed({ api: f.api, owner, definitions: templates, expectedInventory: plan.inventoryHash, state, save: async () => {}, sleep: async () => {} }), /Tag suppression not effective/);
  f.api.matches = original;
  const before = f.calls.length;
  foreign.query = 'changed.query';
  await assert.rejects(resumeSuppressed({ api: f.api, state, plan, definitions: templates, save: async () => {}, sleep: async () => {} }), /Plan is stale/);
  assert.equal(f.calls.length, before);
  foreign.query = 'other.query';
  await resumeSuppressed({ api: f.api, state, plan, definitions: templates, save: async () => {}, sleep: async () => {} });
  assert.equal(f.monitors.find(m => m.id === foreign.id), foreign);
  assert.equal(foreign.query, 'other.query'); assert.equal(state.monitors.length, 3);
});

test('unknown initial tag downtime write remains pending and cannot be resumed or recreated', async () => {
  const { createSuppressed, makePlan, resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const f = service(), plan = makePlan(templates, owner, []), state = { owner, monitors: [] }; let attempts = 0;
  f.api.createDowntime = async () => { attempts++; throw new Error('timeout'); };
  const args = { api: f.api, owner, definitions: templates, expectedInventory: plan.inventoryHash, state, save: async () => {}, sleep: async () => {} };
  await assert.rejects(createSuppressed(args));
  assert.equal(state.pending, 'create-tag-downtime');
  await assert.rejects(createSuppressed(args), /Reconciliation required/);
  await assert.rejects(resumeSuppressed({ ...args, plan }), /Reconciliation required/);
  assert.equal(attempts, 1); assert.equal(f.monitors.length, 0);
});

test('recovery rechecks saved plan, definitions and journal before mutations', async () => {
  const { inputGuard, resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  for (const change of ['plan', 'definitions', 'state']) {
    const f = await partiallyProtectedFixture(); let savedPlan = structuredClone(f.plan), savedDefinitions = structuredClone(templates), savedState = structuredClone(f.state);
    const guard = inputGuard(f.plan, f.state, templates, { readPlan: async () => savedPlan, readDefinitions: async () => savedDefinitions, readState: async () => savedState });
    await guard();
    if (change === 'plan') savedPlan.changes[0].query = '*';
    if (change === 'definitions') savedDefinitions[0].query = '*';
    if (change === 'state') savedState.pending = 'create-monitor';
    const before = f.calls.length;
    await assert.rejects(resumeSuppressed({ api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async () => {}, sleep: async () => {}, recheck: guard }), change === 'state' ? /Monitor state changed/ : /Plan changed/);
    assert.equal(f.calls.length, before, `${change} must not mutate`);
  }
});

test('recovery guard accepts each confirmed journal update during a complete handoff', async () => {
  const { inputGuard, resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const f = await partiallyProtectedFixture(); let savedState = structuredClone(f.state), checks = 0;
  const guard = inputGuard(f.plan, f.state, templates, { readPlan: async () => structuredClone(f.plan), readDefinitions: async () => structuredClone(templates), readState: async () => { checks++; return structuredClone(savedState); } });
  await resumeSuppressed({ api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async state => { savedState = structuredClone(state); }, sleep: async () => {}, recheck: guard });
  assert.ok(checks >= 4); assert.equal(f.state.tagDowntime, null); assert.deepEqual(savedState, f.state);
});

test('invalid or reused downtime IDs leave recovery pending without retry', async () => {
  const { resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  for (const value of ['../../unexpected', 'same-as-tag']) {
    const f = await partiallyProtectedFixture('tag'); let attempts = 0;
    f.api.createDowntime = async () => { attempts++; return { data: { id: value === 'same-as-tag' ? f.state.tagDowntime : value } }; };
    const args = { api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async () => {}, sleep: async () => {} };
    await assert.rejects(resumeSuppressed(args), /Downtime create outcome unknown/);
    assert.equal(f.state.pending, 'create-id-downtime');
    await assert.rejects(resumeSuppressed(args), /Reconciliation required/);
    assert.equal(attempts, 1); assert.equal(f.calls.some(x => x.startsWith('cancel:')), false);
  }
});

test('a reused monitor ID leaves creation pending and cannot be retried', async () => {
  const { resumeSuppressed } = await import('../scripts/demo/datadog-monitors.mjs');
  const f = await partiallyProtectedFixture(); let attempts = 0;
  f.api.createMonitor = async spec => { attempts++; return { ...structuredClone(spec), id: f.state.monitors[0].id }; };
  const args = { api: f.api, state: f.state, plan: f.plan, definitions: templates, save: async () => {}, sleep: async () => {} };
  await assert.rejects(resumeSuppressed(args), /Monitor create outcome unknown/);
  assert.equal(f.state.pending, 'create-monitor');
  await assert.rejects(resumeSuppressed(args), /Reconciliation required/);
  assert.equal(attempts, 1); assert.equal(f.calls.some(x => x.startsWith('cancel:')), false);
});
