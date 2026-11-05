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
