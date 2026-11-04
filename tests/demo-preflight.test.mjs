import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { preflight } from '../scripts/demo/preflight.mjs';

const marker = 'synthetic-secret-marker';
const env = { DD_API_KEY: `${marker}-api`, DD_APP_KEY: `${marker}-app` };

function fixture() {
  const calls = [];
  const replies = new Map([
    ['bash --version', 'GNU bash, version 3.2.57'],
    ['git remote get-url origin', 'https://github.com/coderabbit-demo/mmani-shopping-cart.git'],
    ['gh api user', JSON.stringify({ login: 'fixture' })],
    ['gh repo view coderabbit-demo/mmani-shopping-cart --json nameWithOwner,viewerPermission', JSON.stringify({ nameWithOwner: 'coderabbit-demo/mmani-shopping-cart', viewerPermission: 'READ' })],
    ['gcloud config get-value account', 'fixture@example.invalid'],
    ['gcloud config get-value project', 'se-demos-project'],
    ['gcloud auth print-access-token --quiet', `${marker}-token`],
    ['gcloud auth application-default print-access-token --quiet', `${marker}-adc`],
    ['coderabbit auth status --agent', JSON.stringify({ authenticated: true, payload: marker })],
    ['coderabbit auth org --agent', JSON.stringify({ organizations: [{ name: 'coderabbit-demo', selected: true }] })],
    ['coderabbit code ls --repo . --agent', JSON.stringify({ type: 'complete', status: 'tasks_listed', tasks: [{ title: marker }] })],
    ['docker version --format {{.Server.Version}}', '29.0'],
    ['docker buildx inspect', 'Name: builder\nDriver: docker-container\n\nNodes:\nName: builder0\nStatus: running\nPlatforms: linux/arm64, linux/amd64*\n'],
  ]);
  const httpCalls = [];
  return {
    calls, replies, httpCalls,
    async run(file, args) {
      const key = [file, ...args].join(' ');
      calls.push(key);
      if (replies.has(key)) {
        const value = replies.get(key);
        if (value instanceof Error) throw value;
        return value;
      }
      if (args.includes('--version')) return '1.0';
      throw new Error(`${marker} unexpected command ${key}`);
    },
    async http(url, headers) { httpCalls.push({ url, headers }); return { status: 200, body: '{"status":"ok"}' }; },
  };
}

async function run(f, overrides = {}) {
  return preflight({ run: f.run, http: f.http, env, nodeVersion: '24.13.0', ...overrides });
}

test('successful preflight reports only safe statuses and uses fixed US3 validation', async () => {
  const f = fixture();
  const summary = await run(f);
  assert.equal(summary.exitCode, 0, JSON.stringify(summary));
  assert.ok(Object.values(summary.checks).every((value) => value.status === 'pass'));
  assert.deepEqual(f.httpCalls, [{ url: 'https://api.us3.datadoghq.com/api/v2/validate_keys', headers: { 'DD-API-KEY': env.DD_API_KEY, 'DD-APPLICATION-KEY': env.DD_APP_KEY, Accept: 'application/json' } }]);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
  assert.ok(summary.manual.some((line) => line.includes('Jira')));
  for (const command of f.calls) assert.doesNotMatch(command, /\b(login|create|new|push|comment|switch|bootstrap|install|apply)\b/);
});

test('missing keys are blocked and conflicting or wrong targets fail without HTTP', async () => {
  for (const [credentials, status] of [[{}, 'blocked'], [{ ...env, DD_APPLICATION_KEY: 'different' }, 'fail'], [{ ...env, DD_SITE: 'datadoghq.com' }, 'fail']]) {
    const f = fixture();
    const summary = await run(f, { env: credentials });
    assert.equal(summary.exitCode, 1);
    assert.equal(summary.checks.datadog_keys.status, status);
    assert.equal(f.httpCalls.length, 0);
  }
  const f = fixture();
  const summary = await run(f, { env: { DD_API_KEY: env.DD_API_KEY, DD_APPLICATION_KEY: env.DD_APP_KEY } });
  assert.equal(summary.checks.datadog_keys.status, 'pass');
});

test('wrong repository, project, organization, permissions and builder fail independently', async () => {
  const f = fixture();
  f.replies.set('git remote get-url origin', 'https://github.com/other/repo');
  f.replies.set('gcloud config get-value project', 'wrong');
  f.replies.set('coderabbit auth org --agent', JSON.stringify({ organizations: [{ name: 'other', selected: true }] }));
  f.replies.set('coderabbit code ls --repo . --agent', JSON.stringify({ type: 'error', message: marker }));
  f.replies.set('docker buildx inspect', 'Name: stopped\nStatus: stopped\nPlatforms: linux/amd64\n');
  const summary = await run(f);
  for (const name of ['repository', 'gcloud_target', 'coderabbit_org', 'docker_amd64']) assert.equal(summary.checks[name].status, 'fail', name);
  assert.equal(summary.checks.coderabbit_repo.status, 'blocked');
  assert.equal(f.calls.includes('coderabbit code ls --repo . --agent'), false);
  assert.equal(summary.checks.datadog_keys.status, 'pass');
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
});

test('CodeRabbit task list permission failure is reported without its payload', async () => {
  const f = fixture();
  f.replies.set('coderabbit code ls --repo . --agent', JSON.stringify({ type: 'error', message: marker }));
  const summary = await run(f);
  assert.equal(summary.checks.coderabbit_repo.status, 'fail');
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
});

test('missing tools, timeouts and malformed command output are bounded and sanitized', async () => {
  const f = fixture();
  f.replies.set('gh --version', new Error(`${marker}-missing`));
  f.replies.set('gcloud auth print-access-token --quiet', new Error(`${marker}-timeout`));
  f.replies.set('coderabbit auth status --agent', `${marker} bad json`);
  f.replies.set('docker version --format {{.Server.Version}}', new Error(`${marker}-daemon`));
  const summary = await run(f);
  for (const name of ['tool_gh', 'gcloud_token', 'coderabbit_auth', 'docker_daemon']) assert.equal(summary.checks[name].status, 'blocked');
  assert.equal(summary.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
});

test('Datadog errors, redirects, malformed JSON and exceptions never leak diagnostics', async () => {
  for (const [response, expected] of [[{ status: 401, body: marker }, 'fail'], [{ status: 403, body: marker }, 'fail'], [{ status: 302, body: marker }, 'blocked'], [{ status: 500, body: marker }, 'blocked'], [{ status: 200, body: marker }, 'fail'], [new Error(marker), 'blocked']]) {
    const f = fixture();
    const summary = await run(f, { http: async () => { if (response instanceof Error) throw response; return response; } });
    assert.equal(summary.checks.datadog_keys.status, expected);
    assert.equal(summary.exitCode, 1);
    assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
  }
});

test('production HTTPS adapter sends keys only to US3 and does not follow redirects', async (t) => {
  const f = fixture();
  const requests = [];
  const location = 'https://redirect.invalid/synthetic-header-marker';
  let output = '';
  const stdout = t.mock.method(process.stdout, 'write', (chunk) => { output += chunk; return true; });
  const stderr = t.mock.method(process.stderr, 'write', (chunk) => { output += chunk; return true; });
  t.mock.method(https, 'get', (url, options, callback) => {
    requests.push({ url, options });
    const request = new EventEmitter();
    request.destroy = (error) => request.emit('error', error);
    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = 302;
      response.headers = { location, 'x-fixture': 'synthetic-header-marker' };
      response.setEncoding = () => {};
      callback(response);
      response.emit('data', `synthetic-response-marker ${marker}`);
      response.emit('end');
    });
    return request;
  });
  const summary = await preflight({ run: f.run, env, nodeVersion: '24.13.0' });
  stdout.mock.restore();
  stderr.mock.restore();
  assert.equal(summary.checks.datadog_keys.status, 'blocked');
  assert.equal(summary.exitCode, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.us3.datadoghq.com/api/v2/validate_keys');
  assert.equal(requests[0].options.headers['DD-API-KEY'], env.DD_API_KEY);
  assert.equal(requests[0].options.headers['DD-APPLICATION-KEY'], env.DD_APP_KEY);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
  assert.doesNotMatch(JSON.stringify(summary) + output, /synthetic-response-marker|synthetic-header-marker|redirect\.invalid|synthetic-secret-marker/);
});

test('command output and process environment secrets never appear on CLI output', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'deskdrop-preflight-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const tool of ['npm', 'bash', 'git', 'gh', 'gcloud', 'terraform', 'coderabbit', 'docker']) {
    const file = join(dir, tool);
    writeFileSync(file, `#!${process.execPath}\nprocess.stdout.write(process.argv.includes('--version') ? '3.2.57' : '${marker}');\nprocess.stderr.write('${marker}');\n`);
    chmodSync(file, 0o755);
  }
  const script = new URL('../scripts/demo/preflight.mjs', import.meta.url).pathname;
  const child = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { PATH: dir, DD_APP_KEY: marker }, timeout: 10000 });
  assert.equal(child.status, 1);
  assert.doesNotMatch(child.stdout + child.stderr, new RegExp(marker));
  assert.equal(JSON.parse(child.stdout).checks.datadog_keys.status, 'blocked');
});

test('GitHub permission denial and unknown CodeRabbit output do not pass', async () => {
  const f = fixture();
  f.replies.set('gh repo view coderabbit-demo/mmani-shopping-cart --json nameWithOwner,viewerPermission', JSON.stringify({ nameWithOwner: 'coderabbit-demo/mmani-shopping-cart', viewerPermission: null }));
  f.replies.set('coderabbit auth org --agent', JSON.stringify({ type: 'complete', payload: marker }));
  f.replies.set('coderabbit code ls --repo . --agent', JSON.stringify({ type: 'status', status: 'loading', payload: marker }));
  const summary = await run(f);
  assert.equal(summary.checks.repository.status, 'fail');
  assert.equal(summary.checks.coderabbit_org.status, 'blocked');
  assert.equal(summary.checks.coderabbit_repo.status, 'blocked');
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
});

test('help and invalid arguments perform no preflight', () => {
  const file = new URL('../scripts/demo/preflight.mjs', import.meta.url).pathname;
  for (const [argument, status] of [['--help', 0], ['--unknown', 2]]) {
    const child = spawnSync(process.execPath, [file, argument], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 3000 });
    assert.equal(child.status, status);
    assert.match(child.stdout + child.stderr, /Usage:/);
    assert.doesNotMatch(child.stdout + child.stderr, new RegExp(marker));
  }
});

test('regression: observed CodeRabbit currentOrg enables repository access', async () => {
  const f = fixture();
  f.replies.set('coderabbit auth org --agent', JSON.stringify({ type: 'org_list', phase: 'auth', currentOrg: { name: 'coderabbit-demo' }, organizations: [{ name: 'coderabbit-demo' }, { name: 'coderabbitai' }, { name: 'manimahesh' }] }));
  const summary = await run(f);
  assert.equal(summary.checks.coderabbit_org.status, 'pass');
  assert.equal(summary.checks.coderabbit_repo.status, 'pass');
  assert.equal(f.calls.includes('coderabbit code ls --repo . --agent'), true);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
});

for (const type of ['error', 'action_required']) {
  for (const order of ['before', 'after']) {
    test(`regression: legacy organization stream blocks ${type} ${order} selection`, async () => {
      const f = fixture();
      const selected = { organizations: [{ name: 'coderabbit-demo', selected: true }] };
      const rejection = { type, message: marker };
      const events = order === 'before' ? [rejection, selected] : [selected, rejection];
      f.replies.set('coderabbit auth org --agent', events.map(JSON.stringify).join('\n'));
      const summary = await run(f);
      assert.equal(summary.checks.coderabbit_org.status, 'blocked');
      assert.equal(summary.checks.coderabbit_repo.status, 'blocked');
      assert.equal(summary.exitCode, 1);
      assert.equal(f.calls.includes('coderabbit code ls --repo . --agent'), false);
      assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
    });
  }
}

test('regression: currentOrg streams also reject error events in either order', async () => {
  const selected = { type: 'org_list', phase: 'auth', currentOrg: { name: 'coderabbit-demo' }, organizations: [{ name: 'coderabbit-demo' }] };
  for (const type of ['error', 'action_required']) {
    for (const events of [[{ type, message: marker }, selected], [selected, { type, message: marker }]]) {
      const f = fixture();
      f.replies.set('coderabbit auth org --agent', events.map(JSON.stringify).join('\n'));
      const summary = await run(f);
      assert.equal(summary.checks.coderabbit_org.status, 'blocked');
      assert.equal(summary.checks.coderabbit_repo.status, 'blocked');
      assert.equal(f.calls.includes('coderabbit code ls --repo . --agent'), false);
      assert.doesNotMatch(JSON.stringify(summary), new RegExp(marker));
    }
  }
});

test('regression: a different currentOrg fails and does not check repository access', async () => {
  const f = fixture();
  f.replies.set('coderabbit auth org --agent', JSON.stringify({ type: 'org_list', phase: 'auth', currentOrg: { name: 'coderabbitai' }, organizations: [{ name: 'coderabbit-demo' }, { name: 'coderabbitai' }] }));
  const summary = await run(f);
  assert.equal(summary.checks.coderabbit_org.status, 'fail');
  assert.equal(summary.checks.coderabbit_repo.status, 'blocked');
  assert.equal(f.calls.includes('coderabbit code ls --repo . --agent'), false);
});

test('regression: absent, malformed or ambiguous current organization remains blocked', async () => {
  const cases = [
    { type: 'org_list', phase: 'auth', organizations: [{ name: 'coderabbit-demo' }] },
    { type: 'org_list', phase: 'auth', currentOrg: null, organizations: [{ name: 'coderabbit-demo', selected: true }] },
    { type: 'org_list', phase: 'auth', currentOrg: { name: '' }, organizations: [] },
    { type: 'org_list', phase: 'auth', currentOrg: { name: 'coderabbit-demo' }, organizations: [{ name: 'coderabbit-demo' }, null] },
    { type: 'org_list', phase: 'auth', currentOrg: { name: 'coderabbit-demo' }, organizations: [{ name: 'coderabbit-demo' }, { name: 'coderabbit-demo' }] },
    { type: 'org_list', phase: 'auth', currentOrg: { name: 'coderabbit-demo' }, organizations: [{ name: 'coderabbit-demo' }, { name: 'other', selected: true }] },
  ];
  for (const data of cases) {
    const f = fixture();
    f.replies.set('coderabbit auth org --agent', JSON.stringify(data));
    const summary = await run(f);
    assert.equal(summary.checks.coderabbit_org.status, 'blocked');
    assert.equal(summary.checks.coderabbit_repo.status, 'blocked');
    assert.equal(f.calls.includes('coderabbit code ls --repo . --agent'), false);
  }
  const f = fixture();
  const event = { type: 'org_list', phase: 'auth', currentOrg: { name: 'coderabbit-demo' }, organizations: [{ name: 'coderabbit-demo' }] };
  f.replies.set('coderabbit auth org --agent', `${JSON.stringify(event)}\n${JSON.stringify(event)}`);
  const summary = await run(f);
  assert.equal(summary.checks.coderabbit_org.status, 'blocked');
  assert.equal(summary.checks.coderabbit_repo.status, 'blocked');
  assert.equal(f.calls.includes('coderabbit code ls --repo . --agent'), false);
});

test('regression: Terraform v-prefixed version retains its major number', async () => {
  const f = fixture();
  const versions = {
    npm: ['11.6.2', '11.6.2'],
    bash: ['GNU bash, version 3.2.57(1)-release', '3.2.57'],
    git: ['git version 2.50.1', '2.50.1'],
    gh: ['gh version 2.100.0 (2026-01-01)', '2.100.0'],
    gcloud: ['Google Cloud SDK 590.0.0\nbq 2.1.0', '590.0.0'],
    coderabbit: ['0.9.2', '0.9.2'],
    docker: ['Docker version 29.5.3, build abc', '29.5.3'],
  };
  for (const [name, [output]] of Object.entries(versions)) f.replies.set(`${name} --version`, output);
  f.replies.set('terraform --version', 'Terraform v1.15.3\non darwin_arm64\n');
  const summary = await run(f);
  assert.equal(summary.checks.tool_terraform.status, 'pass');
  assert.equal(summary.checks.tool_terraform.version, '1.15.3');
  for (const [name, [, expected]] of Object.entries(versions)) assert.equal(summary.checks[`tool_${name}`].version, expected);
});
