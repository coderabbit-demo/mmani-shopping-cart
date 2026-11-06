import { randomBytes, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export const tags = Object.freeze(['service:deskdrop', 'env:gcp-demo', 'demo_id:mmani-shopping-cart-gcp', 'host:deskdrop-demo', 'managed_by:deskdrop-gcp-controller']);
export const checks = Object.freeze(['availability', 'checkout', 'heartbeat']);
const localIds = new Set([29524290, 29524154, 29524292]);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function ownerTag() { return `cloud_owner:${randomBytes(16).toString('hex')}`; }
export function selector(owner) {
  if (!/^cloud_owner:[a-f0-9]{32}$/.test(owner ?? '')) throw new Error('Invalid cloud owner');
  return [...tags, owner];
}
export function definitions(owner) {
  return checks.map(check => ({ name: `[MMANI cloud] DeskDrop ${check}`, type: 'service check',
    query: `"deskdrop.cloud.${check}".over(${selector(owner).map(t => JSON.stringify(t)).join(',')}).by("host").last(2).count_by_status()`,
    message: 'DeskDrop cloud demo monitor.', tags: selector(owner),
    options: { thresholds: { critical: 2, ok: 2 }, notify_no_data: check === 'heartbeat', ...(check === 'heartbeat' ? { no_data_timeframe: 2 } : {}), include_tags: true, new_group_delay: 0 } }));
}
export function owned(record, expected) {
  if (!Number.isSafeInteger(record?.id) || record.id < 1 || localIds.has(record.id) || ['name', 'type', 'query', 'message'].some(k => record[k] !== expected[k]) || !Array.isArray(record.tags) || record.tags.length !== expected.tags.length || !expected.tags.every(t => record.tags.includes(t)) || record.options?.thresholds?.critical !== 2 || record.options?.thresholds?.ok !== 2 || record.options?.notify_no_data !== expected.options.notify_no_data || record.options?.include_tags !== true || record.options?.new_group_delay !== 0 || (expected.options.notify_no_data && record.options.no_data_timeframe !== 2)) throw new Error('Cloud monitor ownership mismatch');
  return record.id;
}
// Compare only lifecycle safety configuration, in canonical key/tag order.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
function monitorIdentity(row, owner) {
  const identity = { id: row.id, name: row.name, tags: row.tags.slice().sort() };
  if (!owner || row.tags.includes(owner) || definitions(owner).some(m => m.name === row.name)) {
    Object.assign(identity, { type: row.type, query: row.query, message: row.message,
      options: { thresholds: { critical: row.options?.thresholds?.critical, ok: row.options?.thresholds?.ok }, notify_no_data: row.options?.notify_no_data,
        no_data_timeframe: row.options?.no_data_timeframe, include_tags: row.options?.include_tags, new_group_delay: row.options?.new_group_delay } });
  }
  return canonical(identity);
}
function suppressionIdentity(row, owner) {
  const a = row.attributes;
  if (!a?.monitor_identifier?.monitor_tags?.includes(owner)) return { id: row.id };
  const identifier = { ...a.monitor_identifier, monitor_tags: a.monitor_identifier.monitor_tags.slice().sort() };
  return canonical({ id: row.id, type: row.type, status: a.status, scope: a.scope, schedule: a.schedule,
    monitor_identifier: identifier, mute_first_recovery_notification: a.mute_first_recovery_notification,
    notify_end_states: a.notify_end_states, notify_end_types: a.notify_end_types });
}
export async function inventory(page, owner) {
  if (owner !== undefined) selector(owner);
  async function scan() {
    const result = [], seen = new Set();
    for (let i = 0; i < 100; i++) {
      const rows = await page(i, 100);
      if (!Array.isArray(rows) || rows.length > 100) throw new Error('Incomplete cloud inventory');
      for (const row of rows) {
        if (!Number.isSafeInteger(row?.id) || seen.has(row.id) || !Array.isArray(row.tags) || typeof row.name !== 'string' || typeof row.query !== 'string') throw new Error('Unstable cloud inventory');
        seen.add(row.id); result.push(row);
      }
      if (rows.length < 100) return result.sort((a, b) => a.id - b.id);
    }
    throw new Error('Incomplete cloud inventory');
  }
  const first = await scan();
  if (hash(first.map(r => monitorIdentity(r, owner))) !== hash((await scan()).map(r => monitorIdentity(r, owner)))) throw new Error('Changing cloud inventory');
  return first;
}
export function validateState(state) {
  selector(state?.owner);
  if (Object.keys(state).some(k => !['schema','owner','monitors','pending','protection','verified'].includes(k)) || (state.verified !== undefined && typeof state.verified !== 'boolean') || state.schema !== 1 || !Array.isArray(state.monitors) || state.monitors.length > 3 || ![null, 'create', 'delete'].includes(state.pending?.kind ?? null)) throw new Error('Invalid cloud journal');
  const ids = new Set(), names = new Set();
  for (const row of state.monitors) {
    const expected = definitions(state.owner).find(m => m.name === row.name);
    if (!expected || ids.has(row.id) || names.has(row.name) || !Number.isSafeInteger(row.id) || row.id < 1 || localIds.has(row.id)) throw new Error('Invalid cloud journal');
    ids.add(row.id); names.add(row.name);
  }
  if (state.pending && (!definitions(state.owner).some(m => m.name === state.pending.name) || (state.pending.kind === 'delete' && !ids.has(state.pending.id)))) throw new Error('Invalid cloud intent');
  if (state.protection !== undefined && (typeof state.protection?.pending !== 'boolean' || (state.protection.pending ? state.protection.id !== null : !/^[A-Za-z0-9-]{1,128}$/.test(state.protection.id ?? '')))) throw new Error('Invalid suppression intent');
  if (state.verified === true && (state.pending || state.protection?.pending !== false || state.monitors.length !== 3)) throw new Error('Invalid installation proof');
  return state;
}
export class Journal {
  constructor(directory = '/var/lib/deskdrop/monitoring', uid = 0) { this.directory = directory; this.uid = uid; }
  async directorySafe() {
    if (!path.isAbsolute(this.directory) || path.resolve(this.directory) !== this.directory || await realpath(this.directory) !== this.directory) throw new Error('Unsafe journal path');
    let current = this.directory;
    while (true) {
      const st = await lstat(current);
      if (!st.isDirectory() || st.isSymbolicLink() || (st.uid !== this.uid && !(current !== this.directory && st.uid === 0)) || (st.mode & 0o022) || (current === this.directory && (st.mode & 0o777) !== 0o700)) throw new Error('Unsafe journal directory');
      if (current === '/') break;
      current = path.dirname(current);
    }
  }
  async read() {
    await this.directorySafe();
    const file = await open(path.join(this.directory, 'installation.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const st = await file.stat();
      if (!st.isFile() || st.uid !== this.uid || st.nlink !== 1 || (st.mode & 0o777) !== 0o600 || st.size > 32768) throw new Error('Unsafe cloud journal');
      return validateState(JSON.parse(await file.readFile('utf8')));
    } finally { await file.close(); }
  }
  async save(state) {
    validateState(state); await this.directorySafe();
    try { await this.read(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const name = path.join(this.directory, `.journal-${randomBytes(16).toString('hex')}`);
    const file = await open(name, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await file.writeFile(JSON.stringify(state)); await file.sync();
      await rename(name, path.join(this.directory, 'installation.json'));
      const dir = await open(this.directory, constants.O_RDONLY);
      try { await dir.sync(); } finally { await dir.close(); }
    } finally { await file.close(); await unlink(name).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
  async locked(fn) {
    await this.directorySafe();
    const lock = path.join(this.directory, 'installation.lock');
    try { await mkdir(lock, { mode: 0o700 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const held = new Error('Protected installation.lock exists: live or abandoned installer ownership is unknown. Keep the lock and pending evidence. Use protected maintenance to confirm the exact owned installer and host lifecycle lease, then reconcile durable intent before any manual lock removal.');
      held.code = 'DESKDROP_INSTALLATION_LOCK_HELD';
      throw held;
    }
    try { return await fn(); } finally { await (await import('node:fs/promises')).rmdir(lock); }
  }
}

export async function reconcile(state, api, save) {
  validateState(state);
  const rows = await inventory(api.list, state.owner);
  const wanted = definitions(state.owner);
  const ownedRows = rows.filter(r => r.tags.includes(state.owner));
  for (const row of ownedRows) {
    const expected = wanted.find(m => m.name === row.name);
    if (!expected) throw new Error('Unexpected cloud monitor');
    owned(await api.get(row.id), expected);
  }
  if (new Set(ownedRows.map(r => r.name)).size !== ownedRows.length) throw new Error('Ambiguous cloud create');
  for (const entry of state.monitors) {
    const row = ownedRows.find(r => r.id === entry.id);
    if (!row && !(state.pending?.kind === 'delete' && state.pending.id === entry.id)) throw new Error('Missing owned cloud monitor');
  }
  if (!state.pending) {
    if (ownedRows.length !== state.monitors.length || ownedRows.some(r => !state.monitors.some(m => m.id === r.id))) throw new Error('Unjournaled cloud monitor');
    return state;
  }
  const intent = state.pending;
  if (intent.kind === 'create') {
    const found = ownedRows.find(r => r.name === intent.name);
    if (!found) throw new Error('Cloud create remains unknown; do not retry');
    if (!state.monitors.some(m => m.id === found.id)) state.monitors.push({ id: found.id, name: found.name });
  } else {
    if (ownedRows.some(r => r.id === intent.id)) throw new Error('Cloud delete remains unknown; do not retry');
    state.monitors = state.monitors.filter(m => m.id !== intent.id);
  }
  state.pending = null; await save(state); return state;
}

export function protection(owner) {
  return { data: { type: 'downtime', attributes: { monitor_identifier: { monitor_tags: selector(owner) }, scope: '*', schedule: {}, mute_first_recovery_notification: true, notify_end_states: [], notify_end_types: [] } } };
}
export function verifyProtection(record, owner) {
  const a = record?.attributes;
  if (record?.type !== 'downtime' || !/^[A-Za-z0-9-]{1,128}$/.test(record?.id ?? '') || a?.status !== 'active' || a.scope !== '*' || a.schedule?.end || a.schedule?.recurrences?.length || a.schedule?.current_downtime?.end || a.mute_first_recovery_notification !== true || a.notify_end_states?.length !== 0 || a.notify_end_types?.length !== 0 || JSON.stringify(a.monitor_identifier?.monitor_tags?.slice().sort()) !== JSON.stringify(selector(owner).sort()) || Object.keys(a.monitor_identifier).length !== 1) throw new Error('Cloud suppression unconfirmed');
  return record.id;
}
export async function install(state, api, save) {
  validateState(state); state.verified = false; await save(state);
  if (state.protection?.pending) await reconcileProtection(state, api, save);
  if (!state.protection) {
    state.protection = { pending: true, id: null }; await save(state);
    const result = await api.call('POST', '/api/v2/downtime', protection(state.owner));
    state.protection.id = verifyProtection(result.data, state.owner); state.protection.pending = false; await save(state);
  }
  if (state.protection.pending || !state.protection.id) throw new Error('Suppression creation unknown; reconcile before retry');
  const guard = async () => {
    verifyProtection((await api.call('GET', `/api/v2/downtime/${state.protection.id}`)).data, state.owner);
  };
  await guard(); await reconcile(state, api, save);
  for (const definition of definitions(state.owner)) {
    if (!state.monitors.some(m => m.name === definition.name)) {
      const all = await inventory(api.list, state.owner);
      if (all.some(m => m.name === definition.name)) throw new Error('Reserved cloud monitor name exists');
      await guard(); state.pending = { kind: 'create', name: definition.name }; await save(state);
      const result = await api.call('POST', '/api/v1/monitor', definition);
      owned(result, definition);
      await reconcile(state, api, save);
    }
  }
  for (const entry of state.monitors) {
    await guard(); owned(await api.get(entry.id), definitions(state.owner).find(m => m.name === entry.name));
    const matches = await api.call('GET', `/api/v2/monitor/${entry.id}/downtime_matches?page%5Boffset%5D=0&page%5Blimit%5D=100`);
    if (!Array.isArray(matches.data) || matches.data.length !== 1 || matches.data[0].id !== state.protection.id || matches.meta?.page?.total_filtered_count !== 1 || matches.data[0].attributes?.scope !== '*' || matches.data[0].attributes?.end) throw new Error('Effective cloud suppression unconfirmed');
  }
  state.verified = true; await save(state);
  return state;
}
export async function removeOwned(state, api, save) {
  validateState(state); state.verified = false; await save(state); await reconcile(state, api, save);
  if (!state.protection?.id || state.protection.pending) throw new Error('Cloud suppression required');
  verifyProtection((await api.call('GET', `/api/v2/downtime/${state.protection.id}`)).data, state.owner);
  for (const entry of [...state.monitors]) {
    owned(await api.get(entry.id), definitions(state.owner).find(m => m.name === entry.name));
    state.pending = { kind: 'delete', name: entry.name, id: entry.id }; await save(state);
    await api.call('DELETE', `/api/v1/monitor/${entry.id}`);
    await reconcile(state, api, save);
  }
  return state;
}
export async function makeCloudApi(credentials, request) { return cloudApi(credentials, request, false); }
export async function makeTriggerApi(credentials, request) { return cloudApi(credentials, request, true); }
async function cloudApi(credentials, request, trigger) {
  if (!request) request = (await import('node:https')).request;
  if (typeof credentials?.apiKey !== 'string' || typeof credentials?.appKey !== 'string' || !/^[a-zA-Z0-9]{32}$/.test(credentials.apiKey) || !/^[a-zA-Z0-9]{40}$/.test(credentials.appKey)) throw new Error('Invalid management credentials');
  const call = (method, endpoint, body) => {
    const triggerRead = trigger && method === 'GET' && /^\/api\/(?:v1\/monitor\/[1-9][0-9]*\?group_states=all|v2\/monitor\/notification_rule(?:\/[A-Za-z0-9-]{1,128}|\?page=(?:[0-9]|10)&per_page=100&sort=name%3Aasc))$/.test(endpoint);
    if (!triggerRead && (!['GET', 'POST', 'DELETE'].includes(method) || !/^\/api\/(?:v1\/monitor(?:\/\d+|\?page=\d+&page_size=100)?|v2\/downtime(?:\/[A-Za-z0-9-]+|\?page%5Boffset%5D=\d+&page%5Blimit%5D=100)?|v2\/monitor\/\d+\/downtime_matches\?page%5Boffset%5D=0&page%5Blimit%5D=100)$/.test(endpoint))) throw new Error('Invalid management operation');
    return new Promise((resolve, reject) => {
      let req, done = false, size = 0, chunks = [];
      const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); req?.destroy(); if (error) reject(new Error('Cloud provider outcome unknown')); else resolve(value); };
      const timer = setTimeout(() => finish(true), 5000);
      try {
        req = request({ hostname: 'api.us3.datadoghq.com', port: 443, path: endpoint, method, headers: { 'DD-API-KEY': credentials.apiKey, 'DD-APPLICATION-KEY': credentials.appKey, 'Content-Type': 'application/json' } }, res => {
          res.on('error', () => finish(true)); res.on('aborted', () => finish(true));
          res.on('data', b => { size += b.length; if (size > 1048576) finish(true); else chunks.push(b); });
          res.on('end', () => { if (res.statusCode < 200 || res.statusCode >= 300) return finish(true); try { finish(false, size ? JSON.parse(Buffer.concat(chunks).toString()) : null); } catch { finish(true); } });
        }); req.on('error', () => finish(true)); req.end(body === undefined ? undefined : JSON.stringify(body));
      } catch { finish(true); }
    });
  };
  return { call, list: (page, size) => { if (size !== 100) throw new Error('Invalid page size'); return call('GET', `/api/v1/monitor?page=${page}&page_size=100`); }, get: id => call('GET', `/api/v1/monitor/${id}`) };
}

async function main() {
  const { pathToFileURL } = await import('node:url');
  if (!process.argv[1] || import.meta.url !== pathToFileURL(process.argv[1]).href) return;
  const mode = process.argv[2];
  if (process.getuid() !== 0 || process.argv.length !== 3 || !['install', 'delete', 'inspect'].includes(mode)) throw new Error('Root installer command required');
  const journal = new Journal();
  await journal.locked(async () => {
    const secret = await open('/run/deskdrop-management/management', constants.O_RDONLY | constants.O_NOFOLLOW);
    let credentials;
    try { const st = await secret.stat(); if (!st.isFile() || st.uid !== 0 || (st.mode & 0o777) !== 0o600 || st.nlink !== 1 || st.size > 4096) throw new Error('Unsafe management file'); credentials = JSON.parse(await secret.readFile('utf8')); } finally { await secret.close(); }
    const api = await makeCloudApi(credentials);
    const state = await journal.read();
    const save = value => journal.save(value);
    if (mode === 'install') await install(state, api, save);
    else if (mode === 'delete') await removeOwned(state, api, save);
    else { if (state.protection?.pending) await reconcileProtection(state, api, save); await reconcile(state, api, save); }
    console.log(JSON.stringify({ status: mode === 'install' ? 'protected' : 'reconciled', count: state.monitors.length }));
  });
}
main().catch(error => { console.error(error.code === 'DESKDROP_INSTALLATION_LOCK_HELD' ? error.message : 'Cloud installation requires reconciliation'); process.exitCode = 1; });

export async function recoverProtection(state, id, api, save) {
  validateState(state);
  if (state.protection?.pending !== true || state.protection.id !== null || !/^[A-Za-z0-9-]{1,128}$/.test(id)) throw new Error('Invalid suppression reconciliation');
  const record = (await api.call('GET', `/api/v2/downtime/${id}`)).data;
  verifyProtection(record, state.owner);
  state.protection = { pending: false, id: record.id }; await save(state);
  return state;
}

// Two complete, stable reads; ambiguity never authorizes a second POST.
export async function reconcileProtection(state, api, save) {
  if (state.protection?.pending !== true) return state;
  async function scan() {
    const rows = [], seen = new Set(); let total;
    for (let offset = 0; offset < 10000; offset += 100) {
      const result = await api.call('GET', `/api/v2/downtime?page%5Boffset%5D=${offset}&page%5Blimit%5D=100`);
      const count = result.meta?.page?.total_filtered_count;
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000 || (total !== undefined && count !== total) || !Array.isArray(result.data) || result.data.length > 100) throw new Error('Incomplete suppression inventory');
      total = count;
      for (const r of result.data) {
        if (typeof r.id !== 'string' || seen.has(r.id)) throw new Error('Ambiguous suppression inventory');
        seen.add(r.id); rows.push(r);
      }
      if (result.data.length < 100) { if (rows.length !== total) throw new Error('Incomplete suppression inventory'); return rows.sort((a,b) => a.id.localeCompare(b.id)); }
    }
    throw new Error('Incomplete suppression inventory');
  }
  const rows = await scan();
  if (hash(rows.map(r => suppressionIdentity(r, state.owner))) !== hash((await scan()).map(r => suppressionIdentity(r, state.owner)))) throw new Error('Changing suppression inventory');
  const matches = rows.filter(r => r.attributes?.monitor_identifier?.monitor_tags?.includes(state.owner));
  if (matches.length !== 1) throw new Error('Suppression creation remains unknown');
  return recoverProtection(state, matches[0].id, api, save);
}
