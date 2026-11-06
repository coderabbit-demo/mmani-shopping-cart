import { mkdtemp, mkdir, chmod, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { checkoutSha } from './cloud-release.mjs';
import { TriggerStore, runTrigger, protectionHandoff, verifyRouting } from '../../scripts/demo/cloud-trigger.mjs';
import { Journal, definitions, protection } from '../../scripts/demo/cloud-monitors.mjs';

export { runTrigger, protectionHandoff, verifyRouting };
const clone = value => structuredClone(value);
const reject = () => { throw new Error('Unsupported or closed offline trigger fixture operation'); };
const keys = (value, expected) => value && same(Object.keys(value).sort(), expected.slice().sort());

// This factory supplies state and adapters, never a workflow or a pass verdict.
export async function withCloudTriggerFixture(callback, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['epoch','boot'].includes(k))) reject();
  const { epoch = 1793900000000, boot = 'synthetic-boot-one' } = options;
  if (typeof callback !== 'function' || !Number.isSafeInteger(epoch) || epoch < 0 || typeof boot !== 'string' || !/^synthetic-[a-z0-9-]{1,64}$/.test(boot) || typeof process.getuid !== 'function') reject();
  const directory = await mkdtemp(path.join(os.homedir(), '.deskdrop-trigger-fixture-'));
  let active = true, wall = epoch, elapsed = 0, bootId = boot;
  const calls = [], receipts = [], faults = new Map(), pauses = new Map();
  const check = () => { if (!active) reject(); };
  try {
    await chmod(directory, 0o700);
    const triggerDir = path.join(directory, 'trigger'), monitorDir = path.join(directory, 'monitoring');
    await mkdir(triggerDir, { mode: 0o700 }); await mkdir(monitorDir, { mode: 0o700 });
    const uid = process.getuid(), actualSourceSha = await checkoutSha();
    const owner = `cloud_owner:${'a'.repeat(32)}`, appId = '5'.repeat(64), networkId = '6'.repeat(64);
    const config = { owner, project: 'se-demos-project', zone: 'us-central1-a', architecture: 'linux/amd64', source: '1'.repeat(40),
      app: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:${'2'.repeat(64)}`,
      checker: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/checker@sha256:${'3'.repeat(64)}`, bundleHash: '4'.repeat(64) };
    const monitors = definitions(owner).map((m, i) => ({ ...m, id: 700 + i, state: { groups: { 'host:deskdrop-demo': { status: 'OK', last_resolved_ts: Math.floor(epoch / 1000) - 100, last_nodata_ts: 0, last_triggered_ts: 0 } } } }));
    const state = { schema: 1, owner, verified: true, pending: null, protection: { pending: false, id: 'broad' }, monitors: monitors.map(({ id, name }) => ({ id, name })) };
    const route = { rule: 'synthetic-rule', recipient: 'webhook-synthetic-cloud' };
    let rules = [{ id: route.rule, type: 'monitor-notification-rule', attributes: { name: 'Synthetic route', filter: { tags: definitions(owner)[0].tags }, conditional_recipients: { conditions: [{ scope: 'transition_type:is_alert', recipients: [route.recipient] }], fallback_recipients: [] } } }];
    const downtimes = [{ id: 'broad', ...protection(owner).data }]; downtimes[0].attributes.status = 'active';
    let app = { Id: appId, Config: { Image: config.app, User: '1000:1000', Labels: { 'org.opencontainers.image.revision': config.source } }, State: { Running: true }, HostConfig: { Privileged: false }, Mounts: [], NetworkSettings: { Networks: { deskdrop_isolated: { NetworkID: networkId } } } };
    let health = { healthy: true, updated: wall, owner, source: config.source };
    const lease = { schema: 1, installation: 'mmani-shopping-cart-gcp', run: '11111111-1111-4111-8111-111111111111', actor: 'synthetic-actor', boot: bootId, started: Math.floor(epoch / 1000), deadline: Math.floor(epoch / 1000) + 360, phase: 'admitted', recoverRequested: false };
    const names = { 'lease.json': triggerDir, 'operation.json': triggerDir, 'route.json': triggerDir, 'installation.json': monitorDir };
    async function bytes(name) {
      check(); if (!Object.hasOwn(names, name)) reject();
      const object = name === 'installation.json' ? journal : store;
      if (name === 'installation.json') await object.read(); else await object.load(name);
      return readFile(path.join(names[name], name));
    }
    class Store extends TriggerStore {
      guard() { check(); if (this.directory !== triggerDir || this.uid !== uid) reject(); }
      async directorySafe() { this.guard(); return super.directorySafe(); }
      async load(...args) { this.guard(); return super.load(...args); }
      async save(value) { this.guard(); await super.save(value); receipts.push({ kind: 'operation', bytes: await bytes('operation.json') }); }
    }
    class MonitorJournal extends Journal {
      guard() { check(); if (this.directory !== monitorDir || this.uid !== uid) reject(); }
      async directorySafe() { this.guard(); return super.directorySafe(); }
      async read() { this.guard(); return super.read(); }
      async save(value) { this.guard(); await super.save(value); receipts.push({ kind: 'installation', bytes: await bytes('installation.json') }); }
    }
    const store = new Store(triggerDir, uid), journal = new MonitorJournal(monitorDir, uid);
    await store.directorySafe(); await journal.directorySafe();
    await writeFile(path.join(triggerDir, 'lease.json'), JSON.stringify(lease), { mode: 0o600, flag: 'wx' });
    await writeFile(path.join(triggerDir, 'route.json'), JSON.stringify(route), { mode: 0o600, flag: 'wx' });
    await journal.save(state);
    const matches = id => downtimes.filter(r => r.attributes.status === 'active' && (r.attributes.monitor_identifier.monitor_tags?.includes(owner) || r.attributes.monitor_identifier.monitor_id === id));
    function operation(service, method, endpoint, body) {
      check(); if (typeof endpoint !== 'string') reject();
      if (service === 'docker') {
        if (body !== undefined) reject();
        if (method === 'GET' && endpoint === '/v1.52/containers/json?all=true') return () => [{ Id: appId, Labels: { 'com.docker.compose.project': 'deskdrop', 'com.docker.compose.service': 'app' } }];
        if (method === 'GET' && endpoint === `/v1.52/containers/${appId}/json`) return () => app;
        if (method === 'GET' && endpoint === `/v1.52/networks/${networkId}`) return () => ({ Name: 'deskdrop_isolated', Internal: true, EnableIPv6: false, Options: { 'com.docker.network.bridge.name': 'br-deskdrop' } });
        if (method === 'POST' && [`/v1.52/containers/${appId}/start`, `/v1.52/containers/${appId}/stop?t=3`].includes(endpoint)) return () => { app.State.Running = endpoint.endsWith('/start'); return null; };
        reject();
      }
      if (service !== 'provider') reject();
      if (method === 'GET') {
        if (body !== undefined) reject();
        let m;
        if ((m = endpoint.match(/^\/api\/v1\/monitor\?page=(\d{1,2})&page_size=100$/))) return () => monitors.slice(Number(m[1]) * 100, Number(m[1]) * 100 + 100);
        if ((m = endpoint.match(/^\/api\/v1\/monitor\/(700|701|702)(?:\?group_states=all)?$/))) return () => monitors.find(r => r.id === Number(m[1]));
        if ((m = endpoint.match(/^\/api\/v2\/monitor\/(700|701|702)\/downtime_matches\?page%5Boffset%5D=0&page%5Blimit%5D=100$/))) return () => { const rows = matches(Number(m[1])); return { data: rows.map(r => ({ id: r.id, attributes: { scope: r.attributes.scope } })), meta: { page: { total_filtered_count: rows.length } } }; };
        if ((m = endpoint.match(/^\/api\/v2\/downtime\?page%5Boffset%5D=(0|[1-9]\d{0,3}00)&page%5Blimit%5D=100$/))) return () => ({ data: downtimes.slice(Number(m[1]), Number(m[1]) + 100), meta: { page: { total_filtered_count: downtimes.length } } });
        if ((m = endpoint.match(/^\/api\/v2\/monitor\/notification_rule\?page=([0-9]|10)&per_page=100&sort=name%3Aasc$/))) return () => ({ data: rules.slice(Number(m[1]) * 100, Number(m[1]) * 100 + 100), meta: { page: { total_count: rules.length } } });
        if (endpoint === `/api/v2/monitor/notification_rule/${route.rule}`) return () => ({ data: rules.find(r => r.id === route.rule) });
        if ((m = endpoint.match(/^\/api\/v2\/downtime\/([A-Za-z0-9-]+)$/)) && downtimes.some(r => r.id === m[1])) return () => ({ data: downtimes.find(r => r.id === m[1]) });
      }
      if (method === 'DELETE' && body === undefined && endpoint.startsWith('/api/v2/downtime/')) {
        const row = downtimes.find(r => endpoint === `/api/v2/downtime/${r.id}`); if (!row) reject();
        return () => { row.attributes.status = 'canceled'; return null; };
      }
      if (method === 'POST' && endpoint === '/api/v2/downtime') {
        const a = body?.data?.attributes, identifier = a?.monitor_identifier;
        if (!keys(body, ['data']) || !keys(body.data, ['type','attributes']) || body.data.type !== 'downtime' || !keys(a, ['monitor_identifier','scope','schedule','mute_first_recovery_notification','notify_end_states','notify_end_types', ...(a?.message === undefined ? [] : ['message'])]) || a.scope !== '*' || !same(a.schedule, {}) || a.mute_first_recovery_notification !== true || !same(a.notify_end_states, []) || !same(a.notify_end_types, [])) reject();
        if (!(keys(identifier, ['monitor_id']) && [700,701,702].includes(identifier.monitor_id)) && !(keys(identifier, ['monitor_tags']) && same(identifier.monitor_tags?.slice().sort(), definitions(owner)[0].tags.slice().sort()))) reject();
        if (a.message !== undefined && (typeof a.message !== 'string' || a.message.length > 256)) reject();
        return () => { const row = { ...clone(body.data), id: `guard-${downtimes.length}` }; row.attributes.status = 'active'; downtimes.push(row); return { data: row }; };
      }
      reject();
    }
    async function dispatch(service, method, endpoint, body) {
      const execute = operation(service, method, endpoint, body), key = `${service} ${method} ${endpoint}`;
      let intent = null; try { intent = await bytes('operation.json'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const entry = { service, method, endpoint, body: clone(body), wall, boot: bootId, intent, outcome: 'pending' }; calls.push(entry);
      const fault = faults.get(key); faults.delete(key);
      if (fault === 'before') { entry.outcome = 'rejected-before'; throw new Error('Controlled unavailable response'); }
      const result = clone(execute());
      if (fault === 'after') { entry.outcome = 'unknown-after'; throw new Error('Controlled lost response'); }
      const gate = pauses.get(key);
      if (gate) { gate.reached(); await gate.wait; pauses.delete(key); check(); }
      entry.outcome = 'returned'; return result;
    }
    const api = { call: (m,p,b) => dispatch('provider',m,p,b), list: (page,size) => { if (!Number.isInteger(page) || page < 0 || page > 99 || size !== 100) reject(); return dispatch('provider','GET',`/api/v1/monitor?page=${page}&page_size=100`); }, get: id => dispatch('provider','GET',`/api/v1/monitor/${id}`) };
    const context = { config: clone(config), state: clone(state), api, docker: (m,p,b) => dispatch('docker',m,p,b), store, journal, route: clone(route), health: async () => { check(); return clone(health); }, now: () => { check(); return wall; }, monotonic: () => { check(); return elapsed; }, sleep: async ms => { check(); if (!Number.isFinite(ms) || ms < 0 || ms > 180000) reject(); wall += ms; elapsed += ms; } };
    const controls = {
      setGroup(id, group) { check(); const row = monitors.find(r => r.id === id); if (!row || !group || typeof group !== 'object') reject(); row.state = { groups: { 'host:deskdrop-demo': clone(group) } }; },
      setApp(value) { check(); if (!value || typeof value !== 'object') reject(); app = clone(value); },
      setRules(value) { check(); if (!Array.isArray(value) || value.length > 1000) reject(); rules = clone(value); },
      setHealth(value) { check(); health = clone(value); },
      snapshot() { check(); return clone({ app, monitors, downtimes, rules, health }); },
      failNext(service, method, endpoint, when, body) { operation(service,method,endpoint,body); if (!['before','after'].includes(when)) reject(); faults.set(`${service} ${method} ${endpoint}`,when); },
      pauseNext(service, method, endpoint, body) {
        operation(service,method,endpoint,body); const key = `${service} ${method} ${endpoint}`; if (pauses.has(key)) reject();
        let reached, release; const observed = new Promise(r => { reached = r; }); const wait = new Promise(r => { release = r; });
        pauses.set(key, { reached, wait, release }); return { reached: observed, resume: () => { check(); release(); } };
      },
    };
    const clock = { read: () => { check(); return { epoch: wall, monotonic: elapsed, boot: bootId }; }, set(value) { check(); if (!keys(value,['epoch','monotonic','boot']) || !Number.isSafeInteger(value.epoch) || value.epoch < 0 || !Number.isSafeInteger(value.monotonic) || value.monotonic < 0 || !/^synthetic-[a-z0-9-]{1,64}$/.test(value.boot)) reject(); wall = value.epoch; elapsed = value.monotonic; bootId = value.boot; } };
    return await callback({ directory, actualSourceSha, synthetic: clone({ source: config.source, owner, appId, networkId, lease }), context, controls, clock, readBytes: bytes, calls: () => { check(); return clone(calls); }, receipts: () => { check(); return clone(receipts); } });
  } finally {
    active = false;
    for (const gate of pauses.values()) gate.release();
    await rm(directory, { recursive: true, force: true });
  }
}
