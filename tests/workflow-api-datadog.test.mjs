import test from 'node:test';
import assert from 'node:assert/strict';
import { sendDatadog } from '../tools/workflow-api/lib/datadog.mjs';
import { emitEvent, PROJECT_ID } from '../tools/workflow-api/lib/telemetry.mjs';

const apiKey = 'b'.repeat(32);
const event = () => emitEvent(() => {}, { requestId: '01234567-0123-4567-89ab-0123456789ab', actor: 'presenter-1',
  source: { project: 'coderabbit-automation-demo', projectId: PROJECT_ID, environment: 'preview',
    deploymentId: 'dpl_fixture123', commit: 'a'.repeat(40) } });
function fakeClock() {
  let callback, cleared = false;
  return { setTimeout(fn, ms) { assert.equal(ms, 2000); callback = fn; return 1; },
    clearTimeout(id) { assert.equal(id, 1); cleared = true; }, expire() { callback(); }, get cleared() { return cleared; } };
}

test('fixed US3 request preserves identity, maps reserved attributes and cleans responses for 200/202', async () => {
  for (const status of [200, 202]) {
    let calls = 0, cancelled = false;
    const input = event();
    assert.equal(await sendDatadog(input, { apiKey, fetch: async (url, options) => {
      calls++;
      assert.equal(url, 'https://http-intake.logs.us3.datadoghq.com/api/v2/logs');
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(options.headers, { 'Content-Type': 'application/json', 'DD-API-KEY': apiKey });
      assert.ok(options.signal instanceof AbortSignal);
      assert.ok(Buffer.byteLength(options.body) <= 2048);
      assert.equal(options.body.includes(apiKey), false);
      const [log] = JSON.parse(options.body);
      assert.equal(log.service, 'workflow-api'); assert.equal(log.site, 'us3');
      assert.equal(log.status, 'info'); assert.equal(log.message, 'health_checked');
      assert.equal(log.http.status_code, 200);
      assert.equal(log.requestId, input.requestId); assert.equal(log.actor, input.actor);
      assert.deepEqual(log.source, input.source);
      return { status, body: { async cancel() { cancelled = true; } } };
    } }), true);
    assert.equal(calls, 1); assert.equal(cancelled, true);
  }
});

test('missing or invalid key and malformed/oversized events fail before any request', async () => {
  let calls = 0;
  const fetch = async () => { calls++; throw Error('must not send'); };
  for (const key of [undefined, '', 'x', 'b'.repeat(33), 'b'.repeat(31), apiKey + '\n']) {
    assert.equal(await sendDatadog(event(), { apiKey: key, fetch }), false);
  }
  for (const input of [null, {}, [], { ...event(), service: 'other' }, { ...event(), site: 'other' },
    { ...event(), extra: 'secret' }, { ...event(), actor: 'x'.repeat(3000) },
    { ...event(), status: 500 }, { ...event(), event: 'quote_failed' },
    { ...event(), timestamp: 'bad' }, { ...event(), requestId: 'spoof' },
    { ...event(), source: { ...event().source, commit: 'spoof' } },
    { ...event(), source: { ...event().source, arbitrary: 'secret' } }]) {
    assert.equal(await sendDatadog(input, { apiKey, fetch }), false);
  }
  assert.equal(calls, 0);
});

test('non-acknowledgements, provider exceptions and cleanup errors are generic with no retries', async () => {
  for (const status of [204, 301, 400, 401, 403, 429, 500, 503, undefined, '202']) {
    let calls = 0, cancelled = false;
    assert.equal(await sendDatadog(event(), { apiKey, fetch: async () => {
      calls++; return { status, body: { async cancel() { cancelled = true; } } };
    } }), false);
    assert.equal(calls, 1); assert.equal(cancelled, true);
  }
  for (const fetch of [async () => { throw Error(apiKey); }, async () => null,
    async () => ({ status: 202, body: { cancel() { throw Error(apiKey); } } })]) {
    assert.equal(await sendDatadog(event(), { apiKey, fetch }), false);
  }
});

test('whole-attempt deadline bounds ignored abort and hanging cleanup, including late responses', async () => {
  for (const phase of ['fetch', 'cleanup']) {
    const clock = fakeClock();
    let calls = 0, signal, resolveFetch, cancelled = false;
    const pending = sendDatadog(event(), { apiKey, clock, fetch: async (_url, options) => {
      calls++; signal = options.signal;
      if (phase === 'fetch') return new Promise(resolve => { resolveFetch = resolve; });
      return { status: 202, body: { cancel() { cancelled = true; return new Promise(() => {}); } } };
    } });
    await Promise.resolve(); await Promise.resolve();
    let settled = false; pending.then(() => { settled = true; });
    await Promise.resolve(); assert.equal(settled, false);
    clock.expire(); assert.equal(await pending, false);
    assert.equal(signal.aborted, true); assert.equal(clock.cleared, true); assert.equal(calls, 1);
    if (phase === 'fetch') {
      resolveFetch({ status: 202, body: { async cancel() { cancelled = true; } } });
      await Promise.resolve(); await Promise.resolve();
    }
    assert.equal(cancelled, true);
  }
});

test('native deadline settles even when fetch ignores abort without an injected clock', async () => {
  const start = performance.now();
  assert.equal(await sendDatadog(event(), { apiKey, fetch: () => new Promise(() => {}) }), false);
  assert.ok(performance.now() - start < 4000);
});
