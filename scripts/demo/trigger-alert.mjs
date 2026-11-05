import { constants } from 'node:fs';
import { open, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer, createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { childEnvironment, loadCredentials } from './local.mjs';

export const target = Object.freeze({ site: 'us3.datadoghq.com', checkout: 29524290, availability: 29524154, heartbeat: 29524292, host: 'deskdrop-mmani-local', rule: '8e4ea5f2-29e7-410d-a4a3-b258c8fc30fc', recipient: 'webhook-deskdrop-mmani-local' });
export const bounds = Object.freeze({ prepare: 60000, request: 10000, control: 15000, poll: 5000, alert: 180000, protection: 20000, restart: 30000, recovery: 360000 });
export const directory = path.join(os.homedir(), '.deskdrop-mmani-local');
export async function protectedDirectory(dir) {
  const st = await lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) || await realpath(dir) !== dir) throw new Error('Unsafe trigger directory');
}
export async function readState(dir, name) {
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
  await protectedDirectory(dir);
  if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw new Error('Invalid state name');
  try { await readState(dir, name); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = path.join(dir, `.trigger-${randomUUID()}`);
  const fh = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { const text = JSON.stringify(value); if (Buffer.byteLength(text) > 65536) throw new Error('Oversized trigger state'); await fh.writeFile(text + '\n'); await fh.sync(); }
  finally { await fh.close(); }
  try { await rename(temp, path.join(dir, name)); const parent = await open(dir, constants.O_RDONLY); try { await parent.sync(); } finally { await parent.close(); } }
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
  return r;
}
export async function bounded(action, ms) {
  const controller = new AbortController();
  let timer;
  try { return await Promise.race([action(controller.signal), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Outcome unknown')); }, Math.max(1, ms)); })]); }
  finally { clearTimeout(timer); }
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
      try { const r = validateReceipt(await readState(directory, 'trigger.json')); return { run: r.run, phase: r.phase, started: r.started, deadline: r.deadline, monitor: `https://us3.datadoghq.com/monitors/${target.checkout}` }; }
      catch (e) { if (e.code === 'ENOENT') return { status: 'no-rehearsal' }; throw e; }
    },
    launch: async command => {
      if (process.platform !== 'darwin') throw new Error('Trigger requires the Mac');
      await loadCredentials();
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [new URL('./trigger-watchdog.mjs', import.meta.url).pathname, command], { detached: true, env: childEnvironment(), stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        const timer = setTimeout(() => { child.disconnect(); child.unref(); reject(new Error('Supervisor outcome unknown; inspect status')); }, bounds.prepare + 5000);
        child.once('error', () => { clearTimeout(timer); reject(new Error('Supervisor unavailable')); });
        child.on('message', message => {
          if (message?.status === 'accepted') { clearTimeout(timer); return; }
          if (message?.status !== 'complete' && message?.status !== 'uncertain' && message?.status !== 'blocked') return;
          clearTimeout(timer);
          if (child.connected) child.disconnect(); child.unref();
          resolve({ status: message.status, ...(message.run ? { run: message.run } : {}) });
        });
      });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then(value => console.log(JSON.stringify(value)), () => { console.error('Trigger blocked; inspect owned readiness and protected journals'); process.exitCode = 1; });

export async function supervisorLease(dir, recover, action) {
  const token = randomUUID();
  const socketFile = path.join(dir, `trigger-${token}.sock`);
  await protectedDirectory(dir);
  const server = createServer(socket => { socket.on('error', () => {}); socket.end(token); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketFile, resolve); });
  const { chmod } = await import('node:fs/promises');
  await chmod(socketFile, 0o600);
  const lockFile = path.join(dir, 'trigger.lock');
  let own = false;
  try {
    await exclusive(dir, 'trigger-claim.lock', async () => {
      if (recover) {
        let previous;
        try { previous = await readState(dir, 'trigger.lock'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (previous) {
          if (!/^[a-f0-9-]{36}$/.test(previous.token ?? '')) throw new Error('Invalid supervisor lock');
          const oldSocket = path.join(dir, `trigger-${previous.token}.sock`);
          const st = await lstat(oldSocket);
          if (!st.isSocket() || st.uid !== process.getuid() || st.mode & 0o077) throw new Error('Unsafe supervisor socket');
          const dead = await new Promise(resolve => {
            const c = createConnection(oldSocket);
            c.setTimeout(1000, () => { c.destroy(); resolve(false); });
            c.once('connect', () => { c.destroy(); resolve(false); });
            c.once('error', e => { c.destroy(); resolve(e.code === 'ECONNREFUSED'); });
          });
          if (!dead) throw new Error('Supervisor active or unknown');
          const monitorLock = await readState(dir, 'monitor.lock');
          if (monitorLock.token !== previous.token) throw new Error('Monitor lock ownership unknown');
          await unlink(path.join(dir, 'monitor.lock')); await unlink(lockFile); await unlink(oldSocket);
        }
      }
      const fh = await open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await fh.writeFile(JSON.stringify({ token })); await fh.sync(); own = true; } finally { await fh.close(); }
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
