import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer, createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { childEnvironment, loadCredentials } from './local.mjs';

export const target = Object.freeze({ site: 'us3.datadoghq.com', checkout: 29524290, availability: 29524154, heartbeat: 29524292, host: 'deskdrop-mmani-local', rule: '8e4ea5f2-29e7-410d-a4a3-b258c8fc30fc', recipient: 'webhook-deskdrop-mmani-local' });
export const bounds = Object.freeze({ prepare: 60000, request: 10000, control: 15000, poll: 5000, alert: 180000, protection: 20000, restart: 30000, recovery: 360000 });
export const directory = path.join(os.homedir(), '.deskdrop-mmani-local');
export async function protectedDirectory(dir) {
  const st = await lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) || await realpath(dir) !== dir) throw new Error('Unsafe trigger directory');
}
export async function readState(dir, name) {
  operationContext()?.signal.throwIfAborted();
  await protectedDirectory(dir);
  if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw new Error('Invalid state name');
  const fh = await open(path.join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600 || st.nlink !== 1 || st.size > 65536) throw new Error('Unsafe trigger state');
    return JSON.parse(await fh.readFile('utf8'));
  } finally { await fh.close(); }
}
export async function writeState(dir, name, value) {
  operationContext()?.signal.throwIfAborted();
  await protectedDirectory(dir);
  if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw new Error('Invalid state name');
  try { await readState(dir, name); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = path.join(dir, `.trigger-${randomUUID()}`);
  const fh = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { const text = JSON.stringify(value); if (Buffer.byteLength(text) > 65536) throw new Error('Oversized trigger state'); await fh.writeFile(text + '\n'); await fh.sync(); }
  finally { await fh.close(); }
  try { operationContext()?.signal.throwIfAborted(); await rename(temp, path.join(dir, name)); const parent = await open(dir, constants.O_RDONLY); try { await parent.sync(); } finally { await parent.close(); } }
  finally { await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
export async function exclusive(dir, name, action) {
  await protectedDirectory(dir);
  const file = path.join(dir, name);
  const fh = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  const identity = await fh.stat();
  try { return await action(); }
  finally {
    await fh.close();
    const current = await lstat(file);
    if (identity.ino !== current.ino || identity.dev !== current.dev) throw new Error('Lock changed');
    await unlink(file);
  }
}
export function validateReceipt(r) {
  if (!r || r.version !== 1 || !/^[a-f0-9-]{36}$/.test(r.run ?? '') || !['armed', 'cancel', 'stop', 'observe', 'protect', 'restart', 'verify', 'complete', 'uncertain'].includes(r.phase) || !Number.isSafeInteger(r.started) || !Number.isSafeInteger(r.deadline) || r.deadline !== r.started + bounds.recovery || !r.identity || r.identity.checkout !== target.checkout) throw new Error('Trigger reconciliation required');
  if (r.attempt && (!Number.isSafeInteger(r.attempt.started) || r.attempt.deadline !== r.attempt.started + bounds.recovery)) throw new Error('Invalid recovery attempt');
  return r;
}
const operations = new AsyncLocalStorage();
export function operationContext() { return operations.getStore(); }
export async function bounded(action, ms) {
  const parent = operationContext();
  parent?.signal.throwIfAborted();
  const deadline = Math.min(Date.now() + ms, parent?.deadline ?? Infinity);
  if (deadline <= Date.now()) throw new Error('Outcome unknown');
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent.signal, controller.signal]) : controller.signal;
  let timer, abort;
  try {
    return await Promise.race([
      operations.run({ signal, deadline }, () => action(signal)),
      new Promise((_, reject) => {
        abort = () => reject(new Error('Outcome unknown'));
        signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
      })
    ]);
  } finally { clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); }
}
export async function cli(args, { inspect, launch, status } = {}) {
  const [command = 'help', ...rest] = args;
  if (['help', 'plan', 'status'].includes(command) ? rest.length : !['run', 'recover'].includes(command) || rest.length !== 1 || rest[0] !== '--execute') throw new Error('Invalid trigger command');
  if (command === 'help') return { commands: ['help', 'plan', 'run --execute', 'status', 'recover --execute'], target, bounds };
  if (command === 'plan') return inspect();
  if (command === 'status') return status();
  return launch(command);
}
export async function main(args) {
  return cli(args, {
    inspect: async () => (await import('./trigger-watchdog.mjs')).inspectProduction(),
    status: async () => {
      try { return evidence(validateReceipt(await readState(directory, 'trigger.json'))); }
      catch (e) { if (e.code === 'ENOENT') return { status: 'no-rehearsal' }; throw e; }
    },
    launch: async command => {
      if (process.platform !== 'darwin') throw new Error('Trigger requires the Mac');
      await loadCredentials();
      const child = spawnSupervisor(new URL('./trigger-watchdog.mjs', import.meta.url), command);
      return observeSupervisor(child, async () => evidence(validateReceipt(await readState(directory, 'trigger.json'))));
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then(value => { console.log(JSON.stringify(value)); if (value?.unknown && value?.supervisor) process.exitCode = 1; }, () => { console.error('Trigger blocked; inspect owned readiness and protected journals'); process.exitCode = 1; });

export function claimPort(dir) {
  return 20000 + createHash('sha256').update(`${process.getuid()}:${dir}`).digest().readUInt16BE(0) % 30000;
}
export function spawnSupervisor(entry, command) {
  return spawn(process.execPath, [fileURLToPath(entry), command], { detached: true, env: childEnvironment(), stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
}
export async function supervisorClaim(dir, action) {
  await protectedDirectory(dir);
  try { await lstat(path.join(dir, 'trigger-claim.lock')); throw new Error('Legacy claim requires inspection'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const mutex = createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => { mutex.once('error', reject); mutex.listen({host: '127.0.0.1', port: claimPort(dir), exclusive: true}, resolve); });
  try { return await action(); }
  finally { await new Promise(resolve => mutex.close(resolve)); }
}
export async function supervisorLease(dir, recover, action, checkpoint = async () => {}) {
  const token = randomUUID();
  const socketFile = leaseSocket(dir, token);
  await protectedDirectory(dir);
  const server = createServer(socket => { socket.on('error', () => {}); socket.end(token); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketFile, resolve); });
  const { chmod } = await import('node:fs/promises');
  await chmod(socketFile, 0o600);
  const lockFile = path.join(dir, 'trigger.lock');
  let own = false;
  try {
    await supervisorClaim(dir, async () => {
      await checkpoint('claim');
      if (recover) {
        let previous;
        try { previous = await readState(dir, 'trigger.lock'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (previous) {
          if (!/^[a-f0-9-]{36}$/.test(previous.token ?? '')) throw new Error('Invalid supervisor lock');
          const oldSocket = leaseSocket(dir, previous.token);
          const st = await lstat(oldSocket);
          if (!st.isSocket() || st.uid !== process.getuid() || st.mode & 0o077) throw new Error('Unsafe supervisor socket');
          const dead = await new Promise(resolve => {
            const c = createConnection(oldSocket);
            c.setTimeout(1000, () => { c.destroy(); resolve(false); });
            c.once('connect', () => { c.destroy(); resolve(false); });
            c.once('error', e => { c.destroy(); resolve(e.code === 'ECONNREFUSED'); });
          });
          if (!dead) throw new Error('Supervisor active or unknown');
          let monitorLock, monitorMissing = false;
          try { monitorLock = await readState(dir, 'monitor.lock'); } catch (error) { if (error.code !== 'ENOENT') throw error; monitorMissing = true; }
          if (!monitorMissing) {
            if (!monitorLock || Object.keys(monitorLock).join(',') !== 'token' || monitorLock.token !== previous.token) throw new Error('Monitor lock ownership unknown');
            await unlink(path.join(dir, 'monitor.lock'));
          }
          await unlink(lockFile); await unlink(oldSocket);
        }
      }
      const fh = await open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await fh.writeFile(JSON.stringify({ token })); await fh.sync(); own = true; } finally { await fh.close(); }
      await checkpoint('trigger');
    });
    const monitor = await open(path.join(dir, 'monitor.lock'), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await monitor.writeFile(JSON.stringify({ token })); await monitor.sync(); return await action(); }
    finally { await monitor.close(); if ((await readState(dir, 'monitor.lock')).token !== token) throw new Error('Monitor lock changed'); await unlink(path.join(dir, 'monitor.lock')); }
  } finally {
    if (own && (await readState(dir, 'trigger.lock')).token === token) await unlink(lockFile);
    await new Promise(resolve => server.close(resolve));
    await unlink(socketFile).catch(e => { if (e.code !== 'ENOENT') throw e; });
  }
}

export function leaseSocket(dir, token) {
  const file = path.join(dir, `t-${createHash('sha256').update(token).digest('hex').slice(0, 12)}.sock`);
  if (Buffer.byteLength(file) > 103) throw new Error('Supervisor socket path too long');
  return file;
}
export function evidence(r) {
  const identity = {};
  for (const [key, pattern] of Object.entries({ commit: /^[a-f0-9]{40}$/, toolingCommit: /^[a-f0-9]{40}$/, appImageId: /^sha256:[a-f0-9]{64}$/ })) if (pattern.test(r.identity?.[key] ?? '')) identity[key] = r.identity[key];
  return { run: r.run, phase: r.phase, started: r.started, deadline: r.deadline, attempt: r.attempt ? { started: r.attempt.started, deadline: r.attempt.deadline, ...(/^[a-f0-9]{40}$/.test(r.attempt.toolingCommit ?? '') ? { toolingCommit: r.attempt.toolingCommit } : {}) } : undefined, alertObserved: r.alertObserved === true, protected: r.protected === true, recovered: r.recovered === true, released: r.releaseConfirmed === true, outcome: r.phase === 'complete' && r.releaseConfirmed ? r.alertObserved ? 'alert-observed-and-restored' : 'no-alert-observed-restored' : 'reconciliation-required', failure: !!r.failure, unknown: r.phase !== 'complete' || !r.releaseConfirmed, identity, providerEvent: 'unavailable', monitor: `https://us3.datadoghq.com/monitors/${target.checkout}` };
}
export function observeSupervisor(child, receipt, limit = bounds.prepare + bounds.recovery + 5000) {
  return new Promise(resolve => {
    let done = false, acceptedRun;
    const finish = async status => {
      if (done) return; done = true; clearTimeout(timer);
      child.removeListener('message', message); child.removeListener('exit', exit); child.removeListener('disconnect', lost); child.removeListener('error', exit);
      child.unref(); child.channel?.unref();
      let result; try { result = await receipt(); if (!acceptedRun || result.run !== acceptedRun) result = { unknown: true }; } catch { result = { unknown: true }; }
      if (!['complete', 'uncertain'].includes(status)) result = { ...result, unknown: true, outcome: 'reconciliation-required' };
      resolve({ ...result, supervisor: status });
    };
    const message = m => { if (m?.status === 'accepted') acceptedRun = m.run; if (['complete', 'uncertain', 'blocked'].includes(m?.status)) void finish(m.status); };
    const exit = () => void finish('exited');
    const lost = () => void finish('connection-lost');
    const timer = setTimeout(() => void finish('observation-timeout'), limit);
    child.on('message', message); child.once('exit', exit); child.once('disconnect', lost); child.once('error', exit);
  });
}

export function confirmedControl(record, run, action) {
  return record?.run === run && record.action === action && record.status === 'confirmed' && Object.keys(record).sort().join(',') === 'action,run,status';
}
