import test from 'node:test';
import assert from 'node:assert/strict';
import { datagram, availability, scheduler } from '../deploy/local-checker.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
test('DogStatsD service checks use fixed host, scoped tags and only allowed statuses', () => {
  assert.equal(datagram('checkout', 2).toString(), '_sc|deskdrop.local.checkout|2|h:deskdrop-mmani-local|#service:deskdrop,env:local-demo,demo_id:mmani-shopping-cart-local');
  assert.throws(() => datagram('other', 0));
  assert.throws(() => datagram('checkout', 3));
});
test('availability reports network failures, redirect errors and non-success without a body', async () => {
  assert.equal(await availability(async (_, opts) => { assert.equal(opts.redirect, 'error'); return { status: 200, body: { cancel: async () => {} } }; }), true);
  assert.equal(await availability(async () => ({ status: 503 })), false);
  assert.equal(await availability(async () => { throw new Error('private'); }), false);
});
test('independent ticks do not overlap journeys and continue heartbeat and availability', async () => {
  let time = 0, release, iterations = 0;
  const events = [], journey = new Promise(resolve => { release = resolve; });
  const runner = scheduler({ now: () => time, report: (name, status) => events.push([name, status]), runAvailability: async () => true, runJourney: () => { iterations++; return { promise: journey, stop: () => release(false) }; }, markHealthy: () => {}, setTimer: () => 1, clearTimer: () => {} });
  await flush();
  time = 30000; runner.tick(); await flush();
  assert.equal(iterations, 1);
  assert.equal(events.filter(e => e[0] === 'heartbeat').length, 2);
  assert.equal(events.filter(e => e[0] === 'availability').length, 2);
  assert.deepEqual(events.find(e => e[0] === 'checkout'), ['checkout', 2]);
  release(false); await flush();
  time = 60000; runner.tick(); await flush();
  assert.equal(iterations, 2);
  await runner.stop();
});
test('late check results cannot emit a false recovery after an overrun', async () => {
  let time = 0, releaseHttp, releaseJourney;
  const events = [], http = new Promise(resolve => { releaseHttp = resolve; }), journey = new Promise(resolve => { releaseJourney = resolve; });
  const runner = scheduler({ now: () => time, report: (name, status) => events.push([name, status]), runAvailability: () => http, runJourney: () => ({ promise: journey, stop: () => releaseJourney(false) }), markHealthy: () => {}, setTimer: () => 1, clearTimer: () => {} });
  await flush(); time = 30000; runner.tick(); await flush();
  releaseHttp(true); releaseJourney(true); await flush();
  assert.deepEqual(events.filter(([name]) => name === 'availability' || name === 'checkout'), [['availability', 2], ['checkout', 2]]);
  await runner.stop();
});
test('stopping the runner stops heartbeat submission without inventing no-data evidence', async () => {
  let time = 0, running = true;
  const events = [];
  const runner = scheduler({ now: () => time, report: (name, status) => events.push([name, status]), runAvailability: async () => true, runJourney: () => ({ promise: Promise.resolve(true), stop() { running = false; } }), markHealthy: () => {}, setTimer: () => 1, clearTimer: () => {} });
  await flush();
  await runner.stop(); time = 120000; runner.tick(); await flush();
  assert.equal(events.filter(([name]) => name === 'heartbeat').length, 1);
  assert.equal(running, true);
});
test('send emits fixed private DogStatsD bytes and diagnostics only allow safe fields', async () => {
  const { send, diagnostic } = await import('../deploy/local-checker.mjs');
  let sent;
  const socket = { send(bytes, port, host, cb) { sent = { bytes: bytes.toString(), port, host }; cb(); } };
  await send(socket, 'availability', 0);
  assert.deepEqual(sent, { bytes: '_sc|deskdrop.local.availability|0|h:deskdrop-mmani-local|#service:deskdrop,env:local-demo,demo_id:mmani-shopping-cart-local', port: 8125, host: 'agent' });
  const data = diagnostic('checkout', { url: 'http://deskdrop.test:3000', source: 'a'.repeat(40), image: `sha256:${'b'.repeat(64)}`, secret: 'private' });
  assert.equal(data.failure_class, 'journey_failed');
  assert.equal(data.stage, 'checkout');
  assert.equal(JSON.stringify(data).includes('private'), false);
});
