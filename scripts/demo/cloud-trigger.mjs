export const limits = Object.freeze({ alert: 180000, recovery: 360000, operation: 10000 });

export async function attempt(operation, milliseconds) {
  if (milliseconds <= 0) return { confirmed: false };
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)).then(value => ({ confirmed: value === true })).catch(() => ({ confirmed: false })),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ confirmed: false }); }, milliseconds); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}

// The caller holds the installation execution lock until adapter cleanup is confirmed.
export async function recover(adapter, store, { now = Date.now } = {}) {
  const record = await store.load();
  if (!record || !/^[a-f0-9-]{36}$/.test(record.run ?? '') || !['admitted', 'recovering', 'uncertain'].includes(record.phase)) throw new Error('Recovery receipt invalid');
  const started = now();
  const deadline = started + limits.recovery;
  const result = { run: record.run, started, deadline, suppression: false, app: false, health: false, released: false, fenced: false };
  const save = async () => store.save({ ...record, phase: 'recovering', recovery: { ...result } });
  const call = async (name, operation, cap = limits.operation) => {
    await store.intent({ run: record.run, operation: name, deadline });
    return (await attempt(operation, Math.min(cap, Math.max(0, deadline - now())))).confirmed;
  };
  await save();
  result.suppression = await call('restore-suppression', signal => adapter.protect(record, signal));
  await save();
  // The adapter validates exact owned app/source on every restoration, independently of provider health.
  result.app = await call('restore-app', signal => adapter.restoreApp(record, signal), 30000);
  await save();
  result.fenced = await call('fence-outstanding', signal => adapter.fence(record, signal));
  if (result.fenced) {
    result.health = await call('verify-health-source', signal => adapter.verify(record, signal));
    result.suppression = await call('verify-suppression', signal => adapter.suppressed(record, signal));
    if (result.app && result.health && result.suppression) result.released = await call('release-reservation', signal => adapter.release(record, signal));
  }
  const complete = result.app && result.health && result.suppression && result.fenced && result.released;
  await store.save({ ...record, phase: complete ? 'complete' : 'uncertain', recovery: { ...result } });
  return { ...result, outcome: complete ? 'restored' : 'reconciliation-required' };
}

import { Journal, definitions, owned, reconcile, protection, verifyProtection, makeTriggerApi, selector } from './cloud-monitors.mjs';
import { validateRuntime, inspectTarget, verifyTarget, dockerTransport } from './cloud-runtime.mjs';
import { constants } from 'node:fs';
import { open, rename, unlink, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

const triggerDirectory = '/var/lib/deskdrop/trigger';
const idPattern = /^[A-Za-z0-9-]{1,128}$/;
const same = isDeepStrictEqual;
const fail = () => { throw new Error('Trigger reconciliation required'); };

export class TriggerStore extends Journal {
  constructor(directory = triggerDirectory, uid = 0) { super(directory, uid); }
  async load(name = 'operation.json') {
    if (!['operation.json', 'lease.json', 'route.json'].includes(name)) fail();
    await this.directorySafe();
    const f = await open(`${this.directory}/${name}`, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const st = await f.stat();
      if (!st.isFile() || st.uid !== this.uid || st.nlink !== 1 || (st.mode & 0o777) !== 0o600 || st.size > 32768) fail();
      return JSON.parse(await f.readFile('utf8'));
    } finally { await f.close(); }
  }
  async save(value) {
    await this.directorySafe();
    try { await this.load(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const text = JSON.stringify(value); if (Buffer.byteLength(text) > 32768) fail();
    const temp = `${this.directory}/.operation-${randomUUID()}`;
    const f = await open(temp, 'wx', 0o600);
    try {
      await f.writeFile(text); await f.sync(); await rename(temp, `${this.directory}/operation.json`);
      const d = await open(this.directory, constants.O_RDONLY); try { await d.sync(); } finally { await d.close(); }
    } finally { await f.close(); await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
}

export function validateOperation(r, config) {
  if (r?.schema !== 1 || !/^[a-f0-9-]{36}$/.test(r.run ?? '') || !same(r.identity, config) || !['prepared','window','stopped','observed','recovering','complete','uncertain'].includes(r.phase) || !idPattern.test(r.broad ?? '') || !r.temporary || Object.keys(r.temporary).some(k => !['availability','checkout','heartbeat'].includes(k)) || Object.values(r.temporary).some(v => !idPattern.test(v)) || !/^[a-f0-9]{64}$/.test(r.appId ?? '') || !Number.isSafeInteger(r.started) || typeof r.unknownRuntime !== 'boolean') fail();
  if (r.pending && (!['create','delete','broad'].includes(r.pending.kind) || !['availability','checkout','heartbeat','broad'].includes(r.pending.check))) fail();
  return r;
}

export function monitorDowntime(id, run, check) {
  if (!Number.isSafeInteger(id) || id < 1 || !/^[a-f0-9-]{36}$/.test(run) || !['availability','checkout','heartbeat'].includes(check)) fail();
  return { data: { type: 'downtime', attributes: { monitor_identifier: { monitor_id: id }, scope: '*', schedule: {}, message: `DeskDrop protected trigger ${run} ${check}`, mute_first_recovery_notification: true, notify_end_states: [], notify_end_types: [] } } };
}
function verifyTemporary(row, expected) {
  const a = row?.attributes, e = expected.data.attributes;
  if (!idPattern.test(row?.id ?? '') || row.type !== 'downtime' || a?.status !== 'active' || a.scope !== '*' || !same(a.monitor_identifier, e.monitor_identifier) || a.message !== e.message || a.schedule?.end || a.schedule?.recurrences?.length || a.schedule?.current_downtime?.end || a.mute_first_recovery_notification !== true || !same(a.notify_end_states, []) || !same(a.notify_end_types, [])) fail();
  return row.id;
}
export async function downtimeInventory(api) {
  async function scan() {
    const rows = [], ids = new Set(); let total;
    for (let offset = 0; offset <= 10000; offset += 100) {
      const r = await api.call('GET', `/api/v2/downtime?page%5Boffset%5D=${offset}&page%5Blimit%5D=100`);
      const count = r.meta?.page?.total_filtered_count;
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000 || (total !== undefined && total !== count) || !Array.isArray(r.data) || r.data.length !== Math.min(100, Math.max(0, count - offset))) fail();
      total = count;
      for (const row of r.data) { if (!idPattern.test(row?.id ?? '') || ids.has(row.id)) fail(); ids.add(row.id); rows.push(row); }
      if (rows.length === total) return rows.sort((a,b) => a.id.localeCompare(b.id));
    }
    fail();
  }
  const rows = await scan(); if (!same(rows, await scan())) fail(); return rows;
}
export async function effectiveProtection(api, id, expected) {
  const r = await api.call('GET', `/api/v2/monitor/${id}/downtime_matches?page%5Boffset%5D=0&page%5Blimit%5D=100`);
  if (!Array.isArray(r.data) || r.meta?.page?.total_filtered_count !== expected.length || r.data.length !== expected.length || new Set(r.data.map(x => x.id)).size !== expected.length || r.data.some(x => !expected.includes(x.id) || x.attributes?.scope !== '*' || x.attributes?.end)) fail();
}

// Every write is preceded by durable intent. An absent unknown POST is never retried.
export function protectionHandoff(state, api, saveState, record, store) {
  const monitor = check => { const m = state.monitors.find(m => m.name === `[MMANI cloud] DeskDrop ${check}`); if (!m) fail(); return m.id; };
  const save = () => store.save(record);
  const expected = check => monitorDowntime(monitor(check), record.run, check);
  async function pending() {
    if (!record.pending) return;
    const p = record.pending, rows = await downtimeInventory(api);
    if (p.kind === 'create') {
      const found = rows.filter(r => r.attributes?.message === expected(p.check).data.attributes.message && r.attributes?.status === 'active');
      if (found.length !== 1) fail();
      record.temporary[p.check] = verifyTemporary(found[0], expected(p.check));
    } else if (p.kind === 'broad') {
      const found = rows.filter(r => r.attributes?.status === 'active' && r.attributes?.monitor_identifier?.monitor_tags?.includes(state.owner));
      if (found.length !== 1) fail();
      record.broad = verifyProtection(found[0], state.owner);
    } else {
      const found = rows.find(r => r.id === p.id);
      if (!found || found.attributes?.status !== 'canceled') fail();
      if (p.check !== 'broad') delete record.temporary[p.check];
    }
    record.pending = null; await save();
  }
  async function create(check) {
    record.pending = { kind: 'create', check }; await save();
    await api.call('POST', '/api/v2/downtime', expected(check)); await pending();
  }
  async function cancel(check, id) {
    const row = (await api.call('GET', `/api/v2/downtime/${id}`)).data;
    if (check === 'broad') verifyProtection(row, state.owner); else verifyTemporary(row, expected(check));
    record.pending = { kind: 'delete', check, id }; await save();
    await api.call('DELETE', `/api/v2/downtime/${id}`); await pending();
  }
  async function broad() {
    await pending();
    const row = (await api.call('GET', `/api/v2/downtime/${record.broad}`)).data;
    if (row?.attributes?.status === 'active') verifyProtection(row, state.owner);
    else {
      if (row?.id !== record.broad || row.attributes?.status !== 'canceled') fail();
      record.pending = { kind: 'broad', check: 'broad' }; await save();
      await api.call('POST', '/api/v2/downtime', protection(state.owner)); await pending();
    }
    for (const check of ['availability','checkout','heartbeat']) await effectiveProtection(api, monitor(check), [record.broad, ...(record.temporary[check] ? [record.temporary[check]] : [])]);
  }
  return {
    async open() {
      await pending(); verifyProtection((await api.call('GET', `/api/v2/downtime/${record.broad}`)).data, state.owner);
      for (const check of ['availability','checkout','heartbeat']) {
        if (!record.temporary[check]) await create(check);
        verifyTemporary((await api.call('GET', `/api/v2/downtime/${record.temporary[check]}`)).data, expected(check));
        await effectiveProtection(api, monitor(check), [record.broad, record.temporary[check]]);
      }
      await cancel('broad', record.broad);
      for (const check of ['availability','checkout','heartbeat']) await effectiveProtection(api, monitor(check), [record.temporary[check]]);
      await cancel('checkout', record.temporary.checkout);
      for (const check of ['availability','checkout','heartbeat']) await effectiveProtection(api, monitor(check), check === 'checkout' ? [] : [record.temporary[check]]);
      record.phase = 'window'; await save();
    },
    async close() {
      await broad();
      for (const check of ['availability','checkout','heartbeat']) if (record.temporary[check]) await cancel(check, record.temporary[check]);
      for (const check of ['availability','checkout','heartbeat']) await effectiveProtection(api, monitor(check), [record.broad]);
      state.protection = { id: record.broad, pending: false }; await saveState(state); return true;
    },
  };
}

export async function verifyRouting(api, state, route) {
  if (!route || Object.keys(route).sort().join() !== 'recipient,rule' || !idPattern.test(route.rule) || !/^[a-zA-Z0-9_-]{1,128}$/.test(route.recipient)) fail();
  async function scan() {
    const rows = [], seen = new Set(); let total;
    for (let page = 0; page <= 10; page++) {
      const result = await api.call('GET', `/api/v2/monitor/notification_rule?page=${page}&per_page=100&sort=name%3Aasc`);
      const count = result.meta?.page?.total_count;
      if (!Number.isSafeInteger(count) || count < 0 || count > 1000 || (total !== undefined && total !== count) || !Array.isArray(result.data) || result.data.length !== Math.min(100, Math.max(0, count-page*100))) fail();
      total = count;
      for (const row of result.data) { if (!idPattern.test(row?.id ?? '') || seen.has(row.id)) fail(); seen.add(row.id); rows.push(row); }
      if (rows.length === total) return rows;
    }
    fail();
  }
  const rows = await scan(); if (!same(rows, await scan())) fail();
  const exact = (await api.call('GET', `/api/v2/monitor/notification_rule/${route.rule}`)).data;
  if (!same(exact, rows.find(r => r.id === route.rule))) fail();
  const tags = selector(state.owner);
  for (const row of rows) {
    const a = row.attributes, f = a?.filter;
    // Unsupported expressions cannot prove non-overlap and therefore fail closed.
    if (row.type !== 'monitor-notification-rule' || !f || Object.keys(f).join() !== 'tags' || !Array.isArray(f.tags) || f.tags.some(t => typeof t !== 'string' || /[*?]/.test(t))) fail();
    if (!f.tags.every(t => tags.includes(t))) continue;
    if (row.id !== route.rule || !same([...f.tags].sort(), [...tags].sort()) || Object.keys(a).some(k => !['name','filter','conditional_recipients','recipients','rule_options','created','modified','created_at','modified_at'].includes(k)) || a.recipients?.length || !same(a.conditional_recipients, { conditions: [{ scope: 'transition_type:is_alert', recipients: [route.recipient] }], fallback_recipients: [] }) || (a.rule_options !== undefined && !same(a.rule_options, { is_threaded: false }))) fail();
  }
  if (!exact || !same(exact.attributes.filter.tags.slice().sort(), tags.slice().sort())) fail();
  return true;
}

export function cloudGroup(monitor) {
  const groups = monitor?.state?.groups;
  if (!groups || Object.keys(groups).join() !== 'host:deskdrop-demo') fail();
  return groups['host:deskdrop-demo'];
}

export async function runTrigger({ config, state, api, docker, store, journal, route, health, now = Date.now, monotonic = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), mode }) {
  validateRuntime(config);
  if (state.owner !== config.owner || state.verified !== true || state.pending || state.monitors.length !== 3) fail();
  const saveState = s => journal.save(s);
  const inspect = async () => {
    await reconcile(state, api, saveState);
    verifyProtection((await api.call('GET', `/api/v2/downtime/${state.protection.id}`)).data, state.owner);
    for (const m of state.monitors) {
      const monitor = await api.call('GET', `/api/v1/monitor/${m.id}?group_states=all`);
      owned(monitor, definitions(state.owner).find(d => d.name === m.name));
      const g = cloudGroup(monitor);
      if (g.status !== 'OK' || !Number.isSafeInteger(g.last_nodata_ts) || !Number.isSafeInteger(g.last_resolved_ts)) fail();
      await effectiveProtection(api, m.id, [state.protection.id]);
    }
    await verifyRouting(api, state, route);
    const h = await health();
    if (h.owner !== config.owner || h.source !== config.source || h.healthy !== true || !Number.isSafeInteger(h.updated) || now() < h.updated || now()-h.updated > 65000) fail();
    return verifyTarget(config, docker);
  };
  if (mode === 'inspect') { await inspect(); return { status: 'ready' }; }
  const lease = await store.load('lease.json');
  if (lease.schema !== 1 || !Number.isSafeInteger(lease.started) || lease.deadline !== lease.started + 360 || lease.installation !== 'mmani-shopping-cart-gcp' || !/^[a-f0-9-]{36}$/.test(lease.run ?? '') || !['admitted','recovering','uncertain'].includes(lease.phase)) fail();
  let r;
  try { r = validateOperation(await store.load(), config); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (r && r.run !== lease.run && r.phase !== 'complete') fail();
  if (!r || r.run !== lease.run) {
    const app = mode === 'trigger' ? await inspect() : await inspectTarget(config, docker);
    r = { schema: 1, run: lease.run, identity: config, phase: 'prepared', started: now(), appId: app.Id, broad: state.protection.id, temporary: {}, pending: null, unknownRuntime: false };
    await store.save(r);
  }
  const handoff = protectionHandoff(state, api, saveState, r, store);
  const exactApp = async () => { const app = await inspectTarget(config, docker); if (app.Id !== r.appId) fail(); return app; };
  if (mode === 'trigger') {
    if (r.phase !== 'prepared' || r.pending || now() >= 1793977200000 || now() < r.started) fail();
    const checkout = state.monitors.find(m => m.name === '[MMANI cloud] DeskDrop checkout');
    try {
      await handoff.open();
      await verifyRouting(api, state, route); await exactApp();
      if (now() >= 1793977200000 || now() < r.started || now() >= lease.deadline * 1000) fail();
      r.phase = 'stopped'; r.stopAt = now(); r.unknownRuntime = true; await store.save(r);
      await docker('POST', `/v1.52/containers/${r.appId}/stop?t=3`);
      if ((await exactApp()).State.Running) fail();
      r.unknownRuntime = false; await store.save(r);
      const deadline = monotonic() + limits.alert;
      while (monotonic() < deadline) {
        const l = await store.load('lease.json'); if (l.recoverRequested || l.run !== r.run) break;
        let m;
        const observed = await attempt(async () => { m = await api.call('GET', `/api/v1/monitor/${checkout.id}?group_states=all`); return true; }, Math.min(5000, deadline - monotonic()));
        if (!observed.confirmed) break;
        owned(m, definitions(state.owner).find(d => d.name === checkout.name));
        const g = cloudGroup(m);
        if (g.status === 'Alert' && Number.isSafeInteger(g.last_triggered_ts) && g.last_triggered_ts * 1000 >= r.stopAt) { r.phase = 'observed'; r.alertAt = g.last_triggered_ts; await store.save(r); break; }
        await sleep(Math.min(5000, Math.max(0, deadline-monotonic())));
      }
    } catch { r.phase = 'uncertain'; await store.save(r); }
  }
  // Recovery deliberately obtains runtime evidence independently of suppression/readback.
  r.phase = 'recovering'; await store.save(r);
  let protectedOk = false, appOk = false, healthy = false;
  protectedOk = (await attempt(async signal => {
    const check = () => signal.throwIfAborted();
    const guardedApi = { call: async (...args) => { check(); const value = await api.call(...args); check(); return value; } };
    const guardedSave = async value => { check(); return store.save(value); };
    return protectionHandoff(state, guardedApi, async value => { check(); return saveState(value); }, r, { save: guardedSave }).close();
  }, 60000)).confirmed;
  try {
    const app = await exactApp();
    if (!app.State.Running) await docker('POST', `/v1.52/containers/${r.appId}/start`);
    appOk = (await exactApp()).State.Running === true;
  } catch {}
  try { await inspect(); healthy = true; } catch {}
  const complete = protectedOk && appOk && healthy && !r.unknownRuntime && !r.pending;
  r.phase = complete ? 'complete' : 'uncertain'; r.recovery = { protected: protectedOk, app: appOk, healthy, runtimeCertain: !r.unknownRuntime }; await store.save(r);
  return { status: complete ? 'restored' : 'reconciliation-required', run: r.run, ...r.recovery };
}

async function main() {
  if (process.getuid() !== 0 || process.argv.length !== 3 || !['inspect','trigger','recover'].includes(process.argv[2])) fail();
  const store = new TriggerStore(), journal = new Journal();
  const config = validateRuntime(JSON.parse(await readFile('/opt/deskdrop/monitoring/runtime.json','utf8')));
  let credentials;
  try {
    const secret = await open('/run/deskdrop-management/management', constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const st = await secret.stat(); if (!st.isFile() || st.uid !== 0 || st.nlink !== 1 || (st.mode & 0o777) !== 0o600 || st.size > 4096) fail(); credentials = JSON.parse(await secret.readFile('utf8')); } finally { await secret.close(); }
  } catch {}
  const health = async () => {
    const file = await open('/var/lib/deskdrop/monitoring/health.json', constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const s = await file.stat(); if (!s.isFile() || s.uid !== 0 || s.nlink !== 1 || (s.mode & 0o777) !== 0o600 || s.size > 1024) fail(); return JSON.parse(await file.readFile('utf8')); } finally { await file.close(); }
  };
  let api;
  try { api = await makeTriggerApi(credentials); } catch { api = { call: async () => fail() }; }
  let route; try { route = await store.load('route.json'); } catch {}
  const result = await runTrigger({ config, state: await journal.read(), api, docker: dockerTransport(), store, journal, route, health, mode: process.argv[2] });
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Trigger reconciliation required'); process.exitCode = 1; });
