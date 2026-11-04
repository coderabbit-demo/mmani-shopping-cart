import test from 'node:test';
import assert from 'node:assert/strict';
import { childEnvironment, credentials, verifyContainer, verifyImage } from '../scripts/demo/local.mjs';

test('local credential parsing rejects missing, duplicate and conflicting sources without echoing values', () => {
  const input = 'DD_API_KEY=example-api\nDD_APP_KEY=example-app\nDD_SITE=us3.datadoghq.com\n';
  assert.deepEqual(credentials(input), { apiKey: 'example-api', appKey: 'example-app', site: 'us3.datadoghq.com' });
  for (const [file, env] of [[input, { DD_API_KEY: '' }], [input, { DD_APP_KEY: 'conflict' }], [input + 'DD_API_KEY=other\n', {}], [input, { DD_SITE: 'datadoghq.com' }], ['DD_API_KEY=example-api\n', {}], [input + 'DD_APPLICATION_KEY=other\n', {}]]) {
    assert.throws(() => credentials(file, env), error => error.message === 'Invalid local credentials');
  }
});
test('child environment keeps only ordinary execution variables', () => {
  assert.deepEqual(childEnvironment({ PATH: '/bin', HOME: '/home/example', DD_API_KEY: 'secret', DD_APP_KEY: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', DOCKER_HOST: 'tcp://evil' }), { PATH: '/bin', HOME: '/home/example' });
});
test('local image and container checks bind actual identity, source and project', () => {
  const commit = 'a'.repeat(40), id = `sha256:${'b'.repeat(64)}`;
  const image = { Id: id, Os: 'linux', Architecture: 'amd64', Config: { Labels: { 'org.opencontainers.image.revision': commit } } };
  assert.equal(verifyImage(image, commit, id), true);
  assert.throws(() => verifyImage({ ...image, Architecture: 'arm64' }, commit, id));
  assert.throws(() => verifyImage(image, 'c'.repeat(40), id));
  const container = { Image: id, Config: { Labels: { 'com.docker.compose.project': 'deskdrop-mmani-local', 'com.docker.compose.service': 'app' } } };
  assert.equal(verifyContainer(container, id, 'deskdrop-mmani-local', 'app'), true);
  assert.throws(() => verifyContainer(container, `sha256:${'c'.repeat(64)}`, 'deskdrop-mmani-local', 'app'));
  assert.throws(() => verifyContainer(container, id, 'other', 'app'));
});
test('approved brief metadata is compatible with the existing PR helper', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../docs/briefs/09-local-docker-monitoring.md', import.meta.url), 'utf8');
  const heading = text.match(/^#[ \t]+(.+)$/m)?.[1];
  assert.equal(heading?.match(/`([^`\r\n]+)`/)?.[1], 'feat: local Docker monitoring and controlled demo');
  assert.deepEqual([...text.matchAll(/\*\*Jira:\*\*[ \t]*([A-Z][A-Z0-9]*-[0-9]+)(?=[ \t\r\n]|$)/g)].map(m => m[1]), ['SC-37']);
  assert.match(text, /^\*\*GitHub:\*\* https:\/\/github\.com\/coderabbit-demo\/mmani-shopping-cart\/issues\/15$/m);
});
test('child command strips secrets and reports failures without command output', async () => {
  const { runCommand } = await import('../scripts/demo/local.mjs');
  const saved = process.env.DD_API_KEY; process.env.DD_API_KEY = 'synthetic-secret';
  try {
    const result = await runCommand('bash', ['-c', 'if [ -n "${DD_API_KEY+x}" ]; then exit 1; fi; printf safe']);
    assert.equal(result.toString(), 'safe');
    await assert.rejects(runCommand('bash', ['-c', 'printf synthetic-secret; exit 1']), error => error.message === 'Local command failed');
    await assert.rejects(runCommand('bash', ['-c', 'sleep 10'], { timeout: 50 }), error => error.message === 'Local command failed');
  } finally { if (saved === undefined) delete process.env.DD_API_KEY; else process.env.DD_API_KEY = saved; }
});
test('occupied local port is rejected without disturbing its owner', async () => {
  const { requireFreePort } = await import('../scripts/demo/local.mjs');
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(requireFreePort(server.address().port)); assert.equal(server.listening, true); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
test('resource ownership rejects foreign, duplicate, unexpected and partial project containers', async () => {
  const { validateContainers } = await import('../scripts/demo/local.mjs');
  const image = `sha256:${'b'.repeat(64)}`, agent = `sha256:${'c'.repeat(64)}`;
  const ids = { app: image, checker: image, agent };
  const services = ['app', 'forwarder', 'runner', 'agent'];
  const entries = services.map((service, i) => ({ Id: String(i + 1).repeat(64), Image: service === 'agent' ? agent : image, Config: { Labels: { 'com.docker.compose.project': 'deskdrop-mmani-local', 'com.docker.compose.service': service } } }));
  const requested = entries.map(e => e.Id);
  assert.equal(validateContainers(entries, requested, ids).length, 4);
  assert.throws(() => validateContainers(entries.slice(0, 3), requested.slice(0, 3), ids));
  assert.equal(validateContainers(entries.slice(0, 3), requested.slice(0, 3), ids, true).length, 3);
  const foreign = structuredClone(entries); foreign[0].Config.Labels['com.docker.compose.project'] = 'another-project';
  assert.throws(() => validateContainers(foreign, requested, ids));
  const duplicate = structuredClone(entries); duplicate[1].Config.Labels['com.docker.compose.service'] = 'app';
  assert.throws(() => validateContainers(duplicate, requested, ids));
  const mismatched = structuredClone(entries); mismatched[0].Image = agent;
  assert.throws(() => validateContainers(mismatched, requested, ids));
});
test('build refuses an occupied port before issuing any build or preparation command', async () => {
  const { build } = await import('../scripts/demo/local.mjs');
  let called = false;
  await assert.rejects(build(async () => { called = true; }, async () => { throw new Error('occupied'); }));
  assert.equal(called, false);
});
test('startup protects monitors before starting and rolls back owned containers after failure', async () => {
  const { start } = await import('../scripts/demo/local.mjs');
  const calls = [], owned = ['app','checker'].map(service => ({ Id: service, State: { Running: true } }));
  const ctx = { docker: async args => calls.push(args.join(' ')) };
  const base = { freePort: async () => calls.push('port'), getContext: async () => ctx, findContainers: async (_, partial) => partial ? owned : [], checkNetworks: async () => calls.push('networks'), checkJourneys: async () => {}, protect: async flag => calls.push(`protected:${flag}`), getCredentials: async () => ({ apiKey: 'synthetic' }), prepareIntake: async () => calls.push('intake'), runCompose: async () => { calls.push('compose'); throw new Error('lost response'); } };
  await assert.rejects(start(base), /outcome requires inspection/);
  assert.deepEqual(calls, ['port', 'networks', 'protected:false', 'intake', 'compose', 'protected:true', 'stop --time 10 app', 'stop --time 10 checker']);
  calls.length = 0;
  await assert.rejects(start({ ...base, freePort: async () => { throw new Error('occupied'); } }));
  assert.deepEqual(calls, []);
});
test('shutdown never stops a container unless owned monitor suppression succeeds', async () => {
  const { stop } = await import('../scripts/demo/local.mjs');
  const calls = [], owned = [{ Id: 'owned', State: { Running: true } }];
  const args = { getContext: async () => ({ docker: async value => calls.push(value) }), findContainers: async () => owned, protect: async () => { throw new Error('unconfirmed suppression'); } };
  await assert.rejects(stop(args));
  assert.deepEqual(calls, []);
});
test('protected credential loader accepts private files and rejects symlinks and loose mode', async () => {
  const { loadCredentials } = await import('../scripts/demo/local.mjs');
  const { mkdtemp, open, writeFile, chmod, symlink, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(join(tmpdir(), 'deskdrop-creds-')), file = join(dir, 'synthetic');
  try {
    await writeFile(file, 'DD_API_KEY=synthetic-api\nDD_APP_KEY=synthetic-app\n', { mode: 0o600 });
    assert.equal((await loadCredentials({}, (_, flags) => open(file, flags))).site, 'us3.datadoghq.com');
    await chmod(file, 0o644);
    await assert.rejects(loadCredentials({}, (_, flags) => open(file, flags)));
    await chmod(file, 0o600);
    const link = join(dir, 'link'); await symlink(file, link);
    await assert.rejects(loadCredentials({}, (_, flags) => open(link, flags)));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('startup checks app, checker, Agent and loopback before reporting ready', async () => {
  const { start } = await import('../scripts/demo/local.mjs');
  const calls = [], services = ['app','forwarder','runner','agent'].map(service => ({ Id: service, Config: { Labels: { 'com.docker.compose.service': service } }, State: { Running: true, Health: { Status: 'healthy' } } }));
  const ctx = { commit: 'a'.repeat(40), ids: { app: 'id' }, docker: async args => calls.push(args) };
  let reads = 0;
  const result = await start({ freePort: async () => {}, getContext: async () => ctx, findContainers: async () => reads++ ? services : [], checkNetworks: async () => {}, checkJourneys: async () => {}, protect: async () => {}, getCredentials: async () => ({ apiKey: 'synthetic-secret' }), prepareIntake: async () => {}, runCompose: async () => {}, http: async url => { assert.equal(url, 'http://127.0.0.1:3177/'); return { ok: true }; }, clock: () => 0, supervise: async () => ({ status: 'started' }) });
  assert.equal(result.status, 'started');
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
  assert.deepEqual(calls, [['exec', 'agent', 'agent', 'health']]);
});
test('Compose is confined to the owned project and never inherits credential variables', async () => {
  const { compose } = await import('../scripts/demo/local.mjs');
  let observed;
  const ctx = { env: { PATH: '/bin', HOME: '/home/example', DOCKER_CONFIG: '/tmp/local-config', DD_API_KEY: 'synthetic-secret', AWS_SECRET_ACCESS_KEY: 'synthetic-cloud' }, ids: { app: `sha256:${'a'.repeat(64)}`, checker: `sha256:${'b'.repeat(64)}` }, commit: 'c'.repeat(40), socket: '/tmp/synthetic.sock', run: async (...args) => { observed = args; } };
  await compose(ctx, ['up', '--detach', '--pull', 'never', 'app', 'forwarder', 'runner', 'agent']);
  assert.equal(observed[1].includes('deskdrop-mmani-local'), true);
  assert.equal(observed[1].includes('/dev/null'), true);
  assert.equal(JSON.stringify(observed).includes('synthetic-secret'), false);
  assert.equal(JSON.stringify(observed).includes('synthetic-cloud'), false);
  await assert.rejects(compose(ctx, ['down', '--remove-orphans']));
});
test('shutdown still suppresses owned monitors when the project is already stopped', async () => {
  const { stop } = await import('../scripts/demo/local.mjs');
  const calls = [];
  const result = await stop({ getContext: async () => ({}), findContainers: async () => [], protect: async value => calls.push(value) });
  assert.deepEqual(calls, [true]);
  assert.equal(result.status, 'stopped');
});
test('dirty checkout is rejected before any Docker operation', async () => {
  const { build } = await import('../scripts/demo/local.mjs');
  const calls = [];
  const run = async (file, args) => { calls.push([file, args]); return Buffer.from(args[0] === 'rev-parse' ? 'a'.repeat(40) : ' M tracked-file\n'); };
  await assert.rejects(build(run, async () => {}), /Clean committed checkout required/);
  assert.equal(calls.every(([file]) => file === 'git'), true);
});
test('command timeout terminates its real child process', { timeout: 3000 }, async () => {
  const { runCommand } = await import('../scripts/demo/local.mjs');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'deskdrop-command-')), marker = join(dir, 'pid');
  try {
    await assert.rejects(runCommand('bash', ['-c', 'printf "%s" "$$" > "$1"; exec sleep 20', 'fixture', marker], { timeout: 200 }));
    const pid = Number(await readFile(marker, 'utf8'));
    let gone = false;
    for (let i = 0; i < 30; i++) { try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') { gone = true; break; } } await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal(gone, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Mac supervisor kills and removes only the verified per-journey container on cancellation', async () => {
  const { journeySupervisor } = await import('../scripts/demo/local.mjs');
  const id = 'd'.repeat(64), commit = 'a'.repeat(40), app = `sha256:${'b'.repeat(64)}`, checker = `sha256:${'c'.repeat(64)}`;
  const calls = [], saved = []; let name, running = true, waiting;
  const ctx = { commit, ids: { app, checker }, docker: async (args, options = {}) => {
    calls.push(args);
    if (args[0] === 'wait') return new Promise((resolve, reject) => { waiting = true; options.signal.addEventListener('abort', () => reject(new Error('interrupted')), { once: true }); });
    if (args[0] === 'kill') { running = false; return Buffer.alloc(0); }
    if (args[0] === 'rm') return Buffer.alloc(0);
    if (args[0] === 'ps') return Buffer.alloc(0);
    throw new Error('unexpected command');
  } };
  const inspect = async () => [{ Id: id, Name: `/${name}`, Image: checker, Config: { Labels: { 'com.docker.compose.project': 'deskdrop-mmani-local', 'com.docker.compose.service': 'checker', 'com.docker.compose.oneoff': 'True' }, Env: [`SOURCE_COMMIT=${commit}`, `APP_IMAGE_ID=${app}`, 'CHECKER_URL=http://deskdrop.test:3000'] }, State: { Running: running } }];
  const supervisor = journeySupervisor(ctx, { runCompose: async (_, args) => { name = args[8]; return Buffer.from(id); }, save: async value => saved.push(value), inspect });
  const job = supervisor.start();
  for (let i = 0; i < 30 && !waiting; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(waiting, true);
  await job.stop(); assert.equal(await job.promise, false);
  assert.deepEqual(calls.filter(args => args[0] === 'kill'), [['kill', id]]);
  assert.deepEqual(calls.filter(args => args[0] === 'rm'), [['rm', id]]);
  assert.equal(saved.at(-1).status, 'clean');
});
test('unknown journey creation blocks future attempts instead of touching foreign containers', async () => {
  const { journeySupervisor } = await import('../scripts/demo/local.mjs');
  let creates = 0, writes = [];
  const ctx = { commit: 'a'.repeat(40), ids: {}, docker: async () => { throw new Error('unexpected'); } };
  const supervisor = journeySupervisor(ctx, { runCompose: async () => { creates++; throw new Error('timeout'); }, save: async value => writes.push(value), inspect: async () => { throw new Error('not visible'); } });
  assert.equal(await supervisor.start().promise, false);
  assert.equal(supervisor.blocked, true);
  assert.equal(await supervisor.start().promise, false);
  assert.equal(creates, 1);
  assert.equal(writes.at(-1).status, 'creating');
});
test('foreground control confirms suppression before shutdown and removes its socket', { timeout: 5000 }, async () => {
  const { superviseForeground, controlRequest } = await import('../scripts/demo/local.mjs');
  const { mkdtemp, realpath, lstat, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'deskdrop-control-'))), calls = [];
  const ctx = { commit: 'a'.repeat(40), ids: { app: `sha256:${'b'.repeat(64)}` } };
  const promise = superviseForeground(ctx, { directory: dir, checkPrevious: async () => {}, createJourneys: () => ({ start: () => ({ promise: Promise.resolve(true), stop: async () => {} }), stopCurrent: async () => calls.push('journey-stop'), blocked: false }), protect: async value => calls.push(`protect:${value}`), stopServices: async ({ protect }) => { calls.push('services'); await protect(); }, schedulerFactory: ({ markResult }) => { markResult('availability', 0); markResult('checkout', 0); return { stop: async () => calls.push('scheduler-stop') }; } });
  try {
    for (let i = 0; i < 100; i++) { try { await lstat(join(dir, 'control.sock')); break; } catch { await new Promise(resolve => setTimeout(resolve, 10)); } }
    assert.equal((await controlRequest('check', dir)).status, 'healthy');
    assert.equal((await controlRequest('checker-stop', dir)).status, 'checker-stop');
    assert.equal((await controlRequest('stop', dir)).status, 'stopped');
    assert.equal((await promise).status, 'stopped');
    assert.deepEqual(calls, ['journey-stop', 'protect:true', 'scheduler-stop', 'services', 'protect:false']);
    await assert.rejects(lstat(join(dir, 'control.sock')), { code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('foreground SIGTERM suppresses monitoring and closes its control socket', { timeout: 5000 }, async () => {
  const { mkdtemp, realpath, lstat, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawn } = await import('node:child_process');
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'deskdrop-signal-'))), entry = new URL('../scripts/demo/local.mjs', import.meta.url).href;
  const code = `import {superviseForeground} from ${JSON.stringify(entry)}; const ctx={commit:'a'.repeat(40),ids:{app:'sha256:'+'b'.repeat(64)}}; await superviseForeground(ctx,{directory:process.argv[1],checkPrevious:async()=>{},createJourneys:()=>({blocked:false}),protect:async()=>{},stopServices:async()=>{},schedulerFactory:()=>({stop:async()=>{}})});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, dir], { stdio: ['ignore', 'pipe', 'ignore'] });
  const done = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); });
    child.kill('SIGTERM');
    assert.deepEqual(await done, { code: 0, signal: null });
    await assert.rejects(lstat(join(dir, 'control.sock')), { code: 'ENOENT' });
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await rm(dir, { recursive: true, force: true }); }
});
test('foreground controller asks only the owned relay to emit heartbeat', { timeout: 5000 }, async () => {
  const { superviseForeground, controlRequest } = await import('../scripts/demo/local.mjs');
  const { mkdtemp, realpath, lstat, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'deskdrop-relay-'))), calls = [];
  const ctx = { commit: 'a'.repeat(40), ids: { app: `sha256:${'b'.repeat(64)}` }, docker: async args => { calls.push(args); } };
  const relay = { Id: 'owned-relay', State: { Running: true }, Config: { Labels: { 'com.docker.compose.service': 'runner' } } };
  const promise = superviseForeground(ctx, { directory: dir, checkPrevious: async () => {}, findContainers: async () => [relay], createJourneys: () => ({ blocked: false }), protect: async () => {}, stopServices: async () => {}, schedulerFactory: ({ report }) => { void report('heartbeat', 0); return { stop: async () => {} }; } });
  try {
    for (let i = 0; i < 100; i++) { try { await lstat(join(dir, 'control.sock')); if (calls.length) break; } catch {} await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.deepEqual(calls, [['exec', 'owned-relay', 'node', '/checker/local-checker.mjs', '--emit', 'heartbeat', '0']]);
    assert.equal((await controlRequest('stop', dir)).status, 'stopped');
    await promise;
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('unknown one-off ownership never causes a kill or removal', async () => {
  const { journeySupervisor } = await import('../scripts/demo/local.mjs');
  const id = 'd'.repeat(64), calls = [];
  const ctx = { commit: 'a'.repeat(40), ids: { app: `sha256:${'b'.repeat(64)}`, checker: `sha256:${'c'.repeat(64)}` }, docker: async args => { calls.push(args); return Buffer.alloc(0); } };
  const supervisor = journeySupervisor(ctx, { runCompose: async () => { throw new Error('timeout'); }, save: async () => {}, inspect: async () => [{ Id: id, Name: '/foreign-container', Image: ctx.ids.checker, Config: { Labels: { 'com.docker.compose.project': 'another-project' } }, State: { Running: true } }] });
  assert.equal(await supervisor.start().promise, false);
  assert.equal(supervisor.blocked, true);
  assert.deepEqual(calls, []);
});
test('failed suppression leaves foreground services running and allows inspection', { timeout: 5000 }, async () => {
  const { superviseForeground, controlRequest } = await import('../scripts/demo/local.mjs');
  const { mkdtemp, realpath, lstat, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'deskdrop-protection-'))), calls = [];
  let blocked = true;
  const ctx = { commit: 'a'.repeat(40), ids: { app: `sha256:${'b'.repeat(64)}` } };
  const promise = superviseForeground(ctx, { directory: dir, checkPrevious: async () => {}, createJourneys: () => ({ blocked: false }), protect: async flag => { if (flag && blocked) throw new Error('unavailable'); }, stopServices: async () => calls.push('stop'), schedulerFactory: () => ({ stop: async () => calls.push('scheduler') }) });
  try {
    for (let i = 0; i < 100; i++) { try { await lstat(join(dir, 'control.sock')); break; } catch { await new Promise(resolve => setTimeout(resolve, 10)); } }
    await assert.rejects(controlRequest('stop', dir), /Suppression not confirmed/);
    assert.deepEqual(calls, []);
    assert.equal((await controlRequest('status', dir)).commit, ctx.commit);
    blocked = false;
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await controlRequest('stop', dir)).status, 'stopped');
    await promise;
    assert.deepEqual(calls, ['scheduler', 'stop']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('build refuses to overwrite a pre-existing local image tag', async () => {
  const { requireUnusedTag } = await import('../scripts/demo/local.mjs');
  const tag = `deskdrop-mmani-local-app:${'a'.repeat(40)}`;
  assert.throws(() => requireUnusedTag(Buffer.from(`${tag}\n`), tag));
  assert.doesNotThrow(() => requireUnusedTag(Buffer.alloc(0), tag));
});
test('availability rejects a healthy response unless the owned app and loopback forwarder are running', async () => {
  const { ownedAvailability } = await import('../scripts/demo/local.mjs');
  const app = { State: { Running: true }, Config: { Labels: { 'com.docker.compose.service': 'app' } } };
  const forwarder = { State: { Running: true }, Config: { Labels: { 'com.docker.compose.service': 'forwarder' } }, NetworkSettings: { Ports: { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3177' }] } } };
  let requests = 0;
  const fetcher = async () => { requests++; return { ok: true }; };
  assert.equal(await ownedAvailability({}, async () => [app, forwarder], fetcher), true);
  assert.equal(await ownedAvailability({}, async () => [{ ...app, State: { Running: false } }, forwarder], fetcher), false);
  const foreign = structuredClone(forwarder); foreign.NetworkSettings.Ports['3000/tcp'][0].HostIp = '0.0.0.0';
  assert.equal(await ownedAvailability({}, async () => [app, foreign], fetcher), false);
  assert.equal(requests, 1);
});

test('successful command terminates a descendant with detached stdio', { timeout: 3000 }, async () => {
  const { runCommand } = await import('../scripts/demo/local.mjs');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'deskdrop-descendant-')), marker = join(dir, 'pid');
  let pid;
  try {
    await runCommand('bash', ['-c', 'sleep 20 </dev/null >/dev/null 2>&1 & printf "%s" "$!" > "$1"; exit 0', 'fixture', marker], { timeout: 1000 });
    pid = Number(await readFile(marker, 'utf8'));
    let alive = true;
    for (let i = 0; i < 30; i++) {
      try { const state = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim(); alive = !!state && !state.startsWith('Z'); } catch { alive = false; }
      if (!alive) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(alive, false);
  } finally { if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} } await rm(dir, { recursive: true, force: true }); }
});

test('isolated Docker plugin links expose only verified Desktop executables before a build journal', async () => {
  const { prepareDockerPlugins, prepareBuild, guardedBuild } = await import('../scripts/demo/local.mjs');
  const { mkdtemp, mkdir, writeFile, symlink, readlink, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const base = await mkdtemp(join(tmpdir(), 'deskdrop-plugins-'));
  const home = join(base, 'home'), appDir = join(base, 'Docker.app'), state = join(base, 'state');
  try {
    await mkdir(join(home, '.docker', 'cli-plugins'), { recursive: true });
    await mkdir(appDir);
    for (const name of ['docker-buildx', 'docker-compose']) {
      const target = join(appDir, name);
      await writeFile(target, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      await symlink(target, join(home, '.docker', 'cli-plugins', name));
    }
    const calls = [];
    await prepareBuild({ directory: state, socket: async () => '/desktop.sock', prepare: config => prepareDockerPlugins(config, { home, appDir }), run: async (file, args, options) => { calls.push({ file, args, env: options.env }); return Buffer.alloc(0); } });
    assert.deepEqual(calls.map(x => x.args.slice(-2)), [['buildx', 'version'], ['compose', 'version']]);
    assert.equal(calls[0].env.DOCKER_CONFIG, join(state, 'docker-config'));
    assert.equal(calls[0].env.DD_API_KEY, undefined);
    assert.equal(await readlink(join(state, 'docker-config', 'cli-plugins', 'docker-buildx')), join(appDir, 'docker-buildx'));
    let journal = false;
    await assert.rejects(guardedBuild({ prepare: async () => { throw new Error('plugin missing'); }, operation: async () => { journal = true; } }), /plugin missing/);
    assert.equal(journal, false);
    await assert.rejects(guardedBuild({ prepare: () => prepareBuild({ directory: state, socket: async () => '/desktop.sock', prepare: config => prepareDockerPlugins(config, { home, appDir }), run: async (_file, args) => { assert.deepEqual(args.slice(-2), ['buildx', 'version']); throw new Error('plugin missing'); } }), operation: async () => { journal = true; } }), /Docker Desktop buildx unavailable before build/);
    assert.equal(journal, false);
    await writeFile(join(state, 'docker-config', 'config.json'), '{}');
    await assert.rejects(prepareDockerPlugins(join(state, 'docker-config'), { home, appDir }), /must not contain config.json/);
    await rm(join(state, 'docker-config', 'config.json'));
    await rm(join(home, '.docker', 'cli-plugins', 'docker-compose'));
    await symlink('/bin/sh', join(home, '.docker', 'cli-plugins', 'docker-compose'));
    await assert.rejects(prepareDockerPlugins(join(state, 'docker-config'), { home, appDir }), /plugin identity invalid/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('owned journey failure is read before removal and relayed with validated evidence', async () => {
  const { journeySupervisor, superviseForeground, controlRequest } = await import('../scripts/demo/local.mjs');
  const { datagram, runLocalJourney } = await import('../deploy/local-checker.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'deskdrop-evidence-'));
  const id = 'd'.repeat(64), relayId = 'e'.repeat(64), commit = 'a'.repeat(40), app = `sha256:${'b'.repeat(64)}`, checker = `sha256:${'c'.repeat(64)}`;
  const calls = []; let name, delivered;
  let record;
  assert.equal(await runLocalJourney({}, async (_config, _browser, _assertion, observe) => { observe({ stage: 'checkout_total', expected: '$97', actual: '$96' }); throw new Error('private'); }, value => { record = value; }), false);
  assert.equal(record.includes('private'), false);
  const ctx = { commit, ids: { app, checker }, docker: async args => {
    calls.push(args);
    if (args[0] === 'wait') return Buffer.from('1');
    if (args[0] === 'logs') return Buffer.from(record);
    if (args[0] === 'rm' || args[0] === 'ps') return Buffer.alloc(0);
    if (args[0] === 'exec') { assert.equal(args[1], relayId); delivered = datagram(args[5], Number(args[6]), JSON.parse(args[7])).toString(); return Buffer.alloc(0); }
    throw new Error('unexpected command');
  } };
  const inspect = async () => [{ Id: id, Name: `/${name}`, Image: checker, Config: { Labels: { 'com.docker.compose.project': 'deskdrop-mmani-local', 'com.docker.compose.service': 'checker', 'com.docker.compose.oneoff': 'True' }, Env: [`SOURCE_COMMIT=${commit}`, `APP_IMAGE_ID=${app}`, 'CHECKER_URL=http://deskdrop.test:3000'] }, State: { Running: false } }];
  const journeys = journeySupervisor(ctx, { runCompose: async (_, args) => { name = args[8]; return Buffer.from(id); }, save: async () => {}, inspect });
  try {
    const task = journeys.start(); assert.equal(await task.promise, false);
    assert.deepEqual(task.observation, { stage: 'checkout_total', expected: '$97', actual: '$96' });
    assert.ok(calls.findIndex(x => x[0] === 'logs' && x[1] === id) < calls.findIndex(x => x[0] === 'rm' && x[1] === id));
    record = '{"type":"deskdrop-journey-failure","stage":"checkout_total","expected":"$97","actual":"$96|private"}';
    const hostile = journeys.start(); assert.equal(await hostile.promise, false);
    assert.deepEqual(hostile.observation, { stage: 'journey_result', expected: 'observation', actual: 'unavailable' });
    const relay = { Id: relayId, State: { Running: true }, Config: { Labels: { 'com.docker.compose.service': 'runner' } } };
    const completion = superviseForeground(ctx, { directory: dir, checkPrevious: async () => {}, findContainers: async () => [relay], createJourneys: () => journeys, protect: async () => {}, stopServices: async () => {}, schedulerFactory: ({ report }) => { void report('checkout', 2, task.observation); return { stop: async () => {} }; } });
    for (let i = 0; i < 50 && !delivered; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(delivered?.includes('"stage":"checkout_total"'));
    assert.ok(delivered.includes('"actual":"$96"'));
    assert.ok(delivered.includes(commit)); assert.ok(delivered.includes(app));
    await controlRequest('stop', dir); await completion;
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('owned command transfers input and leaves a separate process group alive', { timeout: 3000 }, async () => {
  const { runCommand } = await import('../scripts/demo/local.mjs');
  const { spawn } = await import('node:child_process');
  const foreign = spawn('sleep', ['20'], { detached: true, stdio: 'ignore' });
  try {
    const input = Buffer.alloc(1048576, 65);
    assert.deepEqual(await runCommand('bash', ['-c', 'cat'], { input }), input);
    assert.doesNotThrow(() => process.kill(foreign.pid, 0));
  } finally { try { process.kill(-foreign.pid, 'SIGKILL'); } catch {} }
});
