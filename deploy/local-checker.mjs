import { createSocket } from 'node:dgram';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { journeyLocal, validateLocal } from './checker.mjs';

const target = 'http://deskdrop.test:3000';
const host = 'deskdrop-mmani-local';
const tags = 'service:deskdrop,env:local-demo,demo_id:mmani-shopping-cart-local';
const healthFile = '/tmp/deskdrop-runner-health';
const amounts = { subtotal: '$100', discount: '-$15', shipping: '$12', total: '$97' };
const steps = { navigation: 'storefront_load', add_lamp: 'item_added', add_organizer: 'item_added', bag: 'bag_open', coupon: 'coupon_applied', checkout_open: 'checkout_open', shipping: 'express_selected', details: 'synthetic_details_entered', submit: 'order_submitted', receipt_url: 'checkout_success', receipt: 'receipt_verified', history_open: 'history_open', history: 'history_verified' };
export function safeObservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'actual,expected,stage') throw new Error('Invalid observation');
  const { stage, expected, actual } = value;
  if (['journey', 'checkout'].includes(stage) && expected === 'checkout_receipt_history' && actual === 'failed') return { stage, expected, actual };
  if (stage === 'journey_result' && expected === 'observation' && actual === 'unavailable') return { stage, expected, actual };
  if (Object.hasOwn(steps, stage) && expected === steps[stage] && actual === 'failed') return { stage, expected, actual };
  const match = /^(checkout|receipt|history)_(subtotal|discount|shipping|total|count|lamp|organizer)$/.exec(stage ?? '');
  if (!match || (match[1] === 'checkout' && !amounts[match[2]])) throw new Error('Invalid observation');
  const field = match[2];
  if (amounts[field]) {
    if (expected !== amounts[field] || (actual !== 'unavailable' && !/^-?\$[0-9]{1,3}$/.test(actual ?? ''))) throw new Error('Invalid observation');
  } else if (field === 'count') {
    if (expected !== '2' || (actual !== 'unavailable' && !/^(?:[0-9]|1[0-9]|20)$/.test(actual ?? ''))) throw new Error('Invalid observation');
  } else if (expected !== ({ lamp: 'lamp_terracotta', organizer: 'organizer_natural_oak' })[field] || actual !== 'mismatch') throw new Error('Invalid observation');
  return { stage, expected, actual };
}
export function parseJourneyFailure(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 2048) throw new Error('Invalid observation');
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || value.type !== 'deskdrop-journey-failure' || Object.keys(value).sort().join(',') !== 'actual,expected,stage,type') throw new Error('Invalid observation');
  return safeObservation({ stage: value.stage, expected: value.expected, actual: value.actual });
}
export function datagram(name, status, detail) {
  if (!['availability', 'checkout', 'heartbeat'].includes(name) || ![0, 2].includes(status)) throw new Error('Invalid check');
  let message = '';
  if (detail !== undefined) {
    if (status !== 2 || name === 'heartbeat') throw new Error('Invalid check');
    const { source, image } = validateLocal({ url: target, source: detail.source, image: detail.image_id });
    const observation = name === 'checkout' ? safeObservation({ stage: detail.stage, expected: detail.expected, actual: detail.actual }) : { stage: 'http', expected: 'http_success', actual: 'failed' };
    message = `|m:${JSON.stringify({ source, image_id: image, ...observation })}`;
  }
  return Buffer.from(`_sc|deskdrop.local.${name}|${status}|h:${host}|#${tags}${message}`);
}
export function diagnostic(name, config, observation) {
  if (!['availability', 'checkout'].includes(name)) throw new Error('Invalid check');
  const { source, image } = validateLocal(config);
  const result = name === 'availability' ? { stage: 'http', expected: 'http_success', actual: 'failed' } : observation ? safeObservation(observation) : { stage: 'checkout', expected: 'checkout_receipt_history', actual: 'failed' };
  return { event: 'deskdrop_check', check: name, failure_class: name === 'availability' ? 'http_unavailable' : 'journey_failed', ...result, source, image_id: image };
}
export function send(socket, name, status, detail) {
  return new Promise((resolve, reject) => socket.send(datagram(name, status, detail), 8125, 'agent', error => error ? reject(error) : resolve()));
}
export async function runLocalJourney(config, run = journeyLocal, write = value => console.log(value)) {
  let observation = { stage: 'journey', expected: 'checkout_receipt_history', actual: 'failed' };
  try { await run(config, undefined, undefined, value => { observation = safeObservation(value); }); return true; }
  catch { write(JSON.stringify({ type: 'deskdrop-journey-failure', ...observation })); return false; }
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
  const emit = (name, status, observation) => { if (name !== 'heartbeat') void Promise.resolve(markResult(name, status, observation)).catch(() => {}); return Promise.resolve(report(name, status, observation)).catch(() => {}); };
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
        try { const job = runJourney(); job.skipped = false; current = job; Promise.resolve(job.promise).then(ok => { if (!job.skipped) return emit('checkout', ok ? 0 : 2, job.observation); }, () => { if (!job.skipped) return emit('checkout', 2, job.observation); }).finally(() => { if (current === job) current = null; }); }
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
  if (mode === '--emit' && (process.argv.length === 5 || process.argv.length === 6)) {
    const status = Number(process.argv[4]);
    const detail = process.argv.length === 6 ? JSON.parse(process.argv[5]) : undefined;
    const socket = createSocket('udp4');
    try { await send(socket, process.argv[3], status, detail); } finally { socket.close(); }
    return;
  }
  const config = validateLocal({ url: process.env.CHECKER_URL, source: process.env.SOURCE_COMMIT, image: process.env.APP_IMAGE_ID });
  if (mode === '--journey' && process.argv.length === 3) {
    if (!await runLocalJourney(config)) process.exitCode = 1;
    return;
  }
  if (mode !== '--relay' || process.argv.length !== 3) throw new Error('Invalid command');
  await writeFile(healthFile, String(Date.now()));
  const timer = setInterval(() => { void writeFile(healthFile, String(Date.now())); }, 15000);
  const stop = () => { clearInterval(timer); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Local checker failed'); process.exitCode = 1; });
