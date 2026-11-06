import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { runCommand as command } from '../scripts/demo/local.mjs';
const script = readFileSync(new URL('../deploy/seccomp-profile.sh', import.meta.url), 'utf8');
const commit = 'a'.repeat(40);
const imageFixture = `sha256:${'a'.repeat(64)}`;
function composeConfig() {
  const result = spawnSync('docker', ['compose', '-f', 'deploy/compose.local.yaml', '--profile', 'check', 'config', '--format', 'json'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, LOCAL_APP_IMAGE: imageFixture, LOCAL_CHECKER_IMAGE: imageFixture, LOCAL_APP_IMAGE_ID: imageFixture, SOURCE_COMMIT: commit, LOCAL_SECCOMP_PROFILE: '/tmp/deskdrop-fixture-profile.json', LOCAL_SECRET_DIR: '/tmp/deskdrop-fixture-secrets', LOCAL_DOCKER_SOCKET: '/tmp/deskdrop-fixture.sock' } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('checker namespace policy retains default-deny and Docker capability restrictions', () => {
  const config = composeConfig();
  assert.ok(config.services.checker.security_opt.some(option => option.startsWith('seccomp=')), 'checker requires its reviewed namespace policy');
  assert.ok(config.services.checker.shm_size >= 268435456, 'private shared memory must fit Chromium');
  assert.deepEqual(config.services.checker.cap_drop, ['ALL']);
  assert.ok(config.services.checker.security_opt.includes('no-new-privileges:true'));
  const result = spawnSync('bash', ['deploy/seccomp-profile.sh'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  const profile = JSON.parse(result.stdout);
  const upstream = script.split("profile = json.loads(r'''")[1].split("''')")[0];
  assert.equal(createHash('sha256').update(upstream).digest('hex'), '6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6', 'embedded Docker baseline bytes must match the pinned official source');
  const baseline = JSON.parse(upstream);
  assert.deepEqual(profile.syscalls.slice(1), baseline.syscalls, 'all existing Docker rules must survive unchanged');
  assert.deepEqual({ ...profile, syscalls: [] }, { ...baseline, syscalls: [] });
  assert.deepEqual(profile.syscalls[0].names, ['clone', 'setns', 'unshare', 'chroot']);
  assert.equal(createHash('sha256').update(result.stdout).digest('hex'), script.match(/profile_sha=([a-f0-9]{64})/)[1], 'installed policy must be hash-bound to emitted bytes');
  assert.equal(profile.defaultAction, 'SCMP_ACT_ERRNO');
  const effective = name => profile.syscalls.filter(rule => rule.names.includes(name) && !rule.includes?.caps?.length && !rule.includes?.arches?.length && !rule.args?.length);
  for (const name of ['clone', 'setns', 'unshare', 'chroot']) assert.ok(effective(name).some(rule => rule.action === 'SCMP_ACT_ALLOW'));
  for (const name of ['mount', 'bpf', 'kexec_load', 'perf_event_open']) assert.ok(!effective(name).some(rule => rule.action === 'SCMP_ACT_ALLOW'), `${name} must remain restricted`);
  assert.ok(effective('clone3').some(rule => rule.action === 'SCMP_ACT_ERRNO' && rule.errnoRet === 38));
});

test('only the fixed forwarder publishes loopback; app/checker retain the internal network', () => {
  const config = composeConfig(), { app, checker, forwarder } = config.services;
  assert.ok(forwarder, 'internal-only app requires a separate publishing endpoint');
  assert.ok(!app.ports && !checker.ports);
  assert.ok(!app.secrets && !checker.secrets && !forwarder.secrets);
  assert.deepEqual(Object.keys(app.networks), ['app']);
  assert.deepEqual(Object.keys(checker.networks), ['app']);
  assert.equal(config.networks.app.internal, true);
  assert.deepEqual(Object.keys(forwarder.networks).sort(), ['app', 'edge']);
  assert.equal(forwarder.ports[0].host_ip, '127.0.0.1');
  assert.equal(forwarder.ports[0].published, '3177');
  assert.equal(forwarder.image, imageFixture);
  assert.equal(forwarder.user, '1000:1000');
  assert.equal(forwarder.read_only, true);
  assert.deepEqual(forwarder.cap_drop, ['ALL']);
  assert.ok(forwarder.security_opt.includes('no-new-privileges:true'));
  assert.ok(!forwarder.volumes && !checker.volumes && !app.volumes);
});

import net from 'node:net';
import http from 'node:http';
import vm from 'node:vm';
test('fixed forwarder serves real loopback HTTP and closes failed backend connections', async () => {
  const config = composeConfig();
  const code = config.services.forwarder.command.at(-1);
  const large = 'x'.repeat(2 * 1024 * 1024);
  const backend = http.createServer((request, response) => { response.setHeader('Connection', 'close'); response.end(request.url === '/large' ? large : 'private app fixture'); });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  let proxy, upstreamPort = backend.address().port;
  const adapter = {
    createConnection(target) { assert.deepEqual(JSON.parse(JSON.stringify(target)), { host: 'deskdrop.test', port: 3000 }); return net.createConnection({ host: '127.0.0.1', port: upstreamPort }); },
    createServer(handler) {
      proxy = net.createServer(handler);
      const listen = proxy.listen.bind(proxy);
      proxy.listen = (port, host) => { assert.equal(port, 3000); assert.equal(host, '0.0.0.0'); return listen(0, '127.0.0.1'); };
      return proxy;
    },
  };
  try {
    vm.runInNewContext(code, { require(name) { assert.equal(name, 'node:net'); return adapter; } });
    await once(proxy, 'listening');
    assert.equal(proxy.maxConnections, 128);
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}`, { signal: AbortSignal.timeout(2000) });
    assert.equal(await response.text(), 'private app fixture');
    const bulk = await fetch(`http://127.0.0.1:${proxy.address().port}/large`, { signal: AbortSignal.timeout(2000) });
    assert.equal(await bulk.text(), large, 'backend close must not truncate buffered HTTP output');
    await new Promise(resolve => backend.close(resolve));
    await assert.rejects(fetch(`http://127.0.0.1:${proxy.address().port}`, { signal: AbortSignal.timeout(2000) }));
  } finally {
    await new Promise(resolve => proxy?.close(resolve) ?? resolve());
    await new Promise(resolve => backend.close(resolve));
  }
});

test('forwarder timeout and connection errors close both sockets without selecting arbitrary targets', () => {
  const code = composeConfig().services.forwarder.command.at(-1);
  for (const failure of ['timeout', 'error']) {
    const sockets = [];
    const socket = () => {
      const callbacks = {};
      const value = { callbacks, destroyed: false, setTimeout(ms) { assert.equal(ms, 30000); }, on(event, fn) { callbacks[event] = fn; }, pipe(target) { return target; }, destroy() { this.destroyed = true; } };
      sockets.push(value); return value;
    };
    let connect;
    vm.runInNewContext(code, { require(name) {
      assert.equal(name, 'node:net');
      return { createServer(handler) { connect = handler; return { listen(port, host) { assert.equal(port, 3000); assert.equal(host, '0.0.0.0'); } }; }, createConnection(target) { assert.equal(target.host, 'deskdrop.test'); assert.equal(target.port, 3000); return socket(); } };
    } });
    connect(socket());
    sockets[0].callbacks[failure](new Error('synthetic-private-error'));
    assert.ok(sockets.every(socket => socket.destroyed));
  }
});

test('bounded command output rejects safely and removes interruption listeners', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  await assert.rejects(command('git', ['-c', 'alias.fixture=!printf synthetic-private-output', 'fixture'], { maxBytes: 4 }), error => !String(error).includes('synthetic-private-output'));
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), before);
});

test('Compose gives the app the reserved browser alias and fixes checker navigation to it', () => {
  const { services } = composeConfig();
  assert.equal(services.checker.environment.CHECKER_URL, 'http://deskdrop.test:3000', 'bare app is an HSTS domain, not a valid private HTTP browser endpoint');
  assert.ok(services.app.networks.app.aliases.includes('deskdrop.test'));
});

test('local command removes listeners after success, exit failure, spawn failure and timeout', async () => {
  const counts = () => ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  const before = counts();
  assert.match((await command('git', ['rev-parse', '--show-toplevel'])).toString().trim(), /mmani-shopping-cart$/);
  assert.deepEqual(counts(), before);
  await assert.rejects(command('git', ['not-a-command']));
  assert.deepEqual(counts(), before);
  await assert.rejects(command('git', [], { env: { PATH: '/nonexistent-fixture-bin' } }));
  assert.deepEqual(counts(), before);
  const directory = await mkdtemp(join(tmpdir(), 'deskdrop-timeout-'));
  let pid;
  try {
    const marker = join(directory, 'started');
    const began = Date.now();
    await assert.rejects(command('bash', ['-c', 'printf "%s" "$$" > "$1"; exec sleep 30', 'fixture', marker], { timeout: 1000 }), error => !String(error).includes('sleep'));
    pid = Number(await readFile(marker, 'utf8'));
    assert.ok(Number.isInteger(pid) && pid > 0, 'fixture must have started');
    assert.ok(Date.now() - began >= 900, 'fixture must reach the command timeout');
    assert.ok(Date.now() - began < 5000, 'timeout must settle within a bounded interval');
    for (let attempt = 0; attempt < 50; attempt++) {
      const result = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8', timeout: 1000 });
      if (!result.stdout.trim() || result.stdout.trim().startsWith('Z')) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8', timeout: 1000 });
    assert.ok(!state.stdout.trim() || state.stdout.trim().startsWith('Z'), 'timeout must terminate the started fixture');
  } finally {
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    await rm(directory, { recursive: true, force: true });
  }
  assert.deepEqual(counts(), before);
});
