import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLocal as validate, journeyLocal as journey } from '../deploy/checker.mjs';

const good = { url: 'http://deskdrop.test:3000', source: 'a'.repeat(40), image: `sha256:${'b'.repeat(64)}` };
test('checker accepts only explicit private endpoint, commit and immutable owned image', () => {
  assert.deepEqual(validate(good), good);
  for (const value of [undefined, '', 'http://app:3000', 'http://127.0.0.1:3000', 'http://app:3000@evil.test', 'https://app:3000']) assert.throws(() => validate({ ...good, url: value }));
  assert.throws(() => validate({ ...good, source: 'abc' }));
  assert.throws(() => validate({ ...good, image: 'deskdrop:latest' }));
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

test('local identity rejects nonlocal image references', () => {
  assert.throws(() => validate({ ...good, image: `registry.invalid/deskdrop@${good.image}` }));
  assert.throws(() => validate({ ...good, url: 'http://127.0.0.1:3177' }));
  assert.throws(() => validate({ ...good, image: 'deskdrop:latest' }));
});

test('local journey reports only bounded observations for checkout and receipt or history failures', async () => {
  const { journeyLocal } = await import('../deploy/checker.mjs');
  const local = { url: good.url, source: good.source, image: `sha256:${'c'.repeat(64)}` };
  async function exercise(failure, observedText = '$96') {
    let history = false;
    const observations = [];
    function locator(key) {
      return {
        key,
        getByRole(role, opts = {}) { return locator(`${key}/${role}:${String(opts.name ?? '')}`); },
        getByTestId(id) { return locator(id); },
        getByLabel() { return locator('label'); },
        filter({ hasText }) { return locator(hasText); },
        async click() { if (key.includes('View order history')) history = true; },
        async fill() {}, async check() {},
        async textContent() { return observedText; },
        async count() { return 1; },
      };
    }
    const page = { ...locator('page'), setDefaultTimeout() {}, async goto() {} };
    const browser = { async newContext() { return { async newPage() { return page; }, async close() {} }; }, async close() {} };
    const assertion = target => ({
      async toHaveText() { if (failure === 'total' && target.key === 'total') throw new Error('private browser data'); },
      async toHaveURL() { if (failure === 'receipt_url') throw new Error('private browser data'); }, async toHaveCount() { if (failure === 'receipt_count' && !history) throw new Error('private browser data'); },
      async toContainText() { if (failure === 'receipt_lamp' && !history && target.key === 'Arc desk lamp') throw new Error('private browser data'); if (failure === 'history_organizer' && history && target.key === 'Tidy desk organizer') throw new Error('private browser data'); },
    });
    await assert.rejects(journeyLocal(local, { launch: async () => browser }, assertion, value => observations.push(value)));
    return observations.at(-1);
  }
  assert.deepEqual(await exercise('total'), { stage: 'checkout_total', expected: '$97', actual: '$96' });
  assert.deepEqual(await exercise('total', '$96|secret'), { stage: 'checkout_total', expected: '$97', actual: 'unavailable' });
  assert.deepEqual(await exercise('receipt_lamp'), { stage: 'receipt_lamp', expected: 'lamp_terracotta', actual: 'mismatch' });
  assert.deepEqual(await exercise('receipt_count'), { stage: 'receipt_count', expected: '2', actual: '1' });
  assert.deepEqual(await exercise('receipt_url'), { stage: 'receipt_url', expected: 'checkout_success', actual: 'failed' });
  assert.deepEqual(await exercise('history_organizer'), { stage: 'history_organizer', expected: 'organizer_natural_oak', actual: 'mismatch' });
});

test('journeys validate before loading defaults and retain injected browser and assertion arguments', { timeout: 10000 }, async () => {
  const { mkdtemp, realpath, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'deskdrop-browser-loader-')));
  try {
    const loader = join(dir, 'browser.mjs');
    const fixture = `globalThis.fixtureLoads = (globalThis.fixtureLoads || 0) + 1;
      export const chromium = { launch: async () => { throw new Error('default browser used'); } };
      export const expect = () => { throw new Error('default assertion used'); };`;
    await writeFile(loader, `export async function resolve(specifier, context, next) {
      if (specifier === '@playwright/test') return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(fixture)}`)}, shortCircuit: true };
      return next(specifier, context);
    }`);
    const checker = new URL('../deploy/checker.mjs', import.meta.url).href;
    const program = `import assert from 'node:assert/strict';
      import { journeyLocal } from ${JSON.stringify(checker)};
      const base = { url: 'http://deskdrop.test:3000', source: 'a'.repeat(40) };
      const local = { ...base, image: 'sha256:' + 'c'.repeat(64) };
      await assert.rejects(journeyLocal({ ...local, image: 'registry.invalid/deskdrop@' + local.image }));
      assert.equal(globalThis.fixtureLoads, undefined);
      const injected = { launch: async () => { throw new Error('injected browser used'); } };
      const assertion = () => {};
      await assert.rejects(journeyLocal(local, injected, assertion), /injected browser used/);
      assert.equal(globalThis.fixtureLoads, undefined);
      await assert.rejects(journeyLocal(local, undefined, assertion), /default browser used/);
      assert.equal(globalThis.fixtureLoads, 1);
      await assert.rejects(journeyLocal(local, injected), /injected browser used/);
      const locator = { getByRole: () => locator, getByLabel: () => locator, getByTestId: () => locator,
        click: async () => {}, fill: async () => {}, check: async () => {} };
      const page = { ...locator, setDefaultTimeout() {}, goto: async () => {} };
      const browser = { launch: async () => ({ newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} }) };
      await assert.rejects(journeyLocal(local, browser), /default assertion used/);`;
    await promisify(execFile)(process.execPath, ['--no-warnings', '--experimental-loader', loader, '--input-type=module', '-e', program], { timeout: 8000 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
