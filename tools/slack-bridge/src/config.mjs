import { constants, openSync, fstatSync, closeSync, lstatSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export function privatePath(path, directory = false) {
  const s=lstatSync(path);
  if (s.isSymbolicLink() || (directory ? !s.isDirectory() : !s.isFile()) || s.uid !== process.getuid() || (s.mode & 0o777) !== (directory ? 0o700 : 0o600) || (!directory && s.nlink !== 1)) throw new Error('unsafe private path');
  if (!directory) {
    const fd=openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const f=fstatSync(fd); if (f.dev !== s.dev || f.ino !== s.ino || f.nlink !== 1) throw new Error('unsafe private path'); } finally { closeSync(fd); }
  }
  return path;
}
export function readPrivate(path) {
  privatePath(path);
  const fd=openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const s=fstatSync(fd); if (!s.isFile() || s.uid !== process.getuid() || (s.mode & 0o777)!==0o600 || s.nlink!==1 || s.size>32768) throw new Error('unsafe private file'); return readFileSync(fd,'utf8'); } finally { closeSync(fd); }
}
export function tokens(path) {
  const pairs=readPrivate(path).trim().split('\n').map(line => /^([A-Z_]+)=(\S+)$/.exec(line));
  if (pairs.length !== 2 || pairs.some(p => !p) || new Set(pairs.map(p=>p[1])).size !== 2 || pairs.some(p=>!['SLACK_BOT_TOKEN','SLACK_APP_TOKEN'].includes(p[1]))) throw new Error('invalid token file');
  const result=Object.fromEntries(pairs.map(p=>[p[1],p[2]]));
  if (!/^xoxb-\S+$/.test(result.SLACK_BOT_TOKEN) || !/^xapp-\S+$/.test(result.SLACK_APP_TOKEN)) throw new Error('invalid token format');
  return result;
}
export function privateHome(root, initialize=false) {
  if (!isAbsolute(root)) throw new Error('private root must be absolute');
  if (!existsSync(root)) { if (!initialize) throw new Error('private root missing'); mkdirSync(root,{mode:0o700}); }
  privatePath(root,true);
  const db=join(root,'state.sqlite'); const marker=join(root,'initialized');
  if (existsSync(marker)) { privatePath(marker); if (readPrivate(marker)!=='deskdrop-state-v1\n') throw new Error('incompatible state marker; restore or migrate explicitly'); if (!existsSync(db)) throw new Error('initialized database missing; restore from backup'); privatePath(db); }
  else if (!initialize || existsSync(db)) throw new Error('initialization required or state marker missing; inspect and restore');
  for (const suffix of ['-wal','-shm']) if (existsSync(db+suffix)) privatePath(db+suffix);
  return {db,marker};
}
export function validateConfig(c) {
  if (!c || c.teamId !== 'T0AU433PG75' || c.channelId !== 'C0CEPB2LURY' || !/^A[A-Z0-9]+$/.test(c.appId || '') || !/^B[A-Z0-9]+$/.test(c.botId || '')) throw new Error('invalid installation identity');
  if (!Number.isFinite(c.actionStart) || !Number.isFinite(c.actionEnd) || c.actionEnd <= c.actionStart) throw new Error('invalid action window');
  for (const id of ['mmani_create_jira','mmani_debug_pr']) if (!Array.isArray(c.actors?.[id]) || !c.actors[id].length || c.actors[id].some(x=>!/^U[A-Z0-9]+$/.test(x))) throw new Error('invalid action permissions');
  if (!isAbsolute(c.twgPath || '') || !isAbsolute(c.coderabbitPath || '') || !isAbsolute(c.gitPath || '') || !isAbsolute(c.ghPath || '') || !isAbsolute(c.bashPath || '') || !isAbsolute(c.datadogCredentialsFile || '') || !isAbsolute(c.workdir || '') || resolve(c.workdir)!==c.workdir) throw new Error('invalid fixed process paths');
  for (const id of ['29524154','29524290','29524292']) if (!c.monitors?.[id] || typeof c.monitors[id].query !== 'string' || !c.monitors[id].query || typeof c.monitors[id].owner !== 'string' || !c.monitors[id].owner || !Array.isArray(c.monitors[id].tags)) throw new Error('monitor proof configuration missing');
  return c;
}
export function approvalRevision(a) {
  return createHash('sha256').update(JSON.stringify([a.repository,a.repositoryId,a.branch,a.commit,a.base,a.baseBranch,a.deliveryBranch,a.issueUrl,a.delivery,a.reviewMode,a.owner,a.allowedFiles,a.minutes,a.maxTasks,a.startsAt,a.endsAt])).digest('hex');
}
export function validateApproval(a, now=Date.now()) {
  if (!a || a.repository !== 'coderabbit-demo/mmani-shopping-cart' || a.repositoryId !== '1437431331' || !/^[a-f0-9]{40}$/.test(a.commit || '') || !/^[a-f0-9]{40}$/.test(a.base || '') || !/^codex\/[a-zA-Z0-9._/-]+$/.test(a.branch || '') || !/^U[A-Z0-9]+$/.test(a.owner || '') || !/^[a-f0-9]{64}$/.test(a.revision || '') || !Array.isArray(a.allowedFiles) || !a.allowedFiles.length || a.allowedFiles.some(s=>typeof s!=='string' || !/^[a-zA-Z0-9._/-]+$/.test(s) || s.includes('..')) || !Number.isFinite(a.minutes) || a.minutes<=0 || !Number.isInteger(a.maxTasks) || a.maxTasks!==1 || !Number.isFinite(a.startsAt) || !Number.isFinite(a.endsAt) || now<a.startsAt || now>=a.endsAt || a.branch.includes('..') || a.branch.includes('//') || a.branch.endsWith('/') || a.revision!==approvalRevision(a)) throw new Error('invalid or expired approval');
  return a;
}
