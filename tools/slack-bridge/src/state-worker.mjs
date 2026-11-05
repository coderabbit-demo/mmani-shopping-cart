import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

const db = new DatabaseSync(workerData.path, { allowExtension: false });
const version = db.prepare('PRAGMA user_version').get().user_version;
if ((workerData.initialize && version!==0) || (!workerData.initialize && version!==1)) throw new Error('incompatible database version; restore or migrate explicitly');
db.exec(`PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
CREATE TABLE IF NOT EXISTS incidents (episode TEXT PRIMARY KEY, monitor TEXT NOT NULL, cycle TEXT NOT NULL, synthetic INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cards (ts TEXT PRIMARY KEY, episode TEXT NOT NULL REFERENCES incidents(episode), digest TEXT NOT NULL, actionable INTEGER NOT NULL, jira_handle TEXT UNIQUE NOT NULL, debug_handle TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries (event TEXT PRIMARY KEY, episode TEXT NOT NULL, digest TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (episode TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, fence INTEGER NOT NULL, remote_id TEXT, remote_key TEXT, PRIMARY KEY(episode,kind));
CREATE TABLE IF NOT EXISTS budgets (episode TEXT PRIMARY KEY, revision TEXT NOT NULL, cap REAL NOT NULL, used REAL NOT NULL DEFAULT 0, usage_unknown INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS approvals (episode TEXT NOT NULL, revision TEXT NOT NULL, task_id TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(episode,revision,task_id));
CREATE TABLE IF NOT EXISTS handoffs (episode TEXT PRIMARY KEY, pr TEXT NOT NULL, head TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS controls (handle TEXT PRIMARY KEY, episode TEXT NOT NULL, ts TEXT NOT NULL, task_id TEXT NOT NULL, revision TEXT NOT NULL, UNIQUE(episode,ts,task_id,revision));
CREATE TABLE IF NOT EXISTS runs (episode TEXT NOT NULL, stage TEXT NOT NULL, reserved REAL NOT NULL, deadline INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY(episode,stage));
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, episode TEXT NOT NULL, ts TEXT NOT NULL, status TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0);
PRAGMA user_version=1;`);
const q = sql => db.prepare(sql);
const transact = fn => { db.exec('BEGIN IMMEDIATE'); try { const v = fn(); db.exec('COMMIT'); return v; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const card = ts => q('SELECT * FROM cards WHERE ts=?').get(ts);
const art = (episode, kind) => q('SELECT * FROM artifacts WHERE episode=? AND kind=?').get(episode, kind);
const operations = {
  bootstrap({incident, ts, digest}) { return transact(() => {
    let c = card(ts);
    if (c) { if (c.digest !== digest || c.episode !== incident.episode) throw new Error('card binding mismatch'); return c; }
    q('INSERT OR IGNORE INTO incidents(episode, monitor, cycle, synthetic) VALUES (?,?,?,?)').run(incident.episode, incident.monitor, incident.cycle, Number(incident.test));
    const i=q('SELECT * FROM incidents WHERE episode=?').get(incident.episode);
    if (i.monitor !== incident.monitor || i.cycle !== incident.cycle || i.synthetic !== Number(incident.test)) throw new Error('episode mismatch');
    q('INSERT OR IGNORE INTO deliveries(event,episode,digest) VALUES (?,?,?)').run(incident.event, incident.episode,digest);
    const delivery=q('SELECT episode,digest FROM deliveries WHERE event=?').get(incident.event);
    if (delivery.episode !== incident.episode || delivery.digest !== digest) throw new Error('delivery identity conflict');
    const handles=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
    q('INSERT INTO cards VALUES (?,?,?,?,?,?)').run(ts,incident.episode,digest,Number(incident.actionable),...handles);
    return card(ts);
  }); },
  resolve({ts, action, handle}) { const c=card(ts); if (!c || (action === 'mmani_create_jira' ? c.jira_handle : c.debug_handle) !== handle) throw new Error('unknown handle'); const i=q('SELECT monitor, synthetic FROM incidents WHERE episode=?').get(c.episode); return {...c,...i}; },
  claim({episode, kind}) { return transact(() => {
    const existing=art(episode,kind);
    if (existing && existing.state !== 'prestart_failed') return { acquired:false, artifact:existing };
    const i=q('UPDATE incidents SET revision=revision+1 WHERE episode=? RETURNING revision').get(episode);
    if (!i) throw new Error('unknown episode');
    q(`INSERT INTO artifacts(episode,kind,state,fence) VALUES (?,?,'claimed',?) ON CONFLICT(episode,kind) DO UPDATE SET state='claimed',fence=excluded.fence,remote_id=NULL,remote_key=NULL`).run(episode,kind,i.revision);
    return { acquired:true, artifact:art(episode,kind) };
  }); },
  transition({episode,kind,fence,from,to,id=null,key=null}) { return transact(() => {
    const allowed = { claimed:['dispatch_intent','prestart_failed','known'], dispatch_intent:['known','unknown','prestart_failed'], unknown:['known'], known:['confirmed'], confirmed:['running','completed','awaiting_native_verify'], running:['completed','unknown','awaiting_native_verify'], completed:['awaiting_native_verify'] };
    if (!allowed[from]?.includes(to)) throw new Error('invalid transition');
    const result=q('UPDATE artifacts SET state=?,remote_id=COALESCE(?,remote_id),remote_key=COALESCE(?,remote_key) WHERE episode=? AND kind=? AND fence=? AND state=?').run(to,id,key,episode,kind,fence,from);
    if (result.changes !== 1) throw new Error('stale fence');
    return art(episode,kind);
  }); },
  getCard({ts}) { const c=card(ts); if (!c) return null; const i=q('SELECT monitor, synthetic FROM incidents WHERE episode=?').get(c.episode); return {...c,...i}; },
  getArtifact({episode,kind}) { return art(episode,kind) || null; },
  setHandoff({episode,pr,head}) { q("INSERT INTO handoffs VALUES (?,?,?,'awaiting_native_verify') ON CONFLICT(episode) DO UPDATE SET pr=excluded.pr,head=excluded.head,status=excluded.status").run(episode,pr,head); return true; },
  handoffs() { return q('SELECT * FROM handoffs').all(); },
  getBudget({episode}) { return q('SELECT * FROM budgets WHERE episode=?').get(episode) || null; },
  initBudget({episode,revision,cap}) { return transact(() => { q('INSERT OR IGNORE INTO budgets(episode,revision,cap) VALUES (?,?,?)').run(episode,revision,cap); const b=q('SELECT * FROM budgets WHERE episode=?').get(episode); if (b.revision!==revision || b.cap!==cap || b.usage_unknown || b.used>=b.cap) throw new Error('budget unavailable'); return b; }); },
  usage({episode,minutes}) { if (minutes===null || !Number.isFinite(minutes) || minutes<0) { q('UPDATE budgets SET usage_unknown=1 WHERE episode=?').run(episode); return false; } q('UPDATE budgets SET used=used+? WHERE episode=?').run(minutes,episode); return true; },
  approval({episode,revision,taskId}) { return transact(() => {
    const task=art(episode,'task');
    if (!task || task.remote_id !== taskId || task.state!=='confirmed') throw new Error('approval task mismatch');
    q('INSERT OR IGNORE INTO approvals VALUES (?,?,?,0)').run(episode,revision,taskId);
    return true;
  }); },
  consumeApproval({episode,revision,taskId}) { const r=q('UPDATE approvals SET consumed=1 WHERE episode=? AND revision=? AND task_id=? AND consumed=0').run(episode,revision,taskId); if (r.changes !== 1) throw new Error('approval mismatch'); return true; },
  makeControl({episode,ts,taskId,revision}) { return transact(() => {
    const task=art(episode,'task'), c=card(ts);
    if (!c || c.episode!==episode || !task || task.remote_id!==taskId || task.state!=='confirmed') throw new Error('control mismatch');
    let existing=q('SELECT * FROM controls WHERE episode=? AND ts=? AND task_id=? AND revision=?').get(episode,ts,taskId,revision);
    if (!existing) { q('INSERT INTO controls VALUES (?,?,?,?,?)').run(randomBytes(32).toString('hex'),episode,ts,taskId,revision); existing=q('SELECT * FROM controls WHERE episode=? AND ts=? AND task_id=? AND revision=?').get(episode,ts,taskId,revision); }
    return existing;
  }); },
  controlForCard({ts}) { return q('SELECT * FROM controls WHERE ts=? ORDER BY rowid DESC LIMIT 1').get(ts) || null; },
  getControl({handle,ts}) { return q('SELECT * FROM controls WHERE handle=? AND ts=?').get(handle,ts) || null; },
  reserve({episode,stage,amount,deadline}) { return transact(() => {
    const b=q('SELECT * FROM budgets WHERE episode=?').get(episode);
    const active=q("SELECT COALESCE(SUM(reserved),0) AS total FROM runs WHERE episode=? AND status IN ('active','unknown')").get(episode).total;
    if (!b || b.usage_unknown || !Number.isFinite(amount) || amount<=0 || !Number.isSafeInteger(deadline) || b.used+active+amount>b.cap || q('SELECT * FROM runs WHERE episode=? AND stage=?').get(episode,stage)) throw new Error('budget unavailable');
    q("INSERT INTO runs VALUES (?,?,?,?,'active')").run(episode,stage,amount,deadline); return true;
  }); },
  finishRun({episode,stage,minutes}) { return transact(() => {
    const r=q('SELECT * FROM runs WHERE episode=? AND stage=?').get(episode,stage);
    if (!r || r.status!=='active') throw new Error('run unavailable');
    if (!Number.isFinite(minutes) || minutes<0) { q("UPDATE runs SET status='unknown' WHERE episode=? AND stage=?").run(episode,stage); q('UPDATE budgets SET usage_unknown=1 WHERE episode=?').run(episode); return false; }
    q("UPDATE runs SET status='complete' WHERE episode=? AND stage=?").run(episode,stage); q('UPDATE budgets SET used=used+? WHERE episode=?').run(minutes,episode); return true;
  }); },
  activeRuns() { return q("SELECT * FROM runs WHERE status='active'").all(); },
  pendingStops() { return q("SELECT * FROM runs WHERE status='unknown'").all(); },
  stopped({episode,stage}) { q("UPDATE runs SET status='unknown_stopped' WHERE episode=? AND stage=? AND status='unknown'").run(episode,stage); return true; },
  artifacts() { return q('SELECT * FROM artifacts').all(); },
  cards() { return q('SELECT * FROM cards').all(); },
  enqueue({episode,ts,status}) { return Number(q('INSERT INTO outbox(episode,ts,status) VALUES (?,?,?)').run(episode,ts,status).lastInsertRowid); },
  pending() { return q('SELECT * FROM outbox WHERE delivered=0 ORDER BY id').all(); },
  delivered({id}) { q('UPDATE outbox SET delivered=1 WHERE id=?').run(id); return true; },
  close() { db.close(); return true; }
};
parentPort.on('message', ({id,op,args}) => { try { if (!Object.hasOwn(operations,op)) throw new Error('unknown operation'); parentPort.postMessage({id,value:operations[op](args || {})}); } catch { parentPort.postMessage({id,error:'state operation failed'}); } });
