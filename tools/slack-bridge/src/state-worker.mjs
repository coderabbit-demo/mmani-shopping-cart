import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

const db = new DatabaseSync(workerData.path, { allowExtension: false });
db.exec('PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
try {
const version = db.prepare('PRAGMA user_version').get().user_version;
if ((workerData.initialize && version!==0) || (!workerData.initialize && ![1,2].includes(version))) throw new Error('incompatible database version; restore or migrate explicitly');
db.exec(`
CREATE TABLE IF NOT EXISTS incidents (episode TEXT PRIMARY KEY, monitor TEXT NOT NULL, cycle TEXT NOT NULL, synthetic INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cards (ts TEXT PRIMARY KEY, episode TEXT NOT NULL REFERENCES incidents(episode), digest TEXT NOT NULL, actionable INTEGER NOT NULL, jira_handle TEXT UNIQUE NOT NULL, debug_handle TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries (event TEXT PRIMARY KEY, episode TEXT NOT NULL, digest TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (episode TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, fence INTEGER NOT NULL, remote_id TEXT, remote_key TEXT, PRIMARY KEY(episode,kind));
CREATE TABLE IF NOT EXISTS reviews (episode TEXT PRIMARY KEY, receipt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS grants (revision TEXT PRIMARY KEY, episode TEXT UNIQUE NOT NULL, cap REAL, uncapped INTEGER NOT NULL DEFAULT 0 CHECK(uncapped IN (0,1)), CHECK((uncapped=1 AND cap IS NULL) OR (uncapped=0 AND cap>0)));
CREATE TABLE IF NOT EXISTS budgets (episode TEXT PRIMARY KEY, revision TEXT NOT NULL, cap REAL, uncapped INTEGER NOT NULL DEFAULT 0 CHECK(uncapped IN (0,1)), used REAL NOT NULL DEFAULT 0, usage_unknown INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS approvals (episode TEXT NOT NULL, revision TEXT NOT NULL, task_id TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(episode,revision,task_id));
CREATE TABLE IF NOT EXISTS handoffs (episode TEXT PRIMARY KEY, pr TEXT NOT NULL, head TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS controls (handle TEXT PRIMARY KEY, episode TEXT NOT NULL, ts TEXT NOT NULL, task_id TEXT NOT NULL, revision TEXT NOT NULL, UNIQUE(episode,ts,task_id,revision));
CREATE TABLE IF NOT EXISTS runs (episode TEXT NOT NULL, stage TEXT NOT NULL, reserved REAL, deadline INTEGER, status TEXT NOT NULL, minutes REAL, uncapped INTEGER NOT NULL DEFAULT 0 CHECK(uncapped IN (0,1)), CHECK((uncapped=1 AND reserved IS NULL AND deadline IS NULL) OR (uncapped=0 AND reserved>0 AND deadline IS NOT NULL)), PRIMARY KEY(episode,stage));
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, episode TEXT NOT NULL, ts TEXT NOT NULL, status TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0);
`);
if(version===1) db.exec(`
ALTER TABLE grants RENAME TO grants_v1;
CREATE TABLE grants (revision TEXT PRIMARY KEY, episode TEXT UNIQUE NOT NULL, cap REAL, uncapped INTEGER NOT NULL DEFAULT 0 CHECK(uncapped IN (0,1)), CHECK((uncapped=1 AND cap IS NULL) OR (uncapped=0 AND cap>0)));
INSERT INTO grants(revision,episode,cap) SELECT revision,episode,cap FROM grants_v1;
ALTER TABLE budgets RENAME TO budgets_v1;
CREATE TABLE budgets (episode TEXT PRIMARY KEY, revision TEXT NOT NULL, cap REAL, uncapped INTEGER NOT NULL DEFAULT 0 CHECK(uncapped IN (0,1)), used REAL NOT NULL DEFAULT 0, usage_unknown INTEGER NOT NULL DEFAULT 0);
INSERT INTO budgets(episode,revision,cap,used,usage_unknown) SELECT episode,revision,cap,used,usage_unknown FROM budgets_v1;
ALTER TABLE runs RENAME TO runs_v1;
CREATE TABLE runs (episode TEXT NOT NULL, stage TEXT NOT NULL, reserved REAL, deadline INTEGER, status TEXT NOT NULL, minutes REAL, uncapped INTEGER NOT NULL DEFAULT 0 CHECK(uncapped IN (0,1)), CHECK((uncapped=1 AND reserved IS NULL AND deadline IS NULL) OR (uncapped=0 AND reserved>0 AND deadline IS NOT NULL)), PRIMARY KEY(episode,stage));
INSERT INTO runs(episode,stage,reserved,deadline,status) SELECT episode,stage,reserved,deadline,status FROM runs_v1;
DROP TABLE grants_v1; DROP TABLE budgets_v1; DROP TABLE runs_v1;`);
db.exec('PRAGMA user_version=2; COMMIT');
} catch(e) { db.exec('ROLLBACK'); throw e; }
const q = sql => db.prepare(sql);
const transact = fn => { db.exec('BEGIN IMMEDIATE'); try { const v = fn(); db.exec('COMMIT'); return v; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const card = ts => q('SELECT * FROM cards WHERE ts=?').get(ts);
const art = (episode, kind) => q('SELECT * FROM artifacts WHERE episode=? AND kind=?').get(episode, kind);
function finishRun({episode,stage,minutes,completed=false}) {
  const r=q('SELECT * FROM runs WHERE episode=? AND stage=?').get(episode,stage);
  if(r?.status==='complete' && completed) {
    if(r.uncapped && r.minutes===null && Number.isFinite(minutes) && minutes>=0) {
      q('UPDATE runs SET minutes=? WHERE episode=? AND stage=? AND minutes IS NULL').run(minutes,episode,stage);
      q('UPDATE budgets SET used=used+? WHERE episode=?').run(minutes,episode);
    }
    return true;
  }
  if(!r || r.status!=='active') throw new Error('run unavailable');
  if(!Number.isFinite(minutes) || minutes<0) {
    q('UPDATE runs SET status=? WHERE episode=? AND stage=?').run(r.uncapped && completed && minutes===null?'complete':'unknown',episode,stage);
    q('UPDATE budgets SET usage_unknown=1 WHERE episode=?').run(episode); return false;
  }
  q("UPDATE runs SET status='complete',minutes=? WHERE episode=? AND stage=?").run(minutes,episode,stage);
  q('UPDATE budgets SET used=used+? WHERE episode=?').run(minutes,episode); return true;
}
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
  recoverJira() { return transact(() => {
    q("UPDATE artifacts SET state='prestart_failed' WHERE kind='jira' AND state='claimed'").run();
    q("UPDATE artifacts SET state='unknown' WHERE kind='jira' AND state='dispatch_intent'").run(); return true;
  }); },
  jiraKnown({episode,fence,id,key}) { return transact(() => {
    const result=q("UPDATE artifacts SET state='known',remote_id=?,remote_key=? WHERE episode=? AND kind='jira' AND fence=? AND state IN ('dispatch_intent','unknown') AND remote_id IS NULL").run(id,key,episode,fence);
    if(result.changes!==1) throw new Error('stale Jira fence'); return art(episode,'jira');
  }); },
  releasePrestart({episode,kind,fence,stage,revision=null,taskId=null}) { return transact(() => {
    const run=q('SELECT * FROM runs WHERE episode=? AND stage=?').get(episode,stage);
    const a=art(episode,kind); if(!run || run.status!=='active' || !a || a.fence!==fence || a.state!=='dispatch_intent') throw new Error('unsafe prestart release');
    q("UPDATE artifacts SET state='prestart_failed' WHERE episode=? AND kind=? AND fence=? AND state='dispatch_intent'").run(episode,kind,fence);
    q('DELETE FROM runs WHERE episode=? AND stage=?').run(episode,stage);
    if(stage==='implementation') { const updated=q('UPDATE approvals SET consumed=0 WHERE episode=? AND revision=? AND task_id=? AND consumed=1').run(episode,revision,taskId); if(updated.changes!==1) throw new Error('approval mismatch'); }
    return true;
  }); },
  getCard({ts}) { const c=card(ts); if (!c) return null; const i=q('SELECT monitor, synthetic FROM incidents WHERE episode=?').get(c.episode); return {...c,...i}; },
  getArtifact({episode,kind}) { return art(episode,kind) || null; },
  setHandoff({episode,pr,head}) { q("INSERT INTO handoffs VALUES (?,?,?,'awaiting_native_verify') ON CONFLICT(episode) DO UPDATE SET pr=excluded.pr,head=excluded.head,status=excluded.status").run(episode,pr,head); return true; },
  invalidateHandoff({episode}) { q("UPDATE handoffs SET status='stale_exact_head' WHERE episode=?").run(episode); return true; },
  handoffs() { return q('SELECT * FROM handoffs').all(); },
  saveReview({episode,receipt}) { q('INSERT OR IGNORE INTO reviews VALUES (?,?)').run(episode,receipt); const row=q('SELECT receipt FROM reviews WHERE episode=?').get(episode); if(row.receipt!==receipt) throw new Error('review already recorded'); return true; },
  getReview({episode}) { return q('SELECT receipt FROM reviews WHERE episode=?').get(episode) || null; },
  completedPlans() { return q("SELECT a.episode,a.remote_id,b.revision FROM artifacts a JOIN budgets b ON b.episode=a.episode JOIN runs r ON r.episode=a.episode AND r.stage='plan' WHERE a.kind='task' AND a.state='confirmed' AND r.status='complete' AND (b.uncapped=1 OR b.usage_unknown=0)").all(); },
  getBudget({episode}) { return q('SELECT * FROM budgets WHERE episode=?').get(episode) || null; },
  initBudget({episode,revision,cap=null,uncapped=false}) { return transact(() => {
    if(typeof uncapped!=='boolean' || (uncapped ? cap!==null : !Number.isFinite(cap) || cap<=0)) throw new Error('invalid policy');
    q('INSERT OR IGNORE INTO grants(revision,episode,cap,uncapped) VALUES (?,?,?,?)').run(revision,episode,cap,Number(uncapped));
    const g=q('SELECT * FROM grants WHERE revision=?').get(revision);
    if(!g || g.episode!==episode || g.cap!==cap || g.uncapped!==Number(uncapped)) throw new Error('grant already bound');
    q('INSERT OR IGNORE INTO budgets(episode,revision,cap,uncapped) VALUES (?,?,?,?)').run(episode,revision,cap,Number(uncapped));
    const b=q('SELECT * FROM budgets WHERE episode=?').get(episode);
    if(b.revision!==revision || b.cap!==cap || b.uncapped!==Number(uncapped) || (!uncapped && (b.usage_unknown || b.used>=b.cap))) throw new Error('budget unavailable'); return b;
  }); },
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
    if (!existing) { q('INSERT INTO controls VALUES (?,?,?,?,?)').run(randomBytes(32).toString('hex'),episode,ts,taskId,revision); existing=q('SELECT * FROM controls WHERE episode=? AND ts=? AND task_id=? AND revision=?').get(episode,ts,taskId,revision); q('INSERT INTO outbox(episode,ts,status) VALUES (?,?,?)').run(episode,ts,`plan_ready https://app.coderabbit.ai/code/tasks/${taskId}`); }
    return existing;
  }); },
  controlForCard({ts}) { return q('SELECT * FROM controls WHERE ts=? ORDER BY rowid DESC LIMIT 1').get(ts) || null; },
  getControl({handle,ts}) { return q('SELECT * FROM controls WHERE handle=? AND ts=?').get(handle,ts) || null; },
  reserve({episode,stage,amount,deadline}) { return transact(() => {
    const b=q('SELECT * FROM budgets WHERE episode=?').get(episode);
    const active=q("SELECT COALESCE(SUM(reserved),0) AS total FROM runs WHERE episode=? AND status IN ('active','unknown')").get(episode).total;
    if (!b || (b.uncapped ? amount!==null || deadline!==null : b.usage_unknown || !Number.isFinite(amount) || amount<=0 || !Number.isSafeInteger(deadline) || b.used+active+amount>b.cap) || q('SELECT * FROM runs WHERE episode=? AND stage=?').get(episode,stage)) throw new Error('budget unavailable');
    q("INSERT INTO runs(episode,stage,reserved,deadline,status,uncapped) VALUES (?,?,?,?,'active',?)").run(episode,stage,amount,deadline,b.uncapped); return true;
  }); },
  recordPlan({episode,taskId,minutes}) { return transact(() => {
    const task=art(episode,'task'), run=q("SELECT * FROM runs WHERE episode=? AND stage='plan'").get(episode);
    if(!task || task.remote_id!==taskId || !run || (!Number.isFinite(minutes) || minutes<0) && !(run.uncapped && minutes===null)) throw new Error('invalid plan accounting');
    if(task.state==='confirmed' && run.status==='complete') {
      if(run.uncapped && run.minutes===null && Number.isFinite(minutes) && minutes>=0) {
        q("UPDATE runs SET minutes=? WHERE episode=? AND stage='plan' AND minutes IS NULL").run(minutes,episode);
        q('UPDATE budgets SET used=used+? WHERE episode=?').run(minutes,episode);
      }
      return task;
    }
    if(task.state!=='known' || run.status!=='active') throw new Error('plan accounting fenced');
    q("UPDATE runs SET status='complete',minutes=? WHERE episode=? AND stage='plan'").run(minutes,episode);
    if(minutes===null) q('UPDATE budgets SET usage_unknown=1 WHERE episode=?').run(episode);
    else q('UPDATE budgets SET used=used+? WHERE episode=?').run(minutes,episode);
    q("UPDATE artifacts SET state='confirmed' WHERE episode=? AND kind='task' AND fence=? AND state='known'").run(episode,task.fence);
    return art(episode,'task');
  }); },
  finishRun(args) { return transact(() => finishRun(args)); },
  recordImplementation({episode,revision,taskId,minutes}) { return transact(() => {
    const task=art(episode,'task'), kind=`resume-${revision}`, resume=art(episode,kind), budget=q('SELECT * FROM budgets WHERE episode=?').get(episode);
    if(task?.remote_id!==taskId || budget?.revision!==revision || !resume || !['dispatch_intent','known','confirmed'].includes(resume.state)) throw new Error('implementation fenced');
    finishRun({episode,stage:'implementation',minutes,completed:true});
    q("UPDATE artifacts SET state='confirmed',remote_id=? WHERE episode=? AND kind=? AND fence=?").run(taskId,episode,kind,resume.fence);
    return art(episode,kind);
  }); },
  ledger() { return {policies:q('SELECT * FROM budgets').all(),runs:q('SELECT * FROM runs').all()}; },
  activeRuns() { return q("SELECT * FROM runs WHERE status='active'").all(); },
  pendingStops() { return q("SELECT * FROM runs WHERE status='unknown'").all(); },
  stopped({episode,stage}) { q("UPDATE runs SET status='unknown_stopped' WHERE episode=? AND stage=? AND status='unknown'").run(episode,stage); return true; },
  artifacts() { return q('SELECT * FROM artifacts').all(); },
  cards() { return q('SELECT * FROM cards').all(); },
  enqueue({episode,ts,status}) { return Number(q('INSERT INTO outbox(episode,ts,status) VALUES (?,?,?)').run(episode,ts,status).lastInsertRowid); },
  pending() { return q('SELECT * FROM outbox WHERE delivered=0 ORDER BY id').all(); },
  delivered({id}) { q('UPDATE outbox SET delivered=1 WHERE ts=(SELECT ts FROM outbox WHERE id=?) AND id<=?').run(id,id); return true; },
  close() { db.close(); return true; }
};
parentPort.on('message', ({id,op,args}) => { try { if (!Object.hasOwn(operations,op)) throw new Error('unknown operation'); parentPort.postMessage({id,value:operations[op](args || {})}); } catch { parentPort.postMessage({id,error:'state operation failed'}); } });
