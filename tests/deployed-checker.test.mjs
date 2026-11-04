import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, journey } from '../deploy/checker.mjs';

const good = { url: 'http://deskdrop.test:3000', source: 'a'.repeat(40), image: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:${'b'.repeat(64)}` };
test('checker accepts only explicit private endpoint, commit and immutable owned image', () => {
  assert.deepEqual(validate(good), good);
  for (const value of [undefined, '', 'http://app:3000', 'http://127.0.0.1:3000', 'http://app:3000@evil.test', 'https://app:3000']) assert.throws(() => validate({ ...good, url: value }));
  assert.throws(() => validate({ ...good, source: 'abc' }));
  assert.throws(() => validate({ ...good, image: good.image.replace(/@sha256:.*/, ':latest') }));
});
test('checker closes browser and context after a navigation failure', async () => {
  let browserClosed = false, contextClosed = false;
  const browser = { newContext: async () => ({ newPage: async () => ({ setDefaultTimeout() {}, goto: async () => { throw new Error('private'); } }), close: async () => { contextClosed = true; } }), close: async () => { browserClosed = true; } };
  await assert.rejects(journey(good, { launch: async () => browser }));
  assert.equal(contextClosed, true); assert.equal(browserClosed, true);
});
test('invalid target never launches browser', async () => {
  let launched = false;
  await assert.rejects(journey({ ...good, url: '' }, { launch: async () => { launched = true; } }));
  assert.equal(launched, false);
});

test('one-shot journey checks totals and every receipt and history item', async () => {
  async function runJourney(total) {
    const actions = [], closed = [], data = { subtotal: '$100', discount: '−$15', shipping: '$12', total, 'receipt-subtotal': '$100', 'receipt-discount': '−$15', 'receipt-shipping': '$12', 'receipt-total': '$97' };
    let history = false, url = good.url;
    const lines = { 'Arc desk lamp': 'Arc desk lamp Terracotta · Qty 1', 'Tidy desk organizer': 'Tidy desk organizer Natural oak · Qty 1' };
    function locator(key) {
      return {
        key,
        getByRole(role, options = {}) { return locator(`${key}/role:${role}:${String(options.name ?? '')}`); },
        getByTestId(id) { return locator(`id:${id}`); },
        getByLabel(label) { return locator(`label:${label}`); },
        filter({ hasText }) { return locator(`line:${hasText}`); },
        async click() { actions.push(`click:${key}`); if (key.includes('Place demo order')) url = `${good.url}/checkout/success`; if (key.includes('View order history')) history = true; },
        async fill(value) { actions.push(`fill:${key}:${value}`); },
        async check() { actions.push(`check:${key}`); },
      };
    }
    const page = { ...locator('page'), setDefaultTimeout() {}, async goto(target) { actions.push(`goto:${target}`); } };
    const check = target => ({
      async toHaveText(value) { assert.equal(data[target.key.slice(3)], value); },
      async toHaveURL(value) { assert.equal(url, value); },
      async toHaveCount(value) { assert.equal(Object.keys(lines).length, value); actions.push(`lines:${history ? 'history' : 'receipt'}`); },
      async toContainText(value) { assert.ok(lines[target.key.slice(5)].includes(value)); },
    });
    const context = { newPage: async () => page, close: async () => closed.push('context') };
    const browser = { newContext: async options => { assert.equal(options.baseURL, good.url); return context; }, close: async () => closed.push('browser') };
    const fake = { launch: async opts => { assert.equal(opts.chromiumSandbox, true); assert.deepEqual(opts, { headless: true, chromiumSandbox: true }); return browser; } };
    return { promise: journey(good, fake, check), actions, closed };
  }
  const success = await runJourney('$97');
  assert.equal((await success.promise).status, 'pass');
  assert.deepEqual(success.closed, ['context', 'browser']);
  assert.deepEqual(success.actions.filter(a => a.startsWith('lines:')), ['lines:receipt', 'lines:history']);
  assert.ok(success.actions.some(a => a.endsWith(':DESK15')));
  const failure = await runJourney('$96');
  await assert.rejects(failure.promise);
  assert.deepEqual(failure.closed, ['context', 'browser']);
});

test('private browser endpoint uses the explicit reserved alias and rejects the HSTS .app endpoint', () => {
  const endpoint = { ...good, url: 'http://deskdrop.test:3000' };
  assert.doesNotThrow(() => validate(endpoint));
  assert.deepEqual(validate(endpoint), endpoint);
  assert.throws(() => validate({ ...endpoint, url: 'http://app:3000' }));
});

test('local identity is explicit and does not relax GCP validation', async () => {
  const { validateLocal } = await import('../deploy/checker.mjs');
  const local = { url: good.url, source: good.source, image: `sha256:${'c'.repeat(64)}` };
  assert.deepEqual(validateLocal(local), local);
  assert.throws(() => validate(local));
  assert.throws(() => validateLocal(good));
  assert.throws(() => validateLocal({ ...local, url: 'http://127.0.0.1:3177' }));
  assert.throws(() => validateLocal({ ...local, image: 'deskdrop:latest' }));
});
