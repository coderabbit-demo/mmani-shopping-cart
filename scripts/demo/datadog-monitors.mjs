import { readFile, open, lstat, mkdir, realpath, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCredentials } from './local.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import https from 'node:https';

export const fixedTags = Object.freeze(['service:deskdrop', 'env:local-demo', 'demo_id:mmani-shopping-cart-local', 'managed_by:deskdrop-local-controller']);
export const ownerPattern = /^local_owner:[a-f0-9]{32}$/;
const names = ['[MMANI local] DeskDrop availability', '[MMANI local] DeskDrop checkout', '[MMANI local] DeskDrop checker heartbeat'];
const checks = ['availability', 'checkout', 'heartbeat'];
export function installationTag() { return `local_owner:${randomBytes(16).toString('hex')}`; }
export function selector(owner) {
  if (!ownerPattern.test(owner ?? '')) throw new Error('Invalid installation ownership');
  return [...fixedTags, owner];
}
export function monitorDefinitions(definitions, owner) {
  const tags = selector(owner);
  if (!Array.isArray(definitions) || definitions.length !== 3) throw new Error('Invalid definitions');
  return definitions.map((m, index) => {
    const query = `"deskdrop.local.${checks[index]}".over("service:deskdrop","env:local-demo","demo_id:mmani-shopping-cart-local","host:deskdrop-mmani-local").by("host").last(2).count_by_status()`;
    if (Object.keys(m).sort().join(',') !== 'message,name,options,query,tags,type' || m.message !== 'DeskDrop local demo monitor.' || m.name !== names[index] || m.type !== 'service check' || m.query !== query || m.options?.thresholds?.critical !== 2 || m.options?.thresholds?.ok !== 2 || Object.keys(m.options?.thresholds ?? {}).sort().join(',') !== 'critical,ok' || m.options?.notify_no_data !== (index === 2) || m.options?.include_tags !== true || m.options?.new_group_delay !== 0 || Object.keys(m.options ?? {}).sort().join(',') !== (index === 2 ? 'include_tags,new_group_delay,no_data_timeframe,notify_no_data,thresholds' : 'include_tags,new_group_delay,notify_no_data,thresholds') || (index === 2 && m.options?.no_data_timeframe !== 2) || !fixedTags.every(t => m.tags?.includes(t)) || m.tags?.length !== fixedTags.length) throw new Error('Invalid definitions');
    return { ...m, tags };
  });
}
export function ownedMonitor(monitor, expected) {
  if (!Number.isSafeInteger(monitor?.id) || monitor.id <= 0 || monitor.name !== expected.name || monitor.type !== expected.type || monitor.query !== expected.query || monitor.message !== expected.message || !Array.isArray(monitor.tags) || monitor.tags.length !== expected.tags.length || !expected.tags.every(tag => monitor.tags.includes(tag)) || monitor.options?.thresholds?.critical !== 2 || monitor.options?.thresholds?.ok !== 2 || monitor.options?.notify_no_data !== expected.options.notify_no_data || (expected.options.notify_no_data && monitor.options?.no_data_timeframe !== 2)) throw new Error('Monitor ownership or configuration changed');
  return monitor.id;
}
export async function inventory(fetchPage, pageSize = 100) {
  const all = [], seen = new Set();
  for (let page = 0; page < 10000; page++) {
    const items = await fetchPage(page, pageSize);
    if (!Array.isArray(items) || items.length > pageSize) throw new Error('Incomplete inventory');
    for (const item of items) {
      if (!Number.isSafeInteger(item?.id) || seen.has(item.id)) throw new Error('Unstable inventory');
      seen.add(item.id); all.push(item);
    }
    if (items.length < pageSize) return all;
  }
  throw new Error('Incomplete inventory');
}
export function ensureZeroMatches(monitors, owner) {
  const tags = selector(owner);
  if (monitors.some(m => Array.isArray(m.tags) && tags.every(tag => m.tags.includes(tag)))) throw new Error('Ownership selector already matches a monitor');
  if (monitors.some(m => names.includes(m.name))) throw new Error('Existing monitor with reserved name');
}
export function tagDowntime(owner) {
  return { data: { type: 'downtime', attributes: { monitor_identifier: { monitor_tags: selector(owner) }, scope: '*', schedule: { start: null }, mute_first_recovery_notification: true, notify_end_states: [], notify_end_types: [] } } };
}
export function idDowntime(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid monitor ID');
  return { data: { type: 'downtime', attributes: { monitor_identifier: { monitor_id: id }, scope: '*', schedule: { start: null }, mute_first_recovery_notification: true, notify_end_states: [], notify_end_types: [] } } };
}
export function verifyDowntime(record, expected) {
  const data = record?.data, a = data?.attributes, want = expected.data.attributes;
  if (!data?.id || data.type !== 'downtime' || a?.status !== 'active' || a.scope !== '*' || a.mute_first_recovery_notification !== true || !Array.isArray(a.notify_end_types) || a.notify_end_types.length !== 0 || !Array.isArray(a.notify_end_states) || a.notify_end_states.length !== 0) throw new Error('Downtime not confirmed');
  const target = a.monitor_identifier;
  if (want.monitor_identifier.monitor_id) {
    if (target?.monitor_id !== want.monitor_identifier.monitor_id || Object.keys(target).length !== 1) throw new Error('Downtime selector changed');
  } else {
    const required = want.monitor_identifier.monitor_tags;
    if (!Array.isArray(target?.monitor_tags) || Object.keys(target).length !== 1 || target.monitor_tags.length !== required.length || !required.every(tag => target.monitor_tags.includes(tag))) throw new Error('Downtime selector changed');
  }
  if (a.schedule?.end || a.schedule?.current_downtime?.end || a.schedule?.recurrences?.length) throw new Error('Downtime must not expire');
  return data.id;
}
export function inventoryHash(all) {
  return createHash('sha256').update(JSON.stringify(all.map(({ id, name, tags, query }) => ({ id, name, tags, query })).sort((a, b) => a.id - b.id))).digest('hex');
}
export function makeApi({ apiKey, appKey, request = https.request, deadlineMs = 10000 }) {
  if (!apiKey || !appKey) throw new Error('Missing Datadog credentials');
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 10000) throw new Error('Invalid request deadline');
  async function call(method, path, body) {
    if (!/^(?:\/api\/v1\/monitor(?:\/validate|\/\d+)?(?:\?page=\d+&page_size=\d+)?|\/api\/v2\/downtime(?:\/[A-Za-z0-9-]+)?|\/api\/v2\/monitor\/\d+\/downtime_matches(?:\?page%5Boffset%5D=\d+&page%5Blimit%5D=\d+)?)$/.test(path) || !['GET', 'POST', 'DELETE'].includes(method)) throw new Error('Invalid API operation');
    return new Promise((resolve, reject) => {
      let size = 0, chunks = [], finished = false, req, response;
      const fail = () => finish('Datadog request outcome unknown');
      const onData = chunk => { size += chunk.length; if (size > 1048576) finish('Datadog response invalid or outcome unknown'); else chunks.push(chunk); };
      const onEnd = () => { try { finish(false, size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); } catch { finish('Datadog response invalid or outcome unknown'); } };
      const timer = setTimeout(fail, deadlineMs);
      const finish = (error, value) => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        const dispose = stream => {
          if (!stream || typeof stream.destroy !== 'function') return;
          const ignore = () => {};
          const closed = () => { stream.removeListener('error', ignore); stream.removeListener('close', closed); };
          stream.once('error', ignore); stream.once('close', closed);
          stream.destroy();
        };
        if (response) { response.removeListener('data', onData); response.removeListener('end', onEnd); response.removeListener('error', fail); response.removeListener('aborted', fail); }
        if (req) req.removeListener('error', fail);
        if (error) { dispose(response); dispose(req); }
        if (error) reject(new Error(error)); else resolve(value);
      };
      try {
        req = request({ protocol: 'https:', hostname: 'api.us3.datadoghq.com', port: 443, method, path, headers: { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey, 'content-type': 'application/json', accept: 'application/json' } }, incoming => {
          response = incoming;
          if (finished) { response.destroy?.(); return; }
          if (response.statusCode < 200 || response.statusCode >= 300) { finish(response.statusCode === 401 || response.statusCode === 403 ? 'Datadog API access denied' : response.statusCode === 429 ? 'Datadog API rate limited' : response.statusCode >= 300 && response.statusCode < 400 ? 'Datadog API redirect rejected' : 'Datadog API request failed'); return; }
          response.on('data', onData); response.on('error', fail); response.on('aborted', fail); response.on('end', onEnd);
        });
        req.on('error', fail);
        req.end(body === undefined ? undefined : JSON.stringify(body));
      } catch { finish('Datadog request outcome unknown'); }
    });
  }
  return {
    listMonitors: (page, size) => call('GET', `/api/v1/monitor?page=${page}&page_size=${size}`),
    validate: body => call('POST', '/api/v1/monitor/validate', body),
    getMonitor: id => call('GET', `/api/v1/monitor/${id}`),
    createMonitor: body => call('POST', '/api/v1/monitor', body),
    createDowntime: body => call('POST', '/api/v2/downtime', body),
    getDowntime: id => call('GET', `/api/v2/downtime/${id}`),
    cancelDowntime: id => call('DELETE', `/api/v2/downtime/${id}`),
    async matches(id) {
      const ids = [];
      for (let offset = 0; offset < 300000; offset += 100) {
        const result = await call('GET', `/api/v2/monitor/${id}/downtime_matches?page%5Boffset%5D=${offset}&page%5Blimit%5D=100`);
        if (!Array.isArray(result?.data)) throw new Error('Incomplete downtime matches');
        ids.push(...result.data.map(d => d.id));
        if (result.data.length < 100) return ids;
      }
      throw new Error('Incomplete downtime matches');
    },
  };
}
export function makePlan(definitions, owner, all) {
  ensureZeroMatches(all, owner);
  const wanted = monitorDefinitions(definitions, owner);
  return { owner, inventoryHash: inventoryHash(all), definitionsHash: createHash('sha256').update(JSON.stringify(wanted)).digest('hex'), visibilityConfirmed: true, changes: wanted.map(item => ({ action: 'create', ...item })) };
}
export function validatePlan(plan, definitions) {
  if (plan?.visibilityConfirmed !== true || !ownerPattern.test(plan.owner ?? '') || !/^[a-f0-9]{64}$/.test(plan.inventoryHash ?? '')) throw new Error('Invalid plan');
  const wanted = monitorDefinitions(definitions, plan.owner);
  const changes = wanted.map(item => ({ action: 'create', ...item }));
  const hash = createHash('sha256').update(JSON.stringify(wanted)).digest('hex');
  if (plan.definitionsHash !== hash || JSON.stringify(plan.changes) !== JSON.stringify(changes)) throw new Error('Plan changed');
  return plan;
}
export async function createSuppressed({ api, owner, definitions, expectedInventory, state, save }) {
  const wanted = monitorDefinitions(definitions, owner);
  if (state.pending || state.tagDowntime || state.monitors?.length) throw new Error('Reconciliation required');
  const all = await inventory(api.listMonitors);
  ensureZeroMatches(all, owner);
  const snapshot = inventoryHash(all);
  if (snapshot !== expectedInventory) throw new Error('Plan is stale');
  async function mutation(kind, operation) {
    state.pending = kind; await save(state);
    const result = await operation();
    state.pending = null; await save(state);
    return result;
  }
  async function protection(id, expected) {
    const result = await api.getDowntime(id);
    if (verifyDowntime(result, expected) !== id) throw new Error('Suppression changed');
  }
  const tagSpec = tagDowntime(owner);
  const initial = await mutation('create-tag-downtime', async () => {
    const created = await api.createDowntime(tagSpec);
    if (!created?.data?.id) throw new Error('Downtime create outcome unknown');
    state.tagDowntime = created.data.id; return created.data.id;
  });
  await protection(initial, tagSpec);
  state.monitors = [];
  for (const definition of wanted) {
    await protection(initial, tagSpec);
    const current = await inventory(api.listMonitors);
    const remaining = wanted.filter(x => !state.monitors.some(y => y.name === x.name));
    if (current.some(m => remaining.some(x => x.name === m.name)) || current.some(m => selector(owner).every(t => m.tags?.includes(t)) && !state.monitors.some(x => x.id === m.id))) throw new Error('Unexpected monitor ownership');
    for (const known of state.monitors) ownedMonitor(await api.getMonitor(known.id), wanted.find(x => x.name === known.name));
    const id = await mutation('create-monitor', async () => {
      const created = await api.createMonitor(definition);
      const monitorId = ownedMonitor(created, definition);
      state.monitors.push({ id: monitorId, name: definition.name }); return monitorId;
    });
    ownedMonitor(await api.getMonitor(id), definition);
    if (!(await api.matches(id)).includes(initial)) throw new Error('Tag suppression not effective');
    const idSpec = idDowntime(id);
    const downtime = await mutation('create-id-downtime', async () => {
      const created = await api.createDowntime(idSpec);
      if (!created?.data?.id) throw new Error('Downtime create outcome unknown');
      state.monitors.find(m => m.id === id).downtime = created.data.id; return created.data.id;
    });
    await protection(downtime, idSpec);
    if (!(await api.matches(id)).includes(downtime)) throw new Error('ID suppression not effective');
  }
  for (const known of state.monitors) {
    ownedMonitor(await api.getMonitor(known.id), wanted.find(x => x.name === known.name));
    await protection(known.downtime, idDowntime(known.id));
    if (!(await api.matches(known.id)).includes(known.downtime)) throw new Error('ID suppression not effective');
  }
  const finalInventory = await inventory(api.listMonitors);
  if (finalInventory.some(m => selector(owner).every(t => m.tags?.includes(t)) && !state.monitors.some(x => x.id === m.id))) throw new Error('Unexpected monitor ownership');
  await protection(initial, tagSpec);
  await mutation('cancel-tag-downtime', async () => {
    await api.cancelDowntime(initial);
    const canceled = await api.getDowntime(initial);
    if (canceled?.data?.id !== initial || canceled.data.attributes?.status !== 'canceled') throw new Error('Cancellation not confirmed');
    state.tagDowntime = null;
  });
  return state;
}
const stateDir = path.join(os.homedir(), '.deskdrop-mmani-local');
async function stateDirectory(create = false) {
  if (create) await mkdir(stateDir, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const st = await lstat(stateDir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) || await realpath(stateDir) !== stateDir) throw new Error('Unsafe runtime directory');
}
async function protectedJson(name) {
  const file = path.join(stateDir, name), fh = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o077) || st.nlink !== 1 || st.size > 65536) throw new Error('Unsafe runtime state');
    return JSON.parse(await fh.readFile({ encoding: 'utf8' }));
  } finally { await fh.close(); }
}
export async function savePlan(directory, plan, definitions) {
  validatePlan(plan, definitions);
  const st = await lstat(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) || await realpath(directory) !== directory) throw new Error('Unsafe runtime directory');
  const handle = await open(path.join(directory, 'monitor-plan.json'), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(JSON.stringify(plan) + '\n'); await handle.sync(); } finally { await handle.close(); }
}
async function readStdin() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 65536) throw new Error('Plan too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function saveState(state) {
  const temp = path.join(stateDir, `.monitor-${randomBytes(16).toString('hex')}`), target = path.join(stateDir, 'monitors.json');
  const fh = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await fh.writeFile(JSON.stringify(state) + '\n'); await fh.sync(); } finally { await fh.close(); }
  try { await rename(temp, target); } catch (error) { await unlink(temp).catch(() => {}); throw error; }
}
async function lock(operation) {
  await stateDirectory(true);
  const lockPath = path.join(stateDir, 'monitor.lock');
  const handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { return await operation(); } finally { await handle.close(); await unlink(lockPath); }
}
export async function ensureSuppressed({ api, state, definitions, save, allowCreate = false }) {
  if (state.pending || state.transition || state.tagDowntime || !ownerPattern.test(state.owner ?? '') || !Array.isArray(state.monitors) || state.monitors.length !== 3 || new Set(state.monitors.map(x => x.id)).size !== 3 || new Set(state.monitors.map(x => x.name)).size !== 3) throw new Error('Monitor reconciliation required');
  const wanted = monitorDefinitions(definitions, state.owner);
  for (const item of wanted) {
    const entry = state.monitors.find(m => m.name === item.name);
    if (!entry) throw new Error('Monitor ownership changed');
    ownedMonitor(await api.getMonitor(entry.id), item);
    let existing;
    if (entry.downtime) existing = await api.getDowntime(entry.downtime);
    if (!existing || existing.data?.attributes?.status !== 'active') {
      if (existing && (existing.data?.id !== entry.downtime || existing.data?.type !== 'downtime' || !['canceled', 'ended'].includes(existing.data?.attributes?.status) || existing.data?.attributes?.monitor_identifier?.monitor_id !== entry.id || Object.keys(existing.data?.attributes?.monitor_identifier ?? {}).length !== 1)) throw new Error('Downtime ownership or status unknown');
      if (!allowCreate) throw new Error('Monitor notifications are not suppressed');
      state.pending = `suppress:${entry.id}`; await save(state);
      const result = await api.createDowntime(idDowntime(entry.id));
      if (!result?.data?.id) throw new Error('Downtime outcome unknown');
      entry.downtime = result.data.id; state.pending = null; await save(state);
      existing = await api.getDowntime(entry.downtime);
    }
    if (verifyDowntime(existing, idDowntime(entry.id)) !== entry.downtime || !(await api.matches(entry.id)).includes(entry.downtime)) throw new Error('Suppression not effective');
  }
  if (allowCreate) await ensureSuppressed({ api, state, definitions, save, allowCreate: false });
  return true;
}
export async function enableOwned({ api, state, definitions, save, approval, now = Date.now() }) {
  const start = Date.parse(approval?.windowStart), end = Date.parse(approval?.windowEnd), observed = Date.parse(approval?.healthyObservedAt);
  const ownedIds = state.monitors?.map(m => m.id).sort((a, b) => a - b);
  if (approval?.approved !== true || approval.scopeVerified !== true || typeof approval.owner !== 'string' || !approval.owner.trim() || !Number.isFinite(approval.usageLimit) || approval.usageLimit <= 0 || !Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= now || !Number.isFinite(observed) || observed > now || now - observed > 60000 || typeof approval.evidence !== 'string' || !approval.evidence.trim() || !Array.isArray(approval.monitorIds) || JSON.stringify([...approval.monitorIds].sort((a, b) => a - b)) !== JSON.stringify(ownedIds)) throw new Error('Notification approval incomplete');
  await ensureSuppressed({ api, state, definitions, save });
  const wanted = monitorDefinitions(definitions, state.owner);
  for (const item of wanted) {
    const entry = state.monitors.find(m => m.name === item.name), monitor = await api.getMonitor(entry.id);
    ownedMonitor(monitor, item);
    const groups = monitor.state?.groups;
    if (monitor.overall_state !== 'OK' || !groups || Object.keys(groups).length !== 1 || groups['host:deskdrop-mmani-local']?.status !== 'OK') throw new Error('Fresh healthy monitor evidence required');
  }
  state.transition = 'enabling'; await save(state);
  for (const entry of state.monitors) {
    const item = wanted.find(m => m.name === entry.name);
    ownedMonitor(await api.getMonitor(entry.id), item);
    verifyDowntime(await api.getDowntime(entry.downtime), idDowntime(entry.id));
    if (!(await api.matches(entry.id)).includes(entry.downtime)) throw new Error('Suppression not effective');
    state.pending = `enable:${entry.id}`; await save(state);
    await api.cancelDowntime(entry.downtime);
    const canceled = await api.getDowntime(entry.downtime);
    if (canceled?.data?.id !== entry.downtime || canceled.data.attributes?.status !== 'canceled') throw new Error('Cancellation not confirmed');
    state.pending = null; await save(state);
  }
  state.transition = null; await save(state);
  return true;
}
export async function verifyProtectedMonitors(allowCreate = false) {
  if (process.platform !== 'darwin') throw new Error('Monitor operations require the Mac');
  return lock(async () => {
    const definitions = JSON.parse(await readFile(new URL('../../deploy/datadog/local-monitors.json', import.meta.url), 'utf8'));
    const state = await protectedJson('monitors.json');
    const api = makeApi(await loadCredentials());
    await ensureSuppressed({ api, state, definitions, save: saveState, allowCreate });
    return { status: 'protected', monitorCount: 3 };
  });
}
async function main() {
  const command = process.argv[2] ?? 'help', args = process.argv.slice(3);
  if (command === 'help' && !args.length) return { commands: ['help', 'definitions', 'status', 'plan', 'save-plan', 'validate', 'apply', 'disable', 'enable'] };
  const definitions = JSON.parse(await readFile(new URL('../../deploy/datadog/local-monitors.json', import.meta.url), 'utf8'));
  if (command === 'definitions' && !args.length) return monitorDefinitions(definitions, 'local_owner:00000000000000000000000000000000');
  if (command === 'save-plan' && !args.length) { if (process.platform !== 'darwin') throw new Error('Monitor operations require the Mac'); await stateDirectory(); await savePlan(stateDir, await readStdin(), definitions); return { status: 'plan-saved' }; }
  if (!((['status', 'validate', 'disable', 'enable'].includes(command) && !args.length) || (['plan', 'apply'].includes(command) && args.length === 1 && args[0] === '--all-monitors-visible'))) throw new Error('Invalid command');
  if (process.platform !== 'darwin') throw new Error('Monitor operations require the Mac');
  if (command === 'disable' && !args.length) return verifyProtectedMonitors(true);
  if (command === 'enable' && !args.length) return lock(async () => {
    const state = await protectedJson('monitors.json'), approval = await protectedJson('notification-approval.json');
    const api = makeApi(await loadCredentials());
    await enableOwned({ api, state, definitions, save: saveState, approval });
    return { status: 'notifications-enabled', monitorCount: 3 };
  });
  const key = await loadCredentials(), api = makeApi(key);
  if (command === 'status' && !args.length) {
    await stateDirectory();
    const state = await protectedJson('monitors.json');
    if (!ownerPattern.test(state.owner ?? '') || !Array.isArray(state.monitors) || state.monitors.length > 3) throw new Error('Invalid monitor state');
    if (state.pending || state.transition || state.tagDowntime || state.monitors.length !== 3) return { status: 'reconciliation-required', monitorCount: state.monitors.length };
    const wanted = monitorDefinitions(definitions, state.owner), result = [];
    for (const item of wanted) {
      const entry = state.monitors.find(m => m.name === item.name);
      if (!entry) throw new Error('Monitor state incomplete');
      const monitor = await api.getMonitor(entry.id); ownedMonitor(monitor, item);
      const downtime = await api.getDowntime(entry.downtime);
      const dt = downtime?.data;
      if (dt?.id !== entry.downtime || dt.type !== 'downtime' || !['active', 'canceled', 'ended', 'scheduled'].includes(dt.attributes?.status) || dt.attributes?.monitor_identifier?.monitor_id !== entry.id || Object.keys(dt.attributes.monitor_identifier).length !== 1) throw new Error('Downtime status unknown');
      const suppressed = dt.attributes.status === 'active' && verifyDowntime(downtime, idDowntime(entry.id)) === entry.downtime && (await api.matches(entry.id)).includes(entry.downtime);
      result.push({ name: item.name, id: entry.id, state: ['OK', 'Alert', 'No Data', 'Unknown', 'Warn', 'Ignored', 'Skipped'].includes(monitor.overall_state) ? monitor.overall_state : 'unknown', suppressed: !!suppressed });
    }
    return { status: 'inspected', monitors: result };
  }
  if (command === 'validate' && !args.length) {
    const wanted = monitorDefinitions(definitions, 'local_owner:00000000000000000000000000000000');
    for (const item of wanted) await api.validate(item);
    return { status: 'validated', count: wanted.length };
  }
  if (command === 'plan' && args.length === 1 && args[0] === '--all-monitors-visible') {
    const owner = installationTag(), all = await inventory(api.listMonitors);
    return makePlan(definitions, owner, all);
  }
  if (command === 'apply' && args.length === 1 && args[0] === '--all-monitors-visible') {
    return lock(async () => {
      const plan = await protectedJson('monitor-plan.json');
      validatePlan(plan, definitions);
      let state;
      try { state = await protectedJson('monitors.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; state = { owner: plan.owner, monitors: [] }; await saveState(state); }
      if (state.owner !== plan.owner || state.pending || state.transition) throw new Error('Reconciliation required');
      if (state.monitors.length === 3 && !state.tagDowntime) {
        const wanted = monitorDefinitions(definitions, state.owner);
        for (const entry of state.monitors) {
          ownedMonitor(await api.getMonitor(entry.id), wanted.find(item => item.name === entry.name));
          verifyDowntime(await api.getDowntime(entry.downtime), idDowntime(entry.id));
          if (!(await api.matches(entry.id)).includes(entry.downtime)) throw new Error('Suppression not effective');
        }
        return { status: 'already-protected', monitorCount: 3 };
      }
      await createSuppressed({ api, owner: plan.owner, definitions, expectedInventory: plan.inventoryHash, state, save: saveState });
      return { status: 'protected', monitorCount: state.monitors.length };
    });
  }
  throw new Error('Invalid command');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(value => console.log(JSON.stringify(value, null, 2)), error => {
  const messages = new Set(['Datadog API access denied', 'Datadog API rate limited', 'Datadog API redirect rejected', 'Datadog API request failed', 'Datadog request outcome unknown', 'Datadog response invalid or outcome unknown', 'Monitor reconciliation required', 'Reconciliation required', 'Suppression not effective', 'Monitor notifications are not suppressed', 'Notification approval incomplete', 'Fresh healthy monitor evidence required', 'Monitor operations require the Mac', 'Invalid local credentials', 'Plan is stale', 'Plan changed']);
  console.error(messages.has(error?.message) ? error.message : 'Monitor operation failed; inspect owned state and journal'); process.exitCode = 1;
});
