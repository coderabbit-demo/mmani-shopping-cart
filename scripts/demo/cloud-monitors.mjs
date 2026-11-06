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
export async function inventory(page) {
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
  if (hash(first) !== hash(await scan())) throw new Error('Changing cloud inventory');
  return first;
}
export function validateState(state) {
  selector(state?.owner);
  if (state.schema !== 1 || !Array.isArray(state.monitors) || state.monitors.length > 3 || ![null, 'create', 'delete'].includes(state.pending?.kind ?? null)) throw new Error('Invalid cloud journal');
  const ids = new Set(), names = new Set();
  for (const row of state.monitors) {
    const expected = definitions(state.owner).find(m => m.name === row.name);
    if (!expected || ids.has(row.id) || names.has(row.name) || !Number.isSafeInteger(row.id) || row.id < 1 || localIds.has(row.id)) throw new Error('Invalid cloud journal');
    ids.add(row.id); names.add(row.name);
  }
  if (state.pending && (!definitions(state.owner).some(m => m.name === state.pending.name) || (state.pending.kind === 'delete' && !ids.has(state.pending.id)))) throw new Error('Invalid cloud intent');
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
    await mkdir(lock, { mode: 0o700 });
    try { return await fn(); } finally { await (await import('node:fs/promises')).rmdir(lock); }
  }
}

export async function reconcile(state, api, save) {
  validateState(state);
  const rows = await inventory(api.list);
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
