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
  return async function call(method, endpoint, body) {
    if (!['GET', 'POST', 'DELETE'].includes(method) || !/^\/v1\.\d+\/(?:version|containers(?:\/json|\/create|\/[a-f0-9]{64}\/(?:json|start|wait|stop|kill))?)(?:\?[a-zA-Z0-9%=&._-]+)?$/.test(endpoint)) throw new Error('Invalid Docker operation');
    return new Promise((resolve, reject) => {
      let done = false, size = 0, chunks = [], req;
      const finish = (error, result) => {
        if (done) return; done = true; clearTimeout(timer); req?.destroy();
        if (error) reject(new Error('Docker operation failed or unknown')); else resolve(result);
      };
      const timer = setTimeout(() => finish(true), 5000);
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
