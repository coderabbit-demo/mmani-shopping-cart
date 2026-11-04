import { createSocket } from 'node:dgram';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { journeyLocal, validateLocal } from './checker.mjs';

const target = 'http://deskdrop.test:3000';
const host = 'deskdrop-mmani-local';
const tags = 'service:deskdrop,env:local-demo,demo_id:mmani-shopping-cart-local';
const healthFile = '/tmp/deskdrop-runner-health';
export function datagram(name, status) {
  if (!['availability', 'checkout', 'heartbeat'].includes(name) || ![0, 2].includes(status)) throw new Error('Invalid check');
  return Buffer.from(`_sc|deskdrop.local.${name}|${status}|h:${host}|#${tags}`);
}
export function diagnostic(name, config) {
  if (!['availability', 'checkout'].includes(name)) throw new Error('Invalid check');
  const { source, image } = validateLocal(config);
  return { event: 'deskdrop_check', check: name, failure_class: name === 'availability' ? 'http_unavailable' : 'journey_failed', stage: name === 'availability' ? 'http' : 'checkout', source, image_id: image, expected: name === 'availability' ? 'http_success' : 'checkout_receipt_history', actual: 'failed' };
}
export function send(socket, name, status) {
  return new Promise((resolve, reject) => socket.send(datagram(name, status), 8125, 'agent', error => error ? reject(error) : resolve()));
}
export async function availability(fetcher = fetch) {
  try {
    const response = await fetcher(target, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 300;
  } catch { return false; }
}
export function scheduler({ now = () => performance.now(), interval = 30000, report, runAvailability, runJourney, markHealthy, markResult = () => {}, setTimer = setInterval, clearTimer = clearInterval }) {
  let closed = false, current = null, available = null;
  let nextAvailability = now(), nextJourney = now(), nextHeartbeat = now();
  const emit = (name, status) => { if (name !== 'heartbeat') void Promise.resolve(markResult(name, status)).catch(() => {}); return Promise.resolve(report(name, status)).catch(() => {}); };
  function tick() {
    if (closed) return;
    const t = now();
    if (t >= nextHeartbeat) { nextHeartbeat = t + interval; void emit('heartbeat', 0); void Promise.resolve(markHealthy()).catch(() => {}); }
    if (t >= nextAvailability) {
      nextAvailability = t + interval;
      if (!available) { const job = { skipped: false }; available = job; Promise.resolve().then(runAvailability).then(ok => { if (!job.skipped) return emit('availability', ok ? 0 : 2); }, () => { if (!job.skipped) return emit('availability', 2); }).finally(() => { if (available === job) available = null; }); }
      else { available.skipped = true; void emit('availability', 2); }
    }
    if (t >= nextJourney) {
      nextJourney = t + interval;
      if (current) { current.skipped = true; void emit('checkout', 2); }
      else {
        try { const job = { ...runJourney(), skipped: false }; current = job; Promise.resolve(job.promise).then(ok => { if (!job.skipped) return emit('checkout', ok ? 0 : 2); }, () => { if (!job.skipped) return emit('checkout', 2); }).finally(() => { if (current === job) current = null; }); }
        catch { current = null; void emit('checkout', 2); }
      }
    }
  }
  tick();
  const timer = setTimer(tick, 250);
  return { tick, async stop() { closed = true; clearTimer(timer); if (current) { await current.stop(); await current.promise; } } };
}
async function main() {
  const mode = process.argv[2];
  if (mode === '--health' && process.argv.length === 3) {
    const value = Number(await readFile(healthFile, 'utf8'));
    if (!Number.isFinite(value) || Date.now() - value > 65000 || Date.now() < value) process.exitCode = 1;
    return;
  }
  if (mode === '--emit' && process.argv.length === 5) {
    const status = Number(process.argv[4]);
    const socket = createSocket('udp4');
    try { await send(socket, process.argv[3], status); } finally { socket.close(); }
    return;
  }
  const config = validateLocal({ url: process.env.CHECKER_URL, source: process.env.SOURCE_COMMIT, image: process.env.APP_IMAGE_ID });
  if (mode === '--journey' && process.argv.length === 3) { await journeyLocal(config); return; }
  if (mode !== '--relay' || process.argv.length !== 3) throw new Error('Invalid command');
  await writeFile(healthFile, String(Date.now()));
  const timer = setInterval(() => { void writeFile(healthFile, String(Date.now())); }, 15000);
  const stop = () => { clearInterval(timer); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Local checker failed'); process.exitCode = 1; });
