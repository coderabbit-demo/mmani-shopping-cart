import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import deployed, { createHandler } from '../tools/workflow-api/api/health.mjs';
import { PROJECT_ID } from '../tools/workflow-api/lib/telemetry.mjs';

const token = randomBytes(32).toString('base64url');
const commit = 'a'.repeat(40);
const config = JSON.stringify([{ actor: 'presenter-1', sha256: createHash('sha256').update(token).digest('hex'), expiresAt: '2099-01-01T00:00:00.000Z' }]);
function setup(overrides = {}, writeOverride) {
  const logs = [];
  const env = { WORKFLOW_DD_API_KEY: 'b'.repeat(32), WORKFLOW_API_AUTH_JSON: config, VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: PROJECT_ID,
    VERCEL_DEPLOYMENT_ID: 'dpl_fixture123', VERCEL_GIT_COMMIT_SHA: commit, ...overrides };
  const sends = [];
  return { env, logs, sends, handler: createHandler({ fetch: async (...args) => { sends.push(args); return new Response(null, { status: 202 }); }, environment: () => env, write: writeOverride ?? (line => logs.push(JSON.parse(line))) }) };
}
function request({ method = 'GET', auth = true, url = 'https://fixture.vercel.app/api/health', headers = {} } = {}) {
  return new Request(url, { method, headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), ...headers } });
}
async function error(result, status) {
  assert.equal(result.status, status);
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(result.headers.has('access-control-allow-origin'), false);
  const body = await result.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.ok(JSON.stringify(body).length < 100);
  return body;
}

test('native deployment entry fails closed without configuration', async () => {
  assert.equal(typeof deployed.fetch, 'function');
  await error(await deployed.fetch(request({ auth: false })), 401);
});

test('healthy invocation emits exactly one bounded info event and matching trusted source/request identity', async () => {
  const { handler, logs, sends } = setup();
  const result = await handler(request({ headers: { 'x-actor': 'spoof', 'x-source': 'spoof', 'x-request-id': 'spoof' } }));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.status, 'ok');
  assert.match(body.requestId, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  assert.equal(body.source.commit, commit);
  assert.equal(body.source.projectId, PROJECT_ID);
  assert.equal(logs.length, 1);
  assert.equal(sends.length, 1);
  assert.equal(logs[0].requestId, body.requestId);
  assert.deepEqual(logs[0].source, body.source);
  assert.equal(logs[0].actor, 'presenter-1');
  assert.equal(logs[0].event, 'health_checked');
  assert.equal(logs[0].level, 'info');
  assert.equal(logs[0].status, 200);
  assert.equal(logs[0].schemaVersion, 1);
  assert.ok(Number.isFinite(Date.parse(logs[0].timestamp)));
  assert.ok(Buffer.byteLength(JSON.stringify(logs[0])) <= 2048);
  assert.equal(JSON.stringify(logs).includes('spoof'), false);
  for (const name of ['cache-control', 'cdn-cache-control', 'vercel-cdn-cache-control']) assert.match(result.headers.get(name), /no-store/);
  assert.equal(result.headers.has('access-control-allow-origin'), false);
  assert.notEqual((await (await handler(request())).json()).requestId, body.requestId);
});

test('auth runs before methods, source access and telemetry; denials are identical', async () => {
  const { handler, env, logs, sends } = setup();
  Object.defineProperty(env, 'VERCEL_GIT_COMMIT_SHA', { get() { throw Error('source inspected before auth'); } });
  const denied = await error(await handler(request({ auth: false })), 401);
  for (const method of ['POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH']) assert.deepEqual(await error(await handler(request({ method, auth: false })), 401), denied);
  assert.deepEqual(await error(await handler(request({ headers: { authorization: 'Bearer invalid' } })), 401), denied);
  assert.equal(logs.length, 0);
  assert.equal(sends.length, 0);
  const valid = setup();
  for (const method of ['POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH']) {
    const res = await valid.handler(request({ method }));
    assert.equal(res.headers.get('allow'), 'GET');
    await error(res, 405);
  }
  assert.equal(valid.logs.length, 0);
  assert.equal(valid.sends.length, 0);
});

test('all query strings, credential parameters and oversized URLs are rejected without reflection', async () => {
  const { handler, logs, sends } = setup();
  for (const query of [`?token=${token}`, `?access_token=${token}`, `?x-vercel-protection-bypass=${token}`, '?actor=spoof', '?unknown=value']) {
    await error(await handler(request({ url: `https://fixture.vercel.app/api/health${query}` })), 400);
    await error(await handler(request({ auth: false, url: `https://fixture.vercel.app/api/health${query}` })), 401);
  }
  await error(await handler(request({ url: `https://fixture.vercel.app/api/health?x=${'x'.repeat(2048)}` })), 400);
  await error(await handler(request({ url: 'https://fixture.vercel.app/api/quote' })), 400);
  assert.equal(logs.length, 0);
  assert.equal(sends.length, 0);
});

test('header budgets accept their boundary and reject over-limit bytes/count', async () => {
  const { handler, logs, sends } = setup();
  const headers = new Headers({ authorization: `Bearer ${token}` });
  const current = [...headers].reduce((n, [k, v]) => n + Buffer.byteLength(k) + Buffer.byteLength(v) + 4, 0);
  headers.set('x-pad', 'x'.repeat(8192 - current - 9));
  assert.equal((await handler(new Request('https://fixture.vercel.app/api/health', { headers }))).status, 200);
  headers.set('x-pad', headers.get('x-pad') + 'x');
  await error(await handler(new Request('https://fixture.vercel.app/api/health', { headers })), 431);
  const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`x-${i}`, 'x']));
  assert.equal((await handler(request({ headers: many }))).status, 200);
  await error(await handler(request({ headers: { ...many, extra: 'x' } })), 431);
  assert.equal(logs.length, 2);
  assert.equal(sends.length, 2);
});

test('no body is read or buffered, including empty streams, lying lengths and unsupported transfer framing', async () => {
  const { handler, logs, sends } = setup();
  assert.equal((await handler(request({ headers: { 'content-length': '0' } }))).status, 200);
  for (const length of ['1', '-1', 'wat', '00', '1000000000']) await error(await handler(request({ headers: { 'content-length': length } })), 413);
  await error(await handler(request({ headers: { 'transfer-encoding': 'chunked' } })), 413);
  for (const length of [null, '0', '1']) {
    let cancelled = false;
    const stream = new ReadableStream({ cancel() { cancelled = true; } });
    const req = request({ headers: length === null ? {} : { 'content-length': length } });
    const syntheticGet = { headers: req.headers, method: req.method, url: req.url, body: stream };
    await error(await handler(syntheticGet), 413);
    assert.equal(cancelled, true);
  }
  assert.equal(logs.length, 1);
  assert.equal(sends.length, 1);
});

test('source metadata fails closed and cannot be supplied by request headers', async () => {
  for (const override of [{ VERCEL_ENV: 'production' }, { VERCEL_PROJECT_ID: 'prj_wrong' }, { VERCEL_DEPLOYMENT_ID: '' }, { VERCEL_GIT_COMMIT_SHA: undefined }, { VERCEL_GIT_COMMIT_SHA: 'a'.repeat(41) }, { VERCEL_DEPLOYMENT_ID: 'dpl_\nprivate' }]) {
    const { handler, logs, sends } = setup(override);
    await error(await handler(request({ headers: { 'x-vercel-git-commit-sha': commit } })), 503);
    assert.equal(logs.length, 0);
    assert.equal(sends.length, 0);
  }
});

test('authorized unexpected exceptions are sanitized; rejected inputs never emit incident errors', async () => {
  const canary = 'private-person@example.test SECRET_HEADER';
  const { handler, env, logs, sends } = setup();
  Object.defineProperty(env, 'VERCEL_DEPLOYMENT_ID', { get() { throw Error(canary); } });
  const body = await error(await handler(request()), 500);
  assert.equal(logs.length, 1);
  assert.equal(sends.length, 0);
  assert.equal(logs[0].event, 'health_failed');
  assert.equal(logs[0].code, 'INTERNAL_ERROR');
  const serialized = JSON.stringify({ body, logs });
  for (const forbidden of [canary, token, 'stack', 'Error:', 'authorization', 'cookie']) assert.equal(serialized.includes(forbidden), false);
  const brokenSink = setup({}, () => { throw Error(canary); });
  await error(await brokenSink.handler(request()), 500);
});

test('Postman and standalone deployment artifacts are importable, dependency-free and contain no secret values', async () => {
  const load = async file => JSON.parse(await readFile(new URL(`../tools/workflow-api/${file}`, import.meta.url), 'utf8'));
  const collection = await load('postman/workflow-api.postman_collection.json');
  const environment = await load('postman/workflow-api.postman_environment.example.json');
  assert.equal(collection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.equal(collection.item.length, 4);
  assert.ok(environment.values.every(v => v.value === ''));
  assert.deepEqual(environment.values.map(v => v.key), ['DEMO_BASE_URL', 'EXPECTED_COMMIT', 'EXPECTED_DEPLOYMENT_ID', 'EXPECTED_PREVIEW_HOST']);
  const [platform, missing, invalid, healthy] = collection.item;
  assert.equal(platform.request.header.length, 0);
  assert.equal(missing.request.header.length, 1);
  assert.equal(invalid.request.header.find(h => h.key === 'Authorization').value, 'Bearer invalid-not-a-credential');
  assert.equal(healthy.request.header.find(h => h.key === 'Authorization').value, 'Bearer {{vault:workflow-api-bearer}}');
  for (const item of collection.item) {
    assert.equal(item.request.method, 'GET');
    assert.equal(item.request.url, '{{DEMO_BASE_URL}}api/health');
    assert.equal(item.protocolProfileBehavior.followRedirects, false);
    assert.equal(item.request.auth.type, 'noauth');
    for (const header of item.request.header.filter(h => h.key === 'x-vercel-protection-bypass')) assert.equal(header.value, '{{vault:workflow-api-bypass}}');
    for (const event of item.event) {
      const script = event.script.exec.join('\n');
      assert.doesNotMatch(script, /console\.|pm\.sendRequest|pm\.vault|setNextRequest/);
      assert.doesNotThrow(() => new Function(script));
    }
  }
  const pre = collection.event[0].script.exec.join('\n');
  const env = { DEMO_BASE_URL: 'https://coderabbit-automation-demo-a1b2c3d4e-coderabbitai.vercel.app/', EXPECTED_PREVIEW_HOST: 'coderabbit-automation-demo-a1b2c3d4e-coderabbitai.vercel.app', EXPECTED_COMMIT: commit, EXPECTED_DEPLOYMENT_ID: 'dpl_fixture123' };
  const execute = () => runInNewContext(pre, { URL, pm: { environment: { get: key => env[key] } } });
  assert.doesNotThrow(execute);
  for (const url of ['http://fixture.vercel.app/', 'https://attacker.test/', 'https://fixture.vercel.app/?token=secret', 'https://fixture.vercel.app/path', 'https://person:secret@fixture.vercel.app/']) {
    env.DEMO_BASE_URL = url;
    assert.throws(execute);
  }
  const manifest = await load('package.json'), lock = await load('package-lock.json');
  assert.equal(manifest.engines.node, '24.x');
  assert.equal(manifest.private, true);
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.packages[''].engines.node, manifest.engines.node);
  assert.equal(lock.name, manifest.name);
  const vercel = await load('vercel.json');
  assert.equal(vercel.framework, null);
  assert.deepEqual(Object.keys(vercel.functions), ['api/health.mjs']);
});

test('malformed URLs and locked body streams stay validation failures without incident logs', async () => {
  const { handler, logs, sends } = setup();
  const req = request();
  await error(await handler({ headers: req.headers, url: 'not a URL', method: 'GET', body: null }), 400);
  const stream = new ReadableStream();
  const reader = stream.getReader();
  try {
    await error(await handler({ headers: req.headers, url: req.url, method: 'GET', body: stream }), 413);
  } finally { reader.releaseLock(); }
  assert.equal(logs.length, 0);
  assert.equal(sends.length, 0);
});

test('Postman response scripts distinguish platform/application denials and verify pinned healthy identity', async () => {
  const collection = JSON.parse(await readFile(new URL('../tools/workflow-api/postman/workflow-api.postman_collection.json', import.meta.url), 'utf8'));
  const source = { project: 'coderabbit-automation-demo', environment: 'preview', commit, deploymentId: 'dpl_fixture123' };
  function execute(index, code, body, cache = 'no-store') {
    const expect = value => ({
      to: { eql: expected => assert.deepEqual(value, JSON.parse(JSON.stringify(expected))), match: pattern => assert.match(value, pattern),
        include: expected => assert.ok(value.includes(expected)) },
      not: { to: { eql: expected => assert.notDeepEqual(value, expected) } },
    });
    runInNewContext(collection.item[index].event[0].script.exec.join('\n'), {
      pm: { test: (_, fn) => fn(), expect,
        environment: { get: key => ({ EXPECTED_COMMIT: commit, EXPECTED_DEPLOYMENT_ID: 'dpl_fixture123' })[key] },
        response: { code, to: { have: { status: expected => assert.equal(code, expected) } },
          json: () => body, text: () => typeof body === 'string' ? body : JSON.stringify(body), headers: { get: () => cache } } },
    });
  }
  execute(0, 401, '<html>Platform authentication</html>');
  assert.throws(() => execute(0, 200, 'unprotected'));
  assert.throws(() => execute(0, 401, { error: 'Unauthorized' }));
  for (const index of [1, 2]) {
    execute(index, 401, { error: 'Unauthorized' });
    assert.throws(() => execute(index, 200, { status: 'ok' }));
  }
  const healthy = { status: 'ok', requestId: '01234567-0123-4567-89ab-0123456789ab', source };
  execute(3, 200, healthy);
  assert.throws(() => execute(3, 200, { ...healthy, source: { ...source, commit: 'b'.repeat(40) } }));
  assert.throws(() => execute(3, 200, healthy, 'public'));
});

test('every exported script compiles and runs, with origin guard before simulated header interpolation or send', async () => {
  const collection = JSON.parse(await readFile(new URL('../tools/workflow-api/postman/workflow-api.postman_collection.json', import.meta.url), 'utf8'));
  const approved = 'https://coderabbit-automation-demo-a1b2c3d4e-coderabbitai.vercel.app/';
  const badOrigins = [
    'http://coderabbit-automation-demo-a1b2c3d4e-coderabbitai.vercel.app/',
    'https://fixture.vercel.app/', 'https://unrelated-project-a1b2c3d4e-coderabbitai.vercel.app/',
    'https://coderabbit-automation-demo-a1b2c3d4e-otherteam.vercel.app/',
    'https://coderabbit-automation-demo-coderabbitai.vercel.app/',
    'https://coderabbit-automation-demo-git-main-coderabbitai.vercel.app/',
    'https://coderabbit-automation-demo.vercel.app/',
    'https://coderabbit-automation-demo-a1b2c3d4e-coderabbitai.vercel.app.attacker.test/',
    'https://coderabbit-automation-demo-a1b2c3d4e-coderabbitaiXvercelXapp/',
    approved + '?token=secret', approved + '#fragment', approved + 'api/health',
    approved.replace('https://', 'https://person:secret@'),
    approved.replace('.app/', '.app:443/'), approved.replace('.app/', '.app:444/'),
    approved.replace('.app/', '.app./'), approved.replace('.app/', '.app@attacker.test/'),
    approved.replace('https://', 'https:\\\\'), approved + '\n', '', null,
  ];
  let scriptCount = 0;
  for (const [index, item] of collection.item.entries()) {
    let interpolations = 0, sends = 0, assertions = 0, tests = 0, skipped = 0;
    const prerequests = [...(collection.event ?? []), ...(item.event ?? [])].filter(e => e.listen === 'prerequest');
    const responseScripts = [...(collection.event ?? []), ...(item.event ?? [])].filter(e => e.listen === 'test');
    const environment = { DEMO_BASE_URL: approved, EXPECTED_PREVIEW_HOST: 'coderabbit-automation-demo-a1b2c3d4e-coderabbitai.vercel.app', EXPECTED_COMMIT: commit, EXPECTED_DEPLOYMENT_ID: 'dpl_fixture123' };
    const body = index === 0 ? '<html>Platform protection</html>' : index === 3 ? {
      status: 'ok', requestId: '01234567-0123-4567-89ab-0123456789ab',
      source: { project: 'coderabbit-automation-demo', environment: 'preview', commit, deploymentId: 'dpl_fixture123' },
    } : { error: 'Unauthorized' };
    const expect = value => ({
      to: {
        eql(expected) { assertions++; assert.deepEqual(value, JSON.parse(JSON.stringify(expected))); },
        match(pattern) { assertions++; assert.match(value, pattern); },
        include(expected) { assertions++; assert.ok(value.includes(expected)); },
      },
      not: { to: { eql(expected) { assertions++; assert.notDeepEqual(value, expected); } } },
    });
    const context = {
      pm: {
        environment: { get: key => environment[key] },
        execution: { skipRequest() { skipped++; } },
        test(_, fn) { tests++; fn(); }, expect,
        response: { code: index === 3 ? 200 : 401,
          to: { have: { status(expected) { assertions++; assert.equal(index === 3 ? 200 : 401, expected); } } },
          json: () => body, text: () => typeof body === 'string' ? body : JSON.stringify(body),
          headers: { get: () => 'no-store' },
        },
      },
    };
    const run = event => runInNewContext(event.script.exec.join('\n'), { ...context }, { timeout: 1000 });
    for (const event of [...prerequests, ...responseScripts]) {
      assert.doesNotThrow(() => new Function(event.script.exec.join('\n')));
      scriptCount++;
    }
    const beforeSend = () => {
      for (const event of prerequests) run(event);
      interpolations += item.request.header.length;
      sends++;
    };
    assert.doesNotThrow(beforeSend);
    assert.equal(sends, 1);
    assert.equal(interpolations, item.request.header.length);
    for (const origin of badOrigins) {
      environment.DEMO_BASE_URL = origin;
      assert.throws(beforeSend, /Set an approved project\/team immutable Preview origin/);
      assert.equal(sends, 1, 'rejected origin must not reach send');
      assert.equal(interpolations, item.request.header.length, 'rejected origin must not reach header interpolation');
    }
    assert.equal(skipped, badOrigins.length, 'each rejected origin explicitly skips Postman request execution');
    environment.DEMO_BASE_URL = approved;
    for (const event of responseScripts) run(event);
    assert.equal(tests, [1, 2, 2, 3][index]);
    assert.equal(assertions, [2, 3, 3, 8][index]);
  }
  assert.equal(scriptCount, 8, 'collection guard and each request test script execute for all four requests');
});

test('Postman independently pins provider-derived host and namespace before sending credentials', async () => {
  const collection = JSON.parse(await readFile(new URL('../tools/workflow-api/postman/workflow-api.postman_collection.json', import.meta.url), 'utf8'));
  const host = 'coderabbit-automation-demo-a1b2c3d4e-coderabbitai.vercel.app';
  const otherApprovedNamespace = 'coderabbit-automation-demo-f6g7h8i9j-coderabbitai.vercel.app';
  const env = { DEMO_BASE_URL: `https://${host}/`, EXPECTED_PREVIEW_HOST: host,
    EXPECTED_COMMIT: commit, EXPECTED_DEPLOYMENT_ID: 'dpl_fixture123' };
  let skipped = 0, interpolations = 0, sends = 0;
  const context = () => ({ pm: {
    environment: { get: key => env[key] }, execution: { skipRequest() { skipped++; } },
    test() { assert.fail('invalid script must not execute assertions'); },
  } });
  const send = () => {
    for (const event of collection.event) runInNewContext(event.script.exec.join('\n'), context(), { timeout: 1000 });
    interpolations++; sends++;
  };
  assert.doesNotThrow(send);
  assert.equal(sends, 1);
  for (const [base, expected] of [
    [`https://${otherApprovedNamespace}/`, host],
    [`https://${host}/`, otherApprovedNamespace],
    [`https://${host}/`, undefined], [`https://${host}/`, ''],
    [`https://${host}/`, `https://${host}/`],
    ['https://unrelated.vercel.app/', 'unrelated.vercel.app'],
    [`https://${host}.attacker.test/`, `${host}.attacker.test`],
    [`https://${host}:443/`, `${host}:443`],
    [`https://person:secret@${host}/`, `person:secret@${host}`],
    [`https://${host}/?token=private`, host],
    [`https://${host}/#fragment`, host],
    [`http://${host}/`, host],
  ]) {
    env.DEMO_BASE_URL = base; env.EXPECTED_PREVIEW_HOST = expected;
    const previous = skipped;
    assert.throws(send, /Set an approved project\/team immutable Preview origin/);
    assert.equal(skipped, previous + 1);
    assert.equal(sends, 1);
    assert.equal(interpolations, 1);
  }
  env.DEMO_BASE_URL = `https://${host}/`; env.EXPECTED_PREVIEW_HOST = host;
  assert.doesNotThrow(send);
  assert.equal(sends, 2);
  assert.equal(interpolations, 2);
  for (const event of [...collection.event, ...collection.item.flatMap(item => item.event)]) {
    const malformed = `${event.script.exec.join('\n')}\nconst = ;`;
    assert.throws(() => new Function(malformed), SyntaxError);
    assert.throws(() => runInNewContext(malformed, context(), { timeout: 1000 }), { name: 'SyntaxError' });
  }
  assert.equal(sends, 2);
});

test('health waits for accepted intake; telemetry failures are generic 503 and never application faults', async () => {
  const { env } = setup();
  for (const key of [undefined, '', 'invalid']) {
    let calls = 0;
    const logs = [];
    const handler = createHandler({ environment: () => ({ ...env, WORKFLOW_DD_API_KEY: key }),
      write: line => logs.push(line), fetch: async () => { calls++; return new Response(null, { status: 202 }); } });
    await error(await handler(request()), 503);
    assert.equal(calls, 0);
    assert.equal(logs.some(line => /health_failed|quote_failed/.test(line)), false);
  }
  for (const status of [200, 202, 429, 503, 'throw']) {
    let release, calls = 0, settled = false;
    const logs = [];
    const handler = createHandler({ environment: () => env, write: line => logs.push(line),
      fetch: async () => { calls++; await new Promise(resolve => { release = resolve; });
        if (status === 'throw') throw Error(env.WORKFLOW_DD_API_KEY);
        return new Response(null, { status }); } });
    const pending = handler(request()).then(value => { settled = true; return value; });
    await Promise.resolve(); assert.equal(settled, false); assert.equal(calls, 1);
    release(); const result = await pending;
    if (status === 200 || status === 202) assert.equal(result.status, 200);
    else await error(result, 503);
    assert.equal(calls, 1);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].includes(env.WORKFLOW_DD_API_KEY), false);
    assert.doesNotMatch(logs[0], /quote_failed|health_failed/);
  }
});

test('authenticated health contract over in-memory HTTP dispatch never sends for denied or invalid input', async () => {
  const { handler, sends } = setup();
  const dispatch = async (method, path, authorized) => {
    const headers = new Headers(authorized ? { authorization: `Bearer ${token}` } : {});
    const response = await handler(new Request(`https://fixture.vercel.app${path}`, { method, headers }));
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await dispatch('GET', '/api/health', false)).status, 401);
  assert.equal((await dispatch('POST', '/api/health', true)).status, 405);
  assert.equal((await dispatch('GET', '/api/health?bad=1', true)).status, 400);
  assert.equal(sends.length, 0);
  const healthy = await dispatch('GET', '/api/health', true);
  assert.equal(healthy.status, 200); assert.equal(sends.length, 1);
  const [log] = JSON.parse(sends[0][1].body);
  assert.equal(log.requestId, healthy.body.requestId);
  assert.deepEqual(log.source, healthy.body.source);
});

test('health timeout remains 503 when transport ignores abort and legacy keys cannot enable delivery', async () => {
  const { env } = setup();
  let expire, calls = 0;
  const logs = [];
  const handler = createHandler({ environment: () => env, write: line => logs.push(line),
    fetch: () => { calls++; return new Promise(() => {}); },
    clock: { setTimeout(fn) { expire = fn; return 1; }, clearTimeout() {} } });
  const pending = handler(request());
  expire();
  const body = await error(await pending, 503);
  assert.deepEqual(body, { error: 'Unavailable' });
  assert.equal(calls, 1);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /quote_failed|health_failed/);
  let legacyCalls = 0;
  const missing = createHandler({ environment: () => ({ ...env, WORKFLOW_DD_API_KEY: undefined,
    DD_API_KEY: 'c'.repeat(32), DD_APP_KEY: 'd'.repeat(32) }), write: () => {},
    fetch: () => { legacyCalls++; assert.fail('legacy key must never authorize send'); } });
  await error(await missing(request()), 503);
  assert.equal(legacyCalls, 0);
});
