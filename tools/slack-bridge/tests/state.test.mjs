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
  const adapter={async cancel(){cancels++;return 'cancel_pending'},async show(){return {turnStatus:'completed',cancellationPending:false}}};
  const tasks=new Tasks({state:s,adapter}); const sup=new Supervisor({state:s,tasks,adapter,slack:{async flush(){}}}); await sup.tick(); await sup.tick();
  assert.equal(cancels,1); assert.equal((await s.call('getBudget',{episode})).usage_unknown,1); assert.equal((await s.call('activeRuns')).length,0);
 } finally { await s.close(); await rm(d,{recursive:true,force:true}); }
});
