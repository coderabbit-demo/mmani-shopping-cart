import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, chmod, lstat, mkdir, open, readlink, realpath, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import { createServer, createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const keys = ['DD_API_KEY', 'DD_APP_KEY', 'DD_APPLICATION_KEY', 'DD_SITE'];
export function credentials(contents, inherited = {}) {
  if (typeof contents !== 'string' || contents.length > 8192) throw new Error('Invalid local credentials');
  const seen = new Set();
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match || !keys.includes(match[1]) || seen.has(match[1])) throw new Error('Invalid local credentials');
    seen.add(match[1]);
  }
  const file = parseEnv(contents), values = {};
  for (const key of keys) {
    const env = inherited[key], fromFile = file[key];
    if ((env !== undefined && !env.trim()) || (fromFile !== undefined && !fromFile.trim()) || (env !== undefined && fromFile !== undefined && env !== fromFile)) throw new Error('Invalid local credentials');
    values[key] = env ?? fromFile;
  }
  if (!values.DD_API_KEY || (!values.DD_APP_KEY && !values.DD_APPLICATION_KEY) || (values.DD_APP_KEY && values.DD_APPLICATION_KEY && values.DD_APP_KEY !== values.DD_APPLICATION_KEY) || (values.DD_SITE && values.DD_SITE !== 'us3.datadoghq.com')) throw new Error('Invalid local credentials');
  return { apiKey: values.DD_API_KEY, appKey: values.DD_APP_KEY ?? values.DD_APPLICATION_KEY, site: 'us3.datadoghq.com' };
}
export async function loadCredentials(inherited = process.env, openFile = open) {
  const file = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), '.env.demo.local');
  const handle = await openFile(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = await handle.stat();
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600 || st.nlink !== 1 || st.size > 8192) throw new Error('Invalid local credentials');
    return credentials(await handle.readFile({ encoding: 'utf8' }), inherited);
  } finally { await handle.close(); }
}
export function childEnvironment(inherited = process.env) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'LANG', 'TMPDIR']) if (typeof inherited[key] === 'string') env[key] = inherited[key];
  return env;
}
export function verifyImage(image, commit, id) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? '') || !/^sha256:[a-f0-9]{64}$/.test(id ?? '') || image?.Id !== id || image?.Os !== 'linux' || image?.Architecture !== 'amd64' || image?.Config?.Labels?.['org.opencontainers.image.revision'] !== commit) throw new Error('Local image identity mismatch');
  return true;
}
export function verifyContainer(container, expectedId, expectedProject, expectedService) {
  if (expectedProject !== 'deskdrop-mmani-local' || !['app', 'checker', 'forwarder', 'runner', 'agent'].includes(expectedService) || container?.Image !== expectedId || container?.Config?.Labels?.['com.docker.compose.project'] !== expectedProject || container?.Config?.Labels?.['com.docker.compose.service'] !== expectedService) throw new Error('Container ownership or image mismatch');
  return true;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stateDir = path.join(os.homedir(), '.deskdrop-mmani-local');
export async function runCommand(file, args, { input, timeout = 120000, env = childEnvironment(), maxBytes = 50000000, signal: abortSignal } = {}) {
  if (!['git', 'docker', 'bash'].includes(file) || !Array.isArray(args)) throw new Error('Invalid command');
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) return reject(new Error('Local command failed'));
    const wrapper = '"$@" <&0 3>&- 4<&- & p=$!; wait "$p"; result=$?; printf "%s\\n" "$result" >&3; IFS= read -r _ <&4 || :';
    const child = spawn('bash', ['-c', wrapper, 'deskdrop-owned-command', file, ...args], { cwd: root, env, stdio: ['pipe', 'pipe', 'ignore', 'pipe', 'pipe'], detached: true });
    let done = false, output = [], length = 0, control = '', commandStatus;
    const signal = sig => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return false;
      try { process.kill(-child.pid, sig); return true; } catch { return false; }
    };
    const finish = (bad, result) => { if (done) return; done = true; clearTimeout(timer); process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt); abortSignal?.removeEventListener('abort', interrupt); bad ? reject(new Error('Local command failed')) : resolve(result); };
    const interrupt = () => { signal('SIGKILL'); finish(true); };
    const timer = setTimeout(interrupt, timeout);
    process.once('SIGTERM', interrupt); process.once('SIGINT', interrupt); abortSignal?.addEventListener('abort', interrupt, { once: true }); if (abortSignal?.aborted) interrupt();
    child.once('error', () => finish(true));
    child.stdio[3].on('data', bytes => {
      control += bytes.toString();
      if (control.length > 4 || !/^\d{1,3}\n$/.test(control)) { if (control.length > 4 || control.includes('\n')) interrupt(); return; }
      commandStatus = Number(control.trim());
      if (!signal('SIGKILL')) finish(true);
    });
    child.stdout.on('data', bytes => { length += bytes.length; if (length > maxBytes) interrupt(); else output.push(bytes); });
    child.once('close', () => finish(commandStatus !== 0, Buffer.concat(output)));
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
async function safeDirectory(directory, create = false) {
  if (create) await mkdir(directory, { recursive: false, mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  const st = await lstat(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) !== 0 || await realpath(directory) !== directory) throw new Error('Unsafe local runtime directory');
}
async function desktopSocket() {
  if (process.platform !== 'darwin') throw new Error('Docker Desktop Mac required');
  const socket = path.join(os.homedir(), '.docker/run/docker.sock');
  const st = await lstat(socket);
  if (!st.isSocket() || st.isSymbolicLink() || st.uid !== process.getuid() || await realpath(socket) !== socket) throw new Error('Invalid Docker Desktop socket');
  return socket;
}
export async function prepareDockerPlugins(config, { home = os.homedir(), appDir = '/Applications/Docker.app/Contents/Resources/cli-plugins' } = {}) {
  await safeDirectory(config, true);
  try { await lstat(path.join(config, 'config.json')); throw new Error('Isolated Docker config must not contain config.json'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const dir = path.join(config, 'cli-plugins');
  await safeDirectory(dir, true);
  for (const name of ['docker-buildx', 'docker-compose']) {
    const source = path.join(home, '.docker', 'cli-plugins', name), expected = path.join(appDir, name), dest = path.join(dir, name);
    const sourceStat = await lstat(source);
    if (!sourceStat.isSymbolicLink() || await realpath(source) !== expected) throw new Error('Docker Desktop plugin identity invalid');
    const target = await lstat(expected);
    if (!target.isFile() || target.isSymbolicLink() || (target.mode & 0o022) || ![0, process.getuid()].includes(target.uid)) throw new Error('Docker Desktop plugin identity invalid');
    await access(expected, constants.X_OK);
    await symlink(expected, dest).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const link = await lstat(dest);
    if (!link.isSymbolicLink() || await readlink(dest) !== expected || await realpath(dest) !== expected) throw new Error('Docker Desktop plugin link invalid');
  }
}
export async function prepareBuild({ socket = desktopSocket, run = runCommand, directory = stateDir, prepare = prepareDockerPlugins } = {}) {
  const endpoint = await socket();
  await safeDirectory(directory, true);
  const dockerConfig = path.join(directory, 'docker-config');
  try { await prepare(dockerConfig); } catch { throw new Error('Docker Desktop plugin preparation failed before build'); }
  const env = { ...childEnvironment(), DOCKER_CONFIG: dockerConfig };
  for (const plugin of ['buildx', 'compose']) {
    try { await run('docker', ['--host', `unix://${endpoint}`, plugin, 'version'], { env, timeout: 10000 }); }
    catch { throw new Error(`Docker Desktop ${plugin} unavailable before build`); }
  }
}
export async function guardedBuild({ prepare = prepareBuild, operation = withOperation } = {}) {
  await prepare();
  return operation('build', build);
}
export async function requireFreePort(port = 3177, serverFactory = createServer) {
  return new Promise((resolve, reject) => {
    const server = serverFactory();
    server.once('error', () => reject(new Error('Local port unavailable')));
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(new Error('Local port unavailable')) : resolve()));
  });
}
export async function preflight(run = runCommand) {
  await requireFreePort();
  const commit = (await run('git', ['rev-parse', 'HEAD'])).toString().trim();
  if (!/^[a-f0-9]{40}$/.test(commit) || (await run('git', ['status', '--porcelain', '--untracked-files=normal'])).length) throw new Error('Clean committed checkout required');
  const socket = await desktopSocket();
  const env = { ...childEnvironment(), DOCKER_CONFIG: path.join(stateDir, 'docker-config') };
  await run('docker', ['--host', `unix://${socket}`, 'info', '--format', '{{.ServerVersion}}'], { env });
  return { commit, port: 3177, project: 'deskdrop-mmani-local' };
}
export function requireUnusedTag(output, tag) {
  const found = output.toString().split('\n').map(line => line.trim()).filter(Boolean);
  if (found.includes(tag)) throw new Error('Local image tag already exists');
}
export async function build(run = runCommand, portCheck = requireFreePort) {
  await portCheck();
  const commit = (await run('git', ['rev-parse', 'HEAD'])).toString().trim();
  if (!/^[a-f0-9]{40}$/.test(commit) || (await run('git', ['status', '--porcelain', '--untracked-files=normal'])).length) throw new Error('Clean committed checkout required');
  const names = (await run('git', ['ls-tree', '-r', '--name-only', '-z', commit])).toString().split('\0').filter(Boolean);
  if (names.some(name => name.split('/').some(part => /^\.env/.test(part)) || /(^|\/)(node_modules|\.next|artifacts)(\/|$)/.test(name))) throw new Error('Unsafe tracked build inputs');
  const archive = await run('git', ['archive', '--format=tar', commit]);
  if (!archive.length) throw new Error('Empty source archive');
  const socket = await desktopSocket();
  await safeDirectory(stateDir, true);
  for (const name of [`checker-seccomp-${commit}.json`, `build-${commit}.json`]) {
    try { await lstat(path.join(stateDir, name)); throw new Error('Build record already exists; inspect the existing build'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const dockerConfig = path.join(stateDir, 'docker-config'); await safeDirectory(dockerConfig, true);
  const env = { ...childEnvironment(), DOCKER_CONFIG: dockerConfig };
  for (const kind of ['app', 'checker']) {
    const tag = `deskdrop-mmani-local-${kind}:${commit}`;
    const found = await run('docker', ['--host', `unix://${socket}`, 'image', 'ls', '--filter', `reference=${tag}`, '--format', '{{.Repository}}:{{.Tag}}'], { env });
    requireUnusedTag(found, tag);
  }
  const ids = {};
  for (const [kind, dockerfile] of [['app', 'Dockerfile'], ['checker', 'deploy/local-checker.Dockerfile']]) {
    const tag = `deskdrop-mmani-local-${kind}:${commit}`;
    await run('docker', ['--host', `unix://${socket}`, 'buildx', 'build', '--platform=linux/amd64', '--load', '--build-arg', `SOURCE_COMMIT=${commit}`, '-t', tag, '-f', dockerfile, '-'], { input: archive, env, timeout: 1800000 });
    const result = JSON.parse((await run('docker', ['--host', `unix://${socket}`, 'image', 'inspect', tag], { env })).toString());
    if (!Array.isArray(result) || result.length !== 1) throw new Error('Unexpected image result');
    ids[kind] = result[0].Id; verifyImage(result[0], commit, ids[kind]);
  }
  const profile = await run('bash', ['deploy/bootstrap.sh', 'seccomp-profile']);
  if (createHash('sha256').update(profile).digest('hex') !== '6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c') throw new Error('Seccomp profile mismatch');
  await writeFile(path.join(stateDir, `checker-seccomp-${commit}.json`), profile, { mode: 0o600, flag: 'wx' });
  await writeFile(path.join(stateDir, `build-${commit}.json`), JSON.stringify({ commit, architecture: 'linux/amd64', ids }) + '\n', { mode: 0o600, flag: 'wx' });
  return { commit, architecture: 'linux/amd64', ids };
}
const agentImage = 'registry.datadoghq.com/agent:7.85.0@sha256:1e45b8442dbcc297a01eb9ef61b7b909650b30e50f3dd6aa3654d89380bf5cc9';
async function runtimeFile(name, max = 65536) {
  const fh = await open(path.join(stateDir, name), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o077) || st.nlink !== 1 || st.size > max) throw new Error('Unsafe runtime file');
    return await fh.readFile();
  } finally { await fh.close(); }
}
async function createIntake(apiKey) {
  const dir = path.join(stateDir, 'secrets'); await safeDirectory(dir, true);
  const file = path.join(dir, 'intake');
  let fh;
  try { fh = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const st = await existing.stat(); if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600 || st.nlink !== 1 || st.size > 8192 || (await existing.readFile({ encoding: 'utf8' })) !== apiKey) throw new Error('Existing intake file requires operator reconciliation'); }
    finally { await existing.close(); }
    return dir;
  }
  try { await fh.writeFile(apiKey); await fh.sync(); } finally { await fh.close(); }
  return dir;
}
async function context(run = runCommand) {
  await safeDirectory(stateDir);
  const commit = (await run('git', ['rev-parse', 'HEAD'])).toString().trim();
  if (!/^[a-f0-9]{40}$/.test(commit) || (await run('git', ['status', '--porcelain', '--untracked-files=normal'])).length) throw new Error('Clean committed checkout required');
  const buildRecord = JSON.parse((await runtimeFile(`build-${commit}.json`)).toString());
  if (buildRecord.commit !== commit || buildRecord.architecture !== 'linux/amd64') throw new Error('Stale build');
  const profile = await runtimeFile(`checker-seccomp-${commit}.json`, 1000000);
  if (createHash('sha256').update(profile).digest('hex') !== '6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c') throw new Error('Seccomp profile mismatch');
  const socket = await desktopSocket(), env = { ...childEnvironment(), DOCKER_CONFIG: path.join(stateDir, 'docker-config') };
  await safeDirectory(env.DOCKER_CONFIG);
  const docker = (args, options = {}) => run('docker', ['--host', `unix://${socket}`, ...args], { env, ...options });
  for (const kind of ['app', 'checker']) {
    const result = JSON.parse((await docker(['image', 'inspect', buildRecord.ids?.[kind]])).toString());
    if (!Array.isArray(result) || result.length !== 1) throw new Error('Invalid image');
    verifyImage(result[0], commit, buildRecord.ids[kind]);
  }
  const agent = JSON.parse((await docker(['image', 'inspect', agentImage])).toString());
  if (!Array.isArray(agent) || agent.length !== 1 || agent[0].Os !== 'linux' || agent[0].Architecture !== 'amd64' || !agent[0].RepoDigests?.includes(agentImage.replace(':7.85.0@', '@')) || !/^sha256:[a-f0-9]{64}$/.test(agent[0].Id)) throw new Error('Invalid Agent image');
  return { commit, socket, env, docker, run, ids: { ...buildRecord.ids, agent: agent[0].Id } };
}
export function validateContainers(result, requested, expectedIds, allowPartial = false) {
  if (!Array.isArray(result) || result.length !== requested.length || requested.length > 4 || (!allowPartial && result.length !== 4)) throw new Error('Unexpected project containers');
  const found = new Set(), identities = new Set();
  for (const item of result) {
    const service = item?.Config?.Labels?.['com.docker.compose.service'];
    if (found.has(service) || !/^[a-f0-9]{64}$/.test(item?.Id ?? '') || identities.has(item.Id) || !requested.includes(item.Id)) throw new Error('Duplicate local service');
    found.add(service); identities.add(item.Id);
    verifyContainer(item, expectedIds[service === 'forwarder' ? 'app' : service === 'runner' ? 'checker' : service], 'deskdrop-mmani-local', service);
  }
  if (!allowPartial && !['app', 'forwarder', 'runner', 'agent'].every(x => found.has(x))) throw new Error('Missing local service');
  return result;
}
async function containers(ctx, allowPartial = false) {
  const listing = (await ctx.docker(['ps', '-a', '--no-trunc', '--filter', 'label=com.docker.compose.project=deskdrop-mmani-local', '--filter', 'label=com.docker.compose.oneoff=False', '--format', '{{.ID}}'])).toString().trim();
  if (!listing) return [];
  const ids = listing.split('\n');
  if (ids.length > 4 || ids.some(id => !/^[a-f0-9]{64}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error('Unexpected project containers');
  const result = JSON.parse((await ctx.docker(['inspect', ...ids])).toString());
  return validateContainers(result, ids, ctx.ids, allowPartial);
}
async function verifyNoOneoff(ctx) {
  try { const previous = JSON.parse((await runtimeFile('journey.json')).toString()); if (previous.status !== 'clean') throw new Error('Journey reconciliation required'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const existing = (await ctx.docker(['ps', '-a', '--no-trunc', '--filter', 'label=com.docker.compose.project=deskdrop-mmani-local', '--filter', 'label=com.docker.compose.oneoff=True', '--format', '{{.ID}}'])).toString().trim();
  if (existing) throw new Error('Journey reconciliation required');
}
async function verifyNetworks(ctx, existing = []) {
  const all = (await ctx.docker(['network', 'ls', '--format', '{{.Name}}'])).toString().trim().split('\n');
  for (const suffix of ['app', 'telemetry', 'edge']) {
    const name = `deskdrop-mmani-local_${suffix}`;
    if (!all.includes(name)) continue;
    const found = JSON.parse((await ctx.docker(['network', 'inspect', name])).toString());
    if (!Array.isArray(found) || found.length !== 1 || found[0]?.Labels?.['com.docker.compose.project'] !== 'deskdrop-mmani-local' || found[0]?.Labels?.['com.docker.compose.network'] !== suffix || Object.keys(found[0]?.Containers ?? {}).some(id => !existing.some(item => item.Id === id))) throw new Error('Network already in use');
  }
}
export async function compose(ctx, args, options = {}) {
  const up = ['up', '--detach', '--pull', 'never', 'app', 'forwarder', 'runner', 'agent'];
  const oneoff = args.length === 12 && JSON.stringify(args.slice(0, 7)) === JSON.stringify(['--profile', 'check', 'run', '--detach', '--no-deps', '--no-TTY', '--interactive=false']) && args[7] === '--name' && /^deskdrop-mmani-local-journey-[a-f0-9]{32}$/.test(args[8]) && JSON.stringify(args.slice(9)) === JSON.stringify(['--pull', 'never', 'checker']);
  if (JSON.stringify(args) !== JSON.stringify(up) && !oneoff) throw new Error('Invalid Compose operation');
  const env = { ...childEnvironment(ctx.env), DOCKER_CONFIG: ctx.env.DOCKER_CONFIG, LOCAL_APP_IMAGE: ctx.ids.app, LOCAL_CHECKER_IMAGE: ctx.ids.checker, LOCAL_APP_IMAGE_ID: ctx.ids.app, SOURCE_COMMIT: ctx.commit, LOCAL_SECCOMP_PROFILE: path.join(stateDir, `checker-seccomp-${ctx.commit}.json`), LOCAL_SECRET_DIR: path.join(stateDir, 'secrets'), LOCAL_DOCKER_SOCKET: ctx.socket };
  return ctx.run('docker', ['--host', `unix://${ctx.socket}`, 'compose', '--project-name', 'deskdrop-mmani-local', '--project-directory', root, '--env-file', '/dev/null', '-f', path.join(root, 'deploy/compose.local.yaml'), ...args], { env, timeout: 120000, ...options });
}
export function verifyJourneyContainer(item, name, ctx) {
  if (!/^deskdrop-mmani-local-journey-[a-f0-9]{32}$/.test(name) || item?.Name !== `/${name}` || !/^[a-f0-9]{64}$/.test(item?.Id ?? '') || item?.Config?.Labels?.['com.docker.compose.oneoff'] !== 'True') throw new Error('Journey ownership unknown');
  verifyContainer(item, ctx.ids.checker, 'deskdrop-mmani-local', 'checker');
  const vars = item.Config.Env ?? [];
  if (!Array.isArray(vars) || vars.some(v => /^(?:DD_|DATADOG_|AWS_|AZURE_|GOOGLE_|NEXT_PUBLIC_.*(?:KEY|SECRET|TOKEN))/i.test(v)) || !vars.includes(`SOURCE_COMMIT=${ctx.commit}`) || !vars.includes(`APP_IMAGE_ID=${ctx.ids.app}`) || !vars.includes('CHECKER_URL=http://deskdrop.test:3000')) throw new Error('Journey environment invalid');
  return item.Id;
}
async function saveJourney(value) {
  const temporary = path.join(stateDir, `.journey-${randomUUID()}`), target = path.join(stateDir, 'journey.json');
  const fh = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await fh.writeFile(JSON.stringify(value) + '\n'); await fh.sync(); } finally { await fh.close(); }
  try { await rename(temporary, target); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
export function journeySupervisor(ctx, { runCompose = compose, save = saveJourney, inspect = async name => JSON.parse((await ctx.docker(['inspect', name], { timeout: 5000 })).toString()), now = Date.now } = {}) {
  let blocked = false, current = null;
  function start() {
    if (blocked || current) return { promise: Promise.resolve(false), stop: async () => {} };
    const abort = new AbortController(), name = `deskdrop-mmani-local-journey-${randomBytes(16).toString('hex')}`;
    const task = { stop: async () => abort.abort() }; current = task;
    task.promise = (async () => {
      let id, result = false, created = false;
      const deadline = now() + 25000;
      try { await save({ name, commit: ctx.commit, status: 'creating' }); } catch { blocked = true; return false; }
      try {
        const args = ['--profile', 'check', 'run', '--detach', '--no-deps', '--no-TTY', '--interactive=false', '--name', name, '--pull', 'never', 'checker'];
        const response = (await runCompose(ctx, args, { signal: abort.signal, timeout: Math.max(1, deadline - now()) })).toString().trim();
        if (!/^[a-f0-9]{64}$/.test(response)) throw new Error('Journey create outcome unknown');
        const list = await inspect(response); if (!Array.isArray(list) || list.length !== 1) throw new Error('Journey ownership unknown');
        id = verifyJourneyContainer(list[0], name, ctx); if (id !== response) throw new Error('Journey ID mismatch');
        created = true; await save({ name, id, commit: ctx.commit, status: 'running' });
        const exit = (await ctx.docker(['wait', id], { signal: abort.signal, timeout: Math.max(1, deadline - now()) })).toString().trim();
        result = !abort.signal.aborted && now() <= deadline && exit === '0';
      } catch { result = false; }
      try {
        const list = await inspect(id ?? name);
        if (!Array.isArray(list) || list.length !== 1) throw new Error('Journey outcome unknown');
        const item = list[0], actual = verifyJourneyContainer(item, name, ctx);
        if (id && id !== actual) throw new Error('Journey ID mismatch');
        if (item.State?.Running) await ctx.docker(['kill', actual], { timeout: 5000 });
        const checked = await inspect(actual);
        if (!Array.isArray(checked) || checked.length !== 1 || verifyJourneyContainer(checked[0], name, ctx) !== actual || checked[0].State?.Running !== false) throw new Error('Journey stop unknown');
        if (!result && created) {
          try {
            const { parseJourneyFailure } = await import('../../deploy/local-checker.mjs');
            task.observation = parseJourneyFailure(await ctx.docker(['logs', actual], { timeout: 5000, maxBytes: 2048 }));
          } catch { task.observation = { stage: 'journey_result', expected: 'observation', actual: 'unavailable' }; }
        }
        await ctx.docker(['rm', actual], { timeout: 5000 });
        const remaining = (await ctx.docker(['ps', '-a', '--no-trunc', '--filter', `id=${actual}`, '--format', '{{.ID}}'], { timeout: 5000 })).toString().trim().split('\n').filter(Boolean);
        if (remaining.some(value => !/^[a-f0-9]{64}$/.test(value)) || remaining.includes(actual)) throw new Error('Journey removal unknown');
        await save({ name, id: actual, commit: ctx.commit, status: 'clean' });
      } catch { blocked = true; result = false; }
      if (!created) result = false;
      return result;
    })().finally(() => { current = null; });
    return task;
  }
  return { start, async stopCurrent() { if (current) { await current.stop(); await current.promise; } }, get blocked() { return blocked; } };
}
export async function start({ freePort = requireFreePort, getContext = context, findContainers = containers, checkNetworks = verifyNetworks, checkJourneys = verifyNoOneoff, protect = async value => (await import('./datadog-monitors.mjs')).verifyProtectedMonitors(value), getCredentials = loadCredentials, prepareIntake = createIntake, runCompose = compose, http = fetch, clock = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), supervise = superviseForeground } = {}) {
  await freePort();
  const ctx = await getContext(), existing = await findContainers(ctx);
  if (existing.some(c => c.State?.Running)) throw new Error('Owned project already running');
  await checkNetworks(ctx, existing);
  await checkJourneys(ctx);
  await protect(false);
  const secret = await getCredentials(); await prepareIntake(secret.apiKey);
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    await runCompose(ctx, ['up', '--detach', '--pull', 'never', 'app', 'forwarder', 'runner', 'agent']);
    const deadline = clock() + 90000;
    while (clock() < deadline) {
      if (interrupted) throw new Error('Startup interrupted');
      const owned = await findContainers(ctx);
      if (owned.length === 4 && owned.every(c => c.State?.Running)) {
        const app = owned.find(c => c.Config.Labels['com.docker.compose.service'] === 'app');
        const agent = owned.find(c => c.Config.Labels['com.docker.compose.service'] === 'agent');
        const runner = owned.find(c => c.Config.Labels['com.docker.compose.service'] === 'runner');
        if (app.State?.Health?.Status === 'healthy' && runner.State?.Health?.Status === 'healthy') {
          let ready = false;
          try {
            await ctx.docker(['exec', agent.Id, 'agent', 'health'], { timeout: 5000 });
            const r = await http('http://127.0.0.1:3177/', { signal: AbortSignal.timeout(3000), redirect: 'error' }); await r.body?.cancel();
            ready = r.ok;
          } catch {}
          if (ready) return await supervise(ctx);
        }
      }
      await sleep(1000);
    }
    throw new Error('Readiness failed');
  } catch {
    try { await protect(true); } catch { throw new Error('Suppression not confirmed; owned project remains running'); }
    try { for (const item of await findContainers(ctx, true)) if (item.State?.Running) await ctx.docker(['stop', '--time', '10', item.Id]); }
    catch { throw new Error('Startup failed; owned project cleanup requires inspection'); }
    throw new Error('Startup outcome requires inspection');
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
export async function ownedAvailability(ctx, findContainers = containers, fetcher = fetch) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(false); }, 5000); });
  const bounded = { ...ctx, docker: (args, options = {}) => ctx.docker(args, { ...options, timeout: 5000, signal: controller.signal }) };
  const work = (async () => {
    try {
      const owned = await findContainers(bounded);
      const app = owned.find(item => item.Config.Labels['com.docker.compose.service'] === 'app');
      const forwarder = owned.find(item => item.Config.Labels['com.docker.compose.service'] === 'forwarder');
      const bindings = forwarder?.NetworkSettings?.Ports?.['3000/tcp'];
      if (!app?.State?.Running || !forwarder?.State?.Running || !Array.isArray(bindings) || bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1' || bindings[0].HostPort !== '3177') return false;
      const response = await fetcher('http://127.0.0.1:3177/', { redirect: 'error', signal: controller.signal });
      await response.body?.cancel(); return response.ok;
    } catch { return false; }
  })();
  try { return await Promise.race([work, deadline]); } finally { clearTimeout(timer); }
}
export async function controlRequest(command, directory = stateDir) {
  await safeDirectory(directory);
  const file = path.join(directory, 'control.sock'), st = await lstat(file);
  if (!st.isSocket() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('Control socket invalid');
  return new Promise((resolve, reject) => {
    const socket = createConnection(file), chunks = []; let length = 0, done = false;
    const finish = (error, value) => { if (done) return; done = true; socket.destroy(); error ? reject(new Error('Control outcome unknown')) : resolve(value); };
    socket.setTimeout(60000, () => finish(true));
    socket.on('connect', () => socket.write(command + '\n'));
    socket.on('data', bytes => { length += bytes.length; if (length > 8192) finish(true); else chunks.push(bytes); });
    socket.on('error', () => finish(true));
    socket.on('end', () => { try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value.ok) { if (value.error === 'suppression_unconfirmed') { if (!done) { done = true; socket.destroy(); reject(new Error('Suppression not confirmed; owned project remains running')); } } else finish(true); } else finish(false, value.result); } catch { finish(true); } });
  });
}
export async function superviseForeground(ctx, { directory = stateDir, findContainers = containers, protect = async value => (await import('./datadog-monitors.mjs')).verifyProtectedMonitors(value), stopServices = stop, createJourneys = journeySupervisor, schedulerFactory, checkPrevious = async () => { try { const previous = JSON.parse((await runtimeFile('journey.json')).toString()); if (previous.status !== 'clean') throw new Error('Journey reconciliation required'); } catch (error) { if (error.code !== 'ENOENT') throw error; } } } = {}) {
  await safeDirectory(directory);
  await checkPrevious();
  const controlPath = path.join(directory, 'control.sock');
  try { await lstat(controlPath); throw new Error('Control socket already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { scheduler, diagnostic } = await import('../../deploy/local-checker.mjs');
  const journeys = createJourneys(ctx), observed = {}, createdAt = Date.now();
  let enabled = true, busy = false, closed = false, finish;
  const completion = new Promise(resolve => { finish = resolve; });
  let scheduled;
  async function report(name, status, observation) {
    try {
      const owned = await findContainers(ctx), relay = owned.find(x => x.Config.Labels['com.docker.compose.service'] === 'runner');
      if (!relay?.State?.Running) throw new Error('Relay unavailable');
      const args = ['exec', relay.Id, 'node', '/checker/local-checker.mjs', '--emit', name, String(status)];
      if (status === 2 && name !== 'heartbeat') args.push(JSON.stringify(diagnostic(name, { url: 'http://deskdrop.test:3000', source: ctx.commit, image: ctx.ids.app }, observation)));
      await ctx.docker(args, { timeout: 5000 });
      observed.telemetry = 'sent';
    } catch { observed.telemetry = 'unknown'; }
  }
  function markResult(name, value, observation) {
    observed[name] = { status: value, time: Date.now() };
    if (value === 2) console.log(JSON.stringify(diagnostic(name, { url: 'http://deskdrop.test:3000', source: ctx.commit, image: ctx.ids.app }, observation)));
  }
  async function shutdown() {
    try { await protect(true); } catch { throw new Error('Suppression not confirmed; owned project remains running'); }
    await scheduled.stop();
    if (journeys.blocked) throw new Error('Journey reconciliation required');
    await stopServices({ getContext: async () => ctx, protect: async () => protect(false) });
    closed = true;
    const st = await lstat(controlPath);
    if (!st.isSocket() || st.isSymbolicLink() || st.uid !== process.getuid() || st.ino !== socketInode) throw new Error('Control socket changed');
    await unlink(controlPath);
    server.close();
    process.removeListener('SIGINT', signalStop); process.removeListener('SIGTERM', signalStop);
  }
  const signalStop = () => { if (busy || closed) return; busy = true; shutdown().then(() => finish({ status: 'stopped', commit: ctx.commit })).catch(() => console.error('Shutdown incomplete; inspect owned project and journals')).finally(() => { busy = false; }); };
  const server = createServer(socket => {
    let input = '';
    socket.setTimeout(60000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', bytes => {
      input += bytes.toString();
      if (input.length > 1024) { socket.destroy(); return; }
      if (!input.includes('\n')) return;
      const command = input.trim();
      const respond = result => { if (!socket.destroyed) socket.end(JSON.stringify(result)); };
      if (command === 'status') { respond({ ok: true, result: { commit: ctx.commit, since: createdAt, checks: observed, journeyBlocked: journeys.blocked } }); return; }
      if (command === 'check') {
        const healthy = ['availability', 'checkout'].every(name => observed[name]?.status === 0 && Date.now() - observed[name].time <= 90000);
        respond(healthy ? { ok: true, result: { status: 'healthy', commit: ctx.commit } } : { ok: false }); return;
      }
      if (busy || !['stop', 'checker-stop', 'checker-restart', 'app-stop', 'app-restart', 'runner-stop', 'runner-restart'].includes(command)) { respond({ ok: false }); return; }
      busy = true;
      const operation = async () => {
        if (command === 'stop') { await shutdown(); respond({ ok: true, result: { status: 'stopped' } }); finish({ status: 'stopped', commit: ctx.commit }); return; }
        if (command === 'checker-stop') { enabled = false; await journeys.stopCurrent(); if (journeys.blocked) throw new Error('Journey reconciliation required'); }
        else if (command === 'checker-restart') { if (journeys.blocked) throw new Error('Journey reconciliation required'); enabled = true; }
        else { const [service, action] = command.split('-'); await serviceAction(action, service); }
        respond({ ok: true, result: { status: command } });
      };
      operation().catch(error => { if (command === 'stop') console.error('Shutdown incomplete; inspect owned project and journals'); respond({ ok: false, error: error?.message === 'Suppression not confirmed; owned project remains running' ? 'suppression_unconfirmed' : 'unknown' }); }).finally(() => { busy = false; });
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(controlPath, resolve); });
  await chmod(controlPath, 0o600);
  const socketStat = await lstat(controlPath), socketInode = socketStat.ino;
  if (!socketStat.isSocket() || socketStat.uid !== process.getuid() || (socketStat.mode & 0o077)) throw new Error('Control socket invalid');
  process.on('SIGINT', signalStop); process.on('SIGTERM', signalStop);
  scheduled = (schedulerFactory ?? scheduler)({ report, runAvailability: () => ownedAvailability(ctx, findContainers), runJourney: () => enabled ? journeys.start() : { promise: Promise.resolve(false), stop: async () => {} }, markHealthy: () => {}, markResult });
  console.log(JSON.stringify({ status: 'ready', url: 'http://localhost:3177/', commit: ctx.commit, appImageId: ctx.ids.app }));
  return completion;
}
export async function stop({ getContext = context, findContainers = containers, protect = async value => (await import('./datadog-monitors.mjs')).verifyProtectedMonitors(value) } = {}) {
  const ctx = await getContext(), owned = await findContainers(ctx, true);
  await protect(true);
  if (!owned.length) return { status: 'stopped' };
  for (const item of owned) if (item.State?.Running) await ctx.docker(['stop', '--time', '10', item.Id]);
  if ((await findContainers(ctx, true)).some(item => item.State?.Running)) throw new Error('Stop outcome requires inspection');
  return { status: 'stopped' };
}
async function serviceAction(action, service) {
  const ctx = await context(), owned = await containers(ctx), item = owned.find(c => c.Config.Labels['com.docker.compose.service'] === service);
  if (!item) throw new Error('Owned service missing');
  if (action === 'stop') await ctx.docker(['stop', '--time', '10', item.Id]);
  else if (action === 'restart') await ctx.docker(['restart', '--time', '10', item.Id]);
  else throw new Error('Invalid service action');
  return { status: action, service };
}
async function saveOperation(value) {
  const temporary = path.join(stateDir, `.operation-${randomUUID()}`), target = path.join(stateDir, 'operation.json');
  const fh = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await fh.writeFile(JSON.stringify(value) + '\n'); await fh.sync(); } finally { await fh.close(); }
  try { await rename(temporary, target); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
async function withOperation(name, action) {
  await safeDirectory(stateDir);
  const lockPath = path.join(stateDir, 'local.lock');
  const fh = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    try { const previous = JSON.parse((await runtimeFile('operation.json')).toString()); if (!['pending', 'complete'].includes(previous.status)) throw new Error('Invalid operation journal'); if (previous.status === 'pending') throw new Error('Inspect previous unknown operation before continuing'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await saveOperation({ name, status: 'pending' });
    const result = await action();
    await saveOperation({ name, status: 'complete' });
    return result;
  } finally { await fh.close(); await unlink(lockPath); }
}
async function main() {
  if (process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === 'help')) return { commands: ['help', 'status', 'preflight', 'build', 'start', 'stop', 'check', 'app-stop', 'app-restart', 'checker-stop', 'checker-restart', 'runner-stop', 'runner-restart'] };
  if (process.argv.length === 3 && process.argv[2] === 'preflight') return preflight();
  if (process.argv.length === 3 && process.argv[2] === 'build') { await requireFreePort(); return guardedBuild(); }
  if (process.argv.length === 3 && process.argv[2] === 'start') { await requireFreePort(); return withOperation('start', start); }
  if (process.argv.length === 3 && ['status', 'check', 'stop', 'app-stop', 'app-restart', 'checker-stop', 'checker-restart', 'runner-stop', 'runner-restart'].includes(process.argv[2])) return controlRequest(process.argv[2]);
  throw new Error('Invalid local command');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(value => console.log(JSON.stringify(value)), error => {
  const messages = new Set(['Local port unavailable', 'Clean committed checkout required', 'Docker Desktop Mac required', 'Invalid Docker Desktop socket', 'Docker Desktop plugin preparation failed before build', 'Docker Desktop buildx unavailable before build', 'Docker Desktop compose unavailable before build', 'Unsafe local runtime directory', 'Unsafe runtime file', 'Local image identity mismatch', 'Container ownership or image mismatch', 'Stale build', 'Seccomp profile mismatch', 'Invalid Agent image', 'Owned project already running', 'Network already in use', 'Monitor notifications are not suppressed', 'Suppression not effective', 'Monitor reconciliation required', 'Datadog API access denied', 'Datadog API rate limited', 'Datadog request outcome unknown', 'Suppression not confirmed; owned project remains running', 'Startup failed; owned project cleanup requires inspection', 'Startup outcome requires inspection', 'Control outcome unknown', 'Journey reconciliation required', 'Stop outcome requires inspection', 'Inspect previous unknown operation before continuing', 'Existing intake file requires operator reconciliation', 'Build record already exists; inspect the existing build', 'Local image tag already exists']);
  console.error(messages.has(error?.message) ? error.message : 'Local operation failed; inspect owned state and journal'); process.exitCode = 1;
});
