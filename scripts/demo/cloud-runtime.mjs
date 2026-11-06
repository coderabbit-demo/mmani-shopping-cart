import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { selector, checks } from './cloud-monitors.mjs';

export function datagram(owner, check, status) {
  if (!checks.includes(check) || ![0, 2].includes(status)) throw new Error('Invalid cloud check');
  return Buffer.from(`_sc|deskdrop.cloud.${check}|${status}|h:deskdrop-demo|#${selector(owner).join(',')}`);
}
export function heartbeat(health, now = Date.now()) {
  return health?.healthy === true && Number.isFinite(health.updated) && now >= health.updated && now - health.updated <= 65000 ? 0 : 2;
}
export async function heartbeatWorker({ read, send, failed, setTimer = setInterval, clearTimer = clearInterval }) {
  let busy = false, closed = false, timer;
  const tick = async () => {
    if (closed || busy) return;
    busy = true;
    try { let health; try { health = await read(); } catch {} await send(heartbeat(health)); }
    catch { closed = true; clearTimer(timer); failed(); }
    finally { busy = false; }
  };
  await tick();
  if (!closed) timer = setTimer(() => { void tick(); }, 30000);
  return () => { closed = true; clearTimer(timer); };
}
export function scheduler({ run, report, health, now = () => performance.now(), setTimer = setInterval, clearTimer = clearInterval }) {
  let closed = false, failed = false;
  const jobs = new Map(), next = new Map([['availability', now()], ['checkout', now()]]);
  const mark = async value => { try { await health(value); } catch { failed = true; } };
  const emit = async (name, status) => {
    try { await report(name, status); } catch { failed = true; await mark(false); }
  };
  function tick() {
    if (closed) return;
    for (const name of next.keys()) {
      const time = now();
      if (time < next.get(name)) continue;
      next.set(name, time + 30000);
      if (failed || jobs.has(name)) { if (jobs.has(name)) { jobs.get(name).expired = true; void emit(name, 2); } void mark(false); continue; }
      const job = { cleanupFailed: false }; jobs.set(name, job);
      job.promise = Promise.resolve().then(() => run(name)).then(async result => {
        await emit(name, result === true && !job.expired ? 0 : 2);
      }).catch(async () => { failed = true; job.cleanupFailed = true; await emit(name, 2); await mark(false); }).finally(async () => {
        if (!job.cleanupFailed) jobs.delete(name);
        await mark(!failed && jobs.size === 0);
      });
    }
  }
  tick();
  const timer = setTimer(tick, 250);
  return { tick, status: () => ({ healthy: !failed, active: jobs.size }), async stop() {
    closed = true; clearTimer(timer); await Promise.all([...jobs.values()].map(j => j.promise)); await mark(false);
  } };
}
export async function boundedRun(child, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  async function bounded(fn, ms) {
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(fn), new Promise((_, reject) => { timer = setTimer(() => reject(new Error('Child deadline exceeded')), ms); })]);
    } finally { clearTimer(timer); }
  }
  let passed = false;
  try { passed = await bounded(() => child.wait(), 25000) === 0; }
  catch { passed = false; }
  await bounded(() => child.term(), 3000);
  try { await bounded(() => child.wait(), 3000); } catch { passed = false; }
  await bounded(() => child.remove(), 2000);
  if (await bounded(() => child.running(), 2000)) throw new Error('Owned child cleanup unconfirmed');
  return passed;
}

export function dockerTransport({ request = http.request, socketPath = '/var/run/docker.sock' } = {}) {
  return async function call(method, endpoint, body, timeout = 5000) {
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 5000) throw new Error('Invalid Docker timeout');
    const allowed = {
      GET: /^\/v1\.52\/(?:containers\/json\?all=true|containers\/[a-f0-9]{64}\/json|networks\/[a-f0-9]{64})$/,
      POST: /^\/v1\.52\/containers\/(?:create\?name=deskdrop-cloud-[a-f0-9]{32}-(?:checkout|availability)|[a-f0-9]{64}\/(?:start|stop\?t=3|kill\?signal=SIGKILL))$/,
      DELETE: /^\/v1\.52\/containers\/[a-f0-9]{64}$/,
    };
    if (!allowed[method]?.test(endpoint)) throw new Error('Invalid Docker operation');
    return new Promise((resolve, reject) => {
      let done = false, size = 0, chunks = [], req;
      const finish = (error, result) => {
        if (done) return; done = true; clearTimeout(timer); req?.destroy();
        if (error) reject(new Error('Docker operation failed or unknown')); else resolve(result);
      };
      const timer = setTimeout(() => finish(true), timeout);
      try {
        req = request({ socketPath, path: endpoint, method, headers: { 'Content-Type': 'application/json' } }, res => {
          res.on('error', () => finish(true)); res.on('aborted', () => finish(true));
          res.on('data', b => { size += b.length; if (size > 65536) finish(true); else chunks.push(b); });
          res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) return finish(true);
            try { finish(false, chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null); } catch { finish(true); }
          });
        });
        req.on('error', () => finish(true)); req.end(body === undefined ? undefined : JSON.stringify(body));
      } catch { finish(true); }
    });
  };
}

export function validateRuntime(config) {
  selector(config?.owner);
  if (config.project !== 'se-demos-project' || config.zone !== 'us-central1-a' || config.architecture !== 'linux/amd64' || !/^[a-f0-9]{40}$/.test(config.source ?? '') || /^0+$/.test(config.source)) throw new Error('Invalid runtime identity');
  for (const [key, repository] of [['app', 'deskdrop'], ['checker', 'checker']]) if (!new RegExp(`^us-central1-docker\\.pkg\\.dev/se-demos-project/deskdrop/${repository}@sha256:[a-f0-9]{64}$`).test(config[key] ?? '') || config[key].endsWith('0'.repeat(64))) throw new Error('Invalid runtime image');
  if (!/^[a-f0-9]{64}$/.test(config.bundleHash ?? '')) throw new Error('Invalid bundle identity');
  return config;
}
export function checkerSpec(config, check, seccomp) {
  validateRuntime(config);
  if (!['availability', 'checkout'].includes(check)) throw new Error('Invalid check');
  return { Image: config.checker, User: '1000:1000', Entrypoint: ['node', '/checker/cloud-checker.mjs'], Cmd: [check],
    Env: [`CHECKER_URL=http://deskdrop.test:3000`, `SOURCE_COMMIT=${config.source}`, `APP_IMAGE=${config.app}`],
    Labels: { 'deskdrop.cloud_owner': config.owner, 'deskdrop.source': config.source, 'deskdrop.check': check, 'deskdrop.bundle': config.bundleHash },
    HostConfig: { NetworkMode: 'deskdrop_isolated', ReadonlyRootfs: true, Init: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true', `seccomp=${seccomp}`],
      Tmpfs: { '/tmp': 'rw,nosuid,nodev,size=256m,mode=1777' }, ShmSize: 536870912, Memory: 536870912, NanoCpus: 1000000000,
      Sysctls: { 'net.ipv6.conf.all.disable_ipv6': '1', 'net.ipv6.conf.default.disable_ipv6': '1' }, LogConfig: { Type: 'json-file', Config: { 'max-size': '1m', 'max-file': '2' } } } };
}
export function verifyChild(record, config, check, seccomp) {
  const labels = record?.Config?.Labels, h = record?.HostConfig;
  if (!/^[a-f0-9]{64}$/.test(record?.Id ?? '') || record.Config.Image !== config.checker || record.Config.User !== '1000:1000' || labels?.['deskdrop.cloud_owner'] !== config.owner || labels?.['deskdrop.source'] !== config.source || labels?.['deskdrop.check'] !== check || labels?.['deskdrop.bundle'] !== config.bundleHash || h?.NetworkMode !== 'deskdrop_isolated' || !Array.isArray(record.Mounts) || record.Mounts.some(m => m.Type !== 'tmpfs') || h.Privileged || h.Binds?.length || h.Devices?.length || h.CapAdd?.length || h.ReadonlyRootfs !== true || h.Init !== true || h.CapDrop?.length !== 1 || h.CapDrop[0] !== 'ALL' || !h.SecurityOpt?.includes('no-new-privileges:true') || !h.SecurityOpt.some(s => s.startsWith('seccomp=')) || h.Sysctls?.['net.ipv6.conf.all.disable_ipv6'] !== '1' || !checkerSpec(config, check, '').Env.every(e => record.Config.Env?.includes(e)) || record.Config.Env.some(e => /^(?:.*(?:TOKEN|SECRET|CREDENTIAL)|DD_API_KEY|DD_APP_KEY|DOCKER_HOST|GOOGLE_APPLICATION_CREDENTIALS)=/i.test(e))) throw new Error('Child ownership mismatch');
  if (seccomp !== undefined && (JSON.stringify(record.Config.Entrypoint) !== JSON.stringify(['node','/checker/cloud-checker.mjs']) || JSON.stringify(record.Config.Cmd) !== JSON.stringify([check]) || JSON.stringify(JSON.parse(h.SecurityOpt.find(s => s.startsWith('seccomp=')).slice(8))) !== JSON.stringify(JSON.parse(seccomp)))) throw new Error('Child policy mismatch');
  return record.Id;
}
export async function verifyTarget(config, call) {
  const rows = await call('GET', '/v1.52/containers/json?all=true');
  if (!Array.isArray(rows)) throw new Error('Invalid container inventory');
  const apps = rows.filter(r => r.Labels?.['com.docker.compose.project'] === 'deskdrop' && r.Labels?.['com.docker.compose.service'] === 'app');
  if (apps.length !== 1 || !/^[a-f0-9]{64}$/.test(apps[0].Id)) throw new Error('App identity unknown');
  const app = await call('GET', `/v1.52/containers/${apps[0].Id}/json`);
  if (app.Config?.Image !== config.app || app.Config.User !== '1000:1000' || app.Config.Labels?.['org.opencontainers.image.revision'] !== config.source || !app.State?.Running || app.HostConfig?.Privileged || !Array.isArray(app.Mounts) || app.Mounts.length || Object.keys(app.NetworkSettings?.Networks ?? {}).join() !== 'deskdrop_isolated') throw new Error('App identity mismatch');
  const network = app.NetworkSettings.Networks.deskdrop_isolated.NetworkID;
  if (!/^[a-f0-9]{64}$/.test(network)) throw new Error('Invalid isolated network');
  const n = await call('GET', `/v1.52/networks/${network}`);
  if (n.Name !== 'deskdrop_isolated' || n.Internal !== true || n.EnableIPv6 !== false || n.Options?.['com.docker.network.bridge.name'] !== 'br-deskdrop') throw new Error('App network isolation mismatch');
}
export function jobs(config, call, seccomp, { now = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  validateRuntime(config);
  const prefix = '/v1.52/containers';
  const name = check => `deskdrop-cloud-${config.owner.slice(12)}-${check}`;
  async function find(check, request = call) {
    const rows = await request('GET', `${prefix}/json?all=true`);
    if (!Array.isArray(rows)) throw new Error('Invalid container inventory');
    const found = rows.filter(r => r.Names?.includes(`/${name(check)}`));
    if (found.length > 1) throw new Error('Ambiguous child');
    if (!found.length) return null;
    if (!/^[a-f0-9]{64}$/.test(found[0].Id)) throw new Error('Invalid child ID');
    const record = await request('GET', `${prefix}/${found[0].Id}/json`);
    verifyChild(record, config, check, seccomp); return record;
  }
  async function cleanup(check) {
    const request = (m,p,b) => call(m,p,b,2000);
    let record = await find(check, request);
    if (!record) return;
    if (record.State.Running) { try { await call('POST', `${prefix}/${record.Id}/stop?t=3`, undefined, 4000); } catch {} }
    record = await find(check, request);
    if (record?.State.Running) { try { await request('POST', `${prefix}/${record.Id}/kill?signal=SIGKILL`); } catch {} }
    record = await find(check, request);
    if (record?.State.Running) throw new Error('Child remains running');
    if (record) { try { await request('DELETE', `${prefix}/${record.Id}`); } catch {} }
    if (await find(check, request)) throw new Error('Child removal unconfirmed');
  }
  return { cleanup, async reconcile() { await verifyTarget(config, call); for (const c of ['availability', 'checkout']) await cleanup(c); }, async run(check) {
    checkerSpec(config, check, seccomp);
    const deadline = now() + 25000;
    const request = (m,p,b) => { const left = Math.ceil(deadline - now()); if (left <= 0) throw new Error('Journey deadline'); return call(m,p,b,Math.min(left,5000)); };
    await verifyTarget(config, request);
    if (await find(check, request)) throw new Error('Previous child must be reconciled');
    let passed = false, failure;
    try {
      const created = await request('POST', `${prefix}/create?name=${name(check)}`, checkerSpec(config, check, seccomp));
      if (!/^[a-f0-9]{64}$/.test(created?.Id ?? '')) throw new Error('Child creation unknown');
      const record = await find(check, request);
      if (!record || record.Id !== created.Id) throw new Error('Child creation mismatch');
      await request('POST', `${prefix}/${created.Id}/start`);
      while (now() < deadline) {
        const current = await find(check, request);
        if (!current || current.Id !== created.Id) throw new Error('Child identity lost');
        if (!current.State.Running) { passed = current.State.ExitCode === 0; break; }
        await sleep(Math.min(200, Math.max(0,deadline-now())));
      }
    } catch (e) { failure = e; }
    await cleanup(check);
    if (failure) throw failure;
    return passed;
  } };
}

async function main() {
  const { readFile, open, rename, unlink, lstat } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { createSocket } = await import('node:dgram');
  const { Journal } = await import('./cloud-monitors.mjs');
  const mode = process.argv[2];
  if (!['controller', 'heartbeat', 'cleanup'].includes(mode) || process.argv.length !== 3 || process.getuid() !== 0) throw new Error('Invalid runtime command');
  const journal = new Journal();
  await journal.directorySafe();
  const config = validateRuntime(JSON.parse(await readFile('/opt/deskdrop/monitoring/runtime.json', 'utf8')));
  const state = await journal.read();
  if (state.owner !== config.owner || state.pending || state.monitors.length !== 3 || state.verified !== true) throw new Error('Installation reconciliation required');
  const socket = createSocket('udp4');
  const send = (check, status) => new Promise((resolve, reject) => socket.send(datagram(config.owner, check, status), 8125, '127.0.0.1', e => e ? reject(e) : resolve()));
  const healthPath = '/var/lib/deskdrop/monitoring/health.json';
  const mark = async healthy => {
    await journal.directorySafe();
    try { const st = await lstat(healthPath); if (!st.isFile() || st.isSymbolicLink() || st.uid !== 0 || st.nlink !== 1 || (st.mode & 0o777) !== 0o600) throw new Error('Unsafe health file'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const temp = `${healthPath}.${(await import('node:crypto')).randomBytes(16).toString('hex')}`;
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ healthy, updated: Date.now(), owner: config.owner, source: config.source })); await file.sync(); await rename(temp, healthPath); }
    finally { await file.close(); await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  };
  if (mode === 'heartbeat') {
    const stop = await heartbeatWorker({ read: async () => { let h; try {
      const f = await open(healthPath, (await import('node:fs')).constants.O_RDONLY | (await import('node:fs')).constants.O_NOFOLLOW);
      try { const st = await f.stat(); if (!st.isFile() || st.uid !== 0 || st.nlink !== 1 || (st.mode & 0o777) !== 0o600 || st.size > 1024) throw Error(); h = JSON.parse(await f.readFile('utf8')); if (h.owner !== config.owner || h.source !== config.source) h = null; } finally { await f.close(); }
    } catch {} return h; }, send: status => send('heartbeat', status), failed: () => { process.exitCode = 1; socket.close(); } });
    process.once('SIGTERM', () => { stop(); socket.close(); }); return;
  }
  const profile = await readFile('/opt/deskdrop/checker-seccomp.json', 'utf8');
  if (createHash('sha256').update(profile).digest('hex') !== '6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c') throw new Error('Invalid seccomp profile');
  const work = jobs(config, dockerTransport(), profile);
  await mark(false); await work.reconcile();
  if (mode === 'cleanup') { socket.close(); return; }
  const controller = scheduler({ run: c => work.run(c), report: send, health: mark });
  process.once('SIGTERM', () => { void controller.stop().then(() => socket.close(), () => { process.exitCode = 1; socket.close(); }); });
}
const { pathToFileURL } = await import('node:url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Cloud runtime failed; reconciliation required'); process.exit(1); });
