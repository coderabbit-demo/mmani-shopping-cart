import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { State } from '../src/state.mjs';
const run=promisify(execFile), fixture=new URL('./fixtures/cli.mjs',import.meta.url).pathname;
test('cross-process claims fence unknown outcomes across restart', {timeout:15000}, async()=>{
 const d=await mkdtemp(join(tmpdir(),'bridge-state-')), db=join(d,'state.sqlite'), episode='a'.repeat(64);
 const s=new State(d,{initialize:true});
 try {
  await s.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:'c',event:'e',test:true,actionable:true},ts:'1.1',digest:'d'});
  const results=await Promise.all(Array.from({length:4},()=>run(process.execPath,[fixture,'claim',d,episode])));
  const claims=results.map(x=>JSON.parse(x.stdout)); assert.equal(claims.filter(x=>x.acquired).length,1);
  const winner=claims.find(x=>x.acquired).artifact;
  await s.call('transition',{episode,kind:'jira',fence:winner.fence,from:'claimed',to:'dispatch_intent'});
  await s.close();
  const restart=new State(d);
  try { const again=await restart.call('claim',{episode,kind:'jira'}); assert.equal(again.acquired,false); assert.equal(again.artifact.state,'dispatch_intent'); await assert.rejects(restart.call('transition',{episode,kind:'jira',fence:winner.fence+1,from:'dispatch_intent',to:'unknown'})); } finally { await restart.close(); }
 } finally { await rm(d,{recursive:true,force:true}); }
});
test('initialized state refuses missing database and incompatible marker',async()=>{
 const {unlink,writeFile}=await import('node:fs/promises');
 const d=await mkdtemp(join(tmpdir(),'bridge-state-marker-')); const s=new State(d,{initialize:true});
 try { await s.call('pending'); await s.close(); await unlink(join(d,'state.sqlite')); assert.throws(()=>new State(d),/database missing/); await writeFile(join(d,'initialized'),'wrong\n'); assert.throws(()=>new State(d),/incompatible state marker/); }
 finally { await rm(d,{recursive:true,force:true}); }
});
test('deadline supervisor cancels at most once and fences unknown usage',async()=>{
 const {Supervisor,Tasks}=await import('../src/coderabbit.mjs');
 const d=await mkdtemp(join(tmpdir(),'bridge-watch-')), s=new State(d,{initialize:true}), episode='a'.repeat(64), id='11111111-1111-4111-8111-111111111111'; let cancels=0;
 try {
  await s.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:'c',event:'e',test:true,actionable:true},ts:'1.1',digest:'d'});
  await s.call('initBudget',{episode,revision:'b'.repeat(64),cap:3}); await s.call('reserve',{episode,stage:'plan',amount:1,deadline:Date.now()-1});
  const c=await s.call('claim',{episode,kind:'task'}); const ref={episode,kind:'task',fence:c.artifact.fence}; await s.call('transition',{...ref,from:'claimed',to:'dispatch_intent'}); await s.call('transition',{...ref,from:'dispatch_intent',to:'known',id});
  const adapter={async cancel(){cancels++;return 'cancel_pending'},async show(){return {turnStatus:cancels?'completed':'in_progress',cancellationPending:false}}};
  const tasks=new Tasks({state:s,adapter}); const sup=new Supervisor({state:s,tasks,adapter,slack:{async flush(){}}}); await sup.tick(); await sup.tick();
  assert.equal(cancels,1); assert.equal((await s.call('getBudget',{episode})).usage_unknown,1); assert.equal((await s.call('activeRuns')).length,0);
 } finally { await s.close(); await rm(d,{recursive:true,force:true}); }
});
test('one approval revision is atomically bound across two process episodes and restart',async()=>{
 const d=await mkdtemp(join(tmpdir(),'bridge-grant-')); const s=new State(d,{initialize:true});
 try {
  await s.call('pending');
  const results=await Promise.all(['a','b'].map(letter=>run(process.execPath,[fixture,'budget',d,letter.repeat(64)])));
  assert.equal(results.map(x=>JSON.parse(x.stdout)).filter(Boolean).length,1);
  await s.close(); const again=new State(d); try { const b=await again.call('getBudget',{episode:'b'.repeat(64)}); const losing=b?'a':'b'; await assert.rejects(again.call('initBudget',{episode:losing.repeat(64),revision:'c'.repeat(64),cap:5})); } finally {await again.close();}
 } finally {await rm(d,{recursive:true,force:true});}
});
test('new status supersedes only older statuses of the same card',async()=>{
 const d=await mkdtemp(join(tmpdir(),'bridge-outbox-')),s=new State(d,{initialize:true});
 try { const old=await s.call('enqueue',{episode:'a',ts:'1.1',status:'old'}); const other=await s.call('enqueue',{episode:'b',ts:'2.2',status:'other'}); const newer=await s.call('enqueue',{episode:'a',ts:'1.1',status:'new'}); await s.call('delivered',{id:newer}); assert.deepEqual((await s.call('pending')).map(x=>x.id),[other]); assert.ok(old<newer); } finally {await s.close();await rm(d,{recursive:true,force:true});}
});
test('completed plan recovers control after temporary failure without charging usage twice',async()=>{
 const {Tasks,Supervisor}=await import('../src/coderabbit.mjs'); const {approvalRevision}=await import('../src/config.mjs'); const {createHash}=await import('node:crypto');
 const d=await mkdtemp(join(tmpdir(),'bridge-plan-recover-')),s=new State(d,{initialize:true}),episode='a'.repeat(64),id='11111111-1111-4111-8111-111111111111'; const now=Date.now();
 const grant={objective:'Fix fixture',brief:'Fix fixture',briefHash:createHash('sha256').update('Fix fixture').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/fix',commit:'b'.repeat(40),base:'c'.repeat(40),owner:'U123',allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-10,endsAt:now+60000}; grant.revision=approvalRevision(grant); let unavailable=true;
 try {await s.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:'c',event:'e',test:true,actionable:true},ts:'1.1',digest:'d'}); await s.call('initBudget',{episode,revision:grant.revision,cap:5}); await s.call('reserve',{episode,stage:'plan',amount:1,deadline:now+60000}); const a=await s.call('claim',{episode,kind:'task'}); const ref={episode,kind:'task',fence:a.artifact.fence};await s.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});await s.call('transition',{...ref,from:'dispatch_intent',to:'known',id});
 const tasks=new Tasks({state:s,approval:async()=>{if(unavailable)throw new Error('temporarily absent');return grant;}});await tasks.recordPlan(episode,id,0.5); const supervisor=new Supervisor({state:s,tasks,adapter:{},slack:{async flush(){}}}); await supervisor.tick(); assert.equal(await s.call('controlForCard',{ts:'1.1'}),null); unavailable=false;await supervisor.tick();assert.equal((await s.call('controlForCard',{ts:'1.1'})).task_id,id);await supervisor.tick();assert.equal((await s.call('getBudget',{episode})).used,0.5);assert.equal((await s.call('pending')).length,1);
 } finally {await s.close();await rm(d,{recursive:true,force:true});}
});
test('Jira crash recovery fences stale claims and retains late successful identities',async()=>{
 const d=await mkdtemp(join(tmpdir(),'bridge-jira-recover-')),s=new State(d,{initialize:true});
 try {for(const [n,cycle] of [['a','a'],['b','b']]) await s.call('bootstrap',{incident:{episode:n.repeat(64),monitor:'29524154',cycle,event:cycle,test:true,actionable:true},ts:cycle,digest:cycle});
 const a=await s.call('claim',{episode:'a'.repeat(64),kind:'jira'}),b=await s.call('claim',{episode:'b'.repeat(64),kind:'jira'});const ar={episode:'a'.repeat(64),kind:'jira',fence:a.artifact.fence},br={episode:'b'.repeat(64),kind:'jira',fence:b.artifact.fence};await s.call('transition',{...br,from:'claimed',to:'dispatch_intent'});await s.call('recoverJira');assert.equal((await s.call('getArtifact',{episode:ar.episode,kind:'jira'})).state,'prestart_failed');await assert.rejects(s.call('transition',{...ar,from:'claimed',to:'dispatch_intent'}));assert.equal((await s.call('claim',{episode:ar.episode,kind:'jira'})).acquired,true);assert.equal((await s.call('claim',{episode:br.episode,kind:'jira'})).acquired,false);assert.equal((await s.call('jiraKnown',{...br,id:'11486',key:'SC-38'})).state,'known');await s.close();const restart=new State(d);try {assert.equal((await restart.call('getArtifact',{episode:br.episode,kind:'jira'})).remote_key,'SC-38');}finally{await restart.close();}
 } finally {await rm(d,{recursive:true,force:true});}
});
test('overdue known task is cancelled once even if approval is unreadable or changed',async()=>{
 const {Supervisor,Tasks}=await import('../src/coderabbit.mjs');
 for(const approval of [async()=>{throw new Error('missing')},async()=>({revision:'changed'}),async()=>({revision:'expired',endsAt:0})]) {
  const d=await mkdtemp(join(tmpdir(),'bridge-expired-')),s=new State(d,{initialize:true}),episode='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';let cancels=0;
  try {await s.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:'c',event:'e',test:true,actionable:true},ts:'1.1',digest:'d'});await s.call('initBudget',{episode,revision:'b'.repeat(64),cap:3});await s.call('reserve',{episode,stage:'plan',amount:1,deadline:Date.now()-1});const a=await s.call('claim',{episode,kind:'task'}),ref={episode,kind:'task',fence:a.artifact.fence};await s.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});await s.call('transition',{...ref,from:'dispatch_intent',to:'known',id});const adapter={async show(){return {turnStatus:'in_progress',cancellationPending:false}},async cancel(){cancels++;return 'cancel_pending'}};const tasks=new Tasks({state:s,adapter,approval}),sup=new Supervisor({state:s,tasks,adapter,slack:{async flush(){}}});await sup.tick();await sup.tick();assert.equal(cancels,1);assert.equal((await s.call('getBudget',{episode})).usage_unknown,1);}finally{await s.close();await rm(d,{recursive:true,force:true});}
 }
});
