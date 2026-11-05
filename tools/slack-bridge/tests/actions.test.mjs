import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { State } from '../src/state.mjs';
import { Actions } from '../src/actions.mjs';
import { approvalRevision } from '../src/config.mjs';
import { incident,config,envelope } from './fixtures/cli.mjs';
async function context(fn) {
 const d=await mkdtemp(join(tmpdir(),'bridge-actions-')), state=new State(d,{initialize:true});
 let creates=0, bound, statuses=[], result={kind:'known',id:'11486',key:'SC-38'}, failRead=false;
 const jira={async metadata(){},async lookup(){return null},async create(){ creates++; await new Promise(r=>setTimeout(r,50)); return result; },async get(){ if (failRead) throw new Error('offline'); return {id:'11486',key:'SC-38'}; }};
 const slack={async bind(message,card){bound=card},async status(ts,status){statuses.push(status)}};
 const actions=new Actions({state,config:config(),monitor:async()=>true,jira,slack});
 try { await fn({state,actions,get creates(){return creates},get bound(){return bound},statuses,setResult:x=>result=x,setFailRead:x=>failRead=x}); } finally { await state.close(); await rm(d,{recursive:true,force:true}); }
}
test('callbacks acknowledge promptly and share one durable Jira', {timeout:10000},async()=>context(async c=>{
 const raw=JSON.stringify(incident()), first=envelope(raw), second=envelope(raw,'mmani_debug_pr'); let acked=0;
 const p1=c.actions.receive(first,async()=>{acked++}), p2=c.actions.receive(second,async()=>{acked++});
 assert.equal(acked,2); await Promise.all([p1,p2]);
 assert.equal(c.creates,1); const artifact=await c.state.call('getArtifact',{episode:c.bound.episode,kind:'jira'}); assert.equal(artifact.state,'confirmed');
 const normalized=envelope(c.bound.jira_handle); normalized.message.blocks[0].elements[1].value=c.bound.debug_handle;
 assert.equal((await c.actions.receive(normalized,async()=>{})).status,'jira_confirmed'); assert.equal(c.creates,1);
}));
test('unknown create stays fenced and known identity only retries readback',async()=>context(async c=>{
 c.setResult({kind:'unknown'}); const raw=JSON.stringify(incident());
 assert.equal((await c.actions.receive(envelope(raw),async()=>{})).status,'unknown');
 await c.actions.receive(envelope(raw),async()=>{}); assert.equal(c.creates,1);
}));
test('failed readback retains known identity and never creates twice',async()=>context(async c=>{
 c.setFailRead(true); const raw=JSON.stringify(incident());
 assert.equal((await c.actions.receive(envelope(raw),async()=>{})).status,'known'); c.setFailRead(false);
 assert.equal((await c.actions.receive(envelope(raw),async()=>{})).status,'jira_confirmed'); assert.equal(c.creates,1);
}));
test('rejects foreign actor, missing cycle and recovery without creating an artifact',async()=>context(async c=>{
 const foreign=envelope(JSON.stringify(incident())); foreign.user.id='U999'; assert.equal((await c.actions.receive(foreign,async()=>{})).status,'blocked');
 assert.equal((await c.actions.receive(envelope(JSON.stringify(incident({cycle:''}))),async()=>{})).status,'blocked');
 assert.equal((await c.actions.receive(envelope(JSON.stringify(incident({transition:'Recovered'}))),async()=>{})).status,'non_actionable'); assert.equal(c.creates,0);
}));
test('acknowledgement is sent before blocked state completes',async()=>{
 let release, acknowledged=false; const blocked=new Promise(resolve=>release=resolve);
 const actions=new Actions({state:{call:async()=>blocked},config:config(),monitor:async()=>true,slack:{},jira:{}});
 const pending=actions.receive(envelope(JSON.stringify(incident())),async()=>{acknowledged=true});
 await new Promise(resolve=>setTimeout(resolve,20)); assert.equal(acknowledged,true); release(null); await pending;
});
test('failed status delivery does not reopen the Jira claim',async()=>context(async c=>{
 c.actions.slack.status=async()=>{throw new Error('unavailable')}; const raw=JSON.stringify(incident());
 await c.actions.receive(envelope(raw),async()=>{}); await c.actions.receive(envelope(raw),async()=>{});
 assert.equal(c.creates,1); assert.equal((await c.state.call('pending')).length,2);
}));
test('unknown handles and changed bootstrap are rejected',async()=>context(async c=>{
 const raw=JSON.stringify(incident()); await c.actions.receive(envelope(raw),async()=>{});
 const changed=JSON.stringify(incident({event:'different'})); assert.equal((await c.actions.receive(envelope(changed),async()=>{})).status,'blocked');
 assert.equal((await c.actions.receive(envelope('f'.repeat(64)),async()=>{})).status,'blocked'); assert.equal(c.creates,1);
}));
test('expired action window blocks all side effects',async()=>context(async c=>{
 c.actions.config.actionEnd=Date.now()-1; assert.equal((await c.actions.receive(envelope(JSON.stringify(incident())),async()=>{})).status,'blocked'); assert.equal(c.creates,0); assert.equal(c.bound,undefined);
}));
test('task approval binds stored task and null usage blocks continuation',async()=>context(async c=>{
 const {Tasks}=await import('../src/coderabbit.mjs'); const now=Date.now(), id='11111111-1111-4111-8111-111111111111';
 const grant={repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',commit:'a'.repeat(40),base:'b'.repeat(40),branch:'codex/test',owner:'U123',revision:'c'.repeat(64),allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-1000,endsAt:now+60000}; let resumes=0; grant.revision=approvalRevision(grant);
 const t=new Tasks({state:c.state,approval:async()=>grant,source:async()=>true,adapter:{async create(p,save){await save(id); return {kind:'complete'}},async resume(){resumes++;return {kind:'complete',minutes:1}}}});
 const result=await c.actions.receive(envelope(JSON.stringify(incident())),async()=>{}); assert.equal(result.status,'jira_confirmed');
 assert.equal(await t.start(c.bound,'U123'),'plan_submitted'); await t.recordPlan(c.bound.episode,id,null);
 await assert.rejects(t.approveAndResume({episode:c.bound.episode,taskId:id,revision:grant.revision,actor:'U123'})); assert.equal(resumes,0);
}));
test('exact-head handoff refuses stale gates',async()=>{
 const {verifyHandoff}=await import('../src/coderabbit.mjs'); const head='d'.repeat(40);
 const x={pr:'https://github.com/coderabbit-demo/mmani-shopping-cart/pull/123',head,reviewHead:head,ciHead:head,securityHead:head,reviewPassed:true,ciPassed:true,securityPassed:true};
 assert.equal(verifyHandoff(x).status,'awaiting_native_verify'); assert.throws(()=>verifyHandoff({...x,ciHead:'e'.repeat(40)}));
});
test('Jira pre-spawn failure retries safely',async()=>context(async c=>{
 c.setResult({kind:'prestart'}); const raw=JSON.stringify(incident());
 assert.equal((await c.actions.receive(envelope(raw),async()=>{})).status,'prestart_failed'); c.setResult({kind:'known',id:'11486',key:'SC-38'});
 assert.equal((await c.actions.receive(envelope(raw),async()=>{})).status,'jira_confirmed'); assert.equal(c.creates,2);
}));
test('unknown Jira reconciles only with verified identity without recreating',async()=>context(async c=>{
 c.setResult({kind:'unknown'}); const raw=JSON.stringify(incident()); await c.actions.receive(envelope(raw),async()=>{});
 const normalized=envelope(c.bound.jira_handle); normalized.message.blocks[0].elements[1].value=c.bound.debug_handle;
 c.setFailRead(true); await assert.rejects(c.actions.reconcileJira(normalized,'11486','SC-38')); c.setFailRead(false);
 const resolved=await c.actions.reconcileJira(normalized,'11486','SC-38'); assert.equal(resolved.state,'confirmed'); assert.equal(c.creates,1);
}));
test('continuation requires completed plan, exact task, actor and revision and is one-shot',async()=>context(async c=>{
 const {Tasks}=await import('../src/coderabbit.mjs'); const now=Date.now(), id='11111111-1111-4111-8111-111111111111';
 const grant={repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',commit:'a'.repeat(40),base:'b'.repeat(40),branch:'codex/test',owner:'U123',allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-1000,endsAt:now+60000}; grant.revision=approvalRevision(grant); let resumes=0;
 const t=new Tasks({state:c.state,approval:async()=>grant,source:async()=>true,adapter:{async create(p,save){await save(id);return {kind:'complete'}},async resume(){resumes++;return {kind:'complete',minutes:1}}}});
 await c.actions.receive(envelope(JSON.stringify(incident())),async()=>{}); await t.start(c.bound,'U123');
 const approve={episode:c.bound.episode,taskId:id,revision:grant.revision,actor:'U123'};
 await assert.rejects(t.approveAndResume(approve)); await t.recordPlan(c.bound.episode,id,0.25);
 await assert.rejects(t.approveAndResume({...approve,actor:'U999'})); await assert.rejects(t.approveAndResume({...approve,taskId:'22222222-2222-4222-8222-222222222222'}));
 assert.equal(await t.approveAndResume(approve),'implementation_complete'); await assert.rejects(t.approveAndResume(approve)); assert.equal(resumes,1);
}));
test('same event with changed data on another card is rejected',async()=>context(async c=>{
 const data=incident(); await c.actions.receive(envelope(JSON.stringify(data)),async()=>{});
 const changed=envelope(JSON.stringify({...data,alertTitle:'[TEST] changed'}),'mmani_create_jira','1234567891.123456');
 assert.equal((await c.actions.receive(changed,async()=>{})).status,'blocked'); assert.equal(c.creates,1);
}));
test('foreign app, team, channel and bot are rejected before provider checks',async()=>context(async c=>{
 let monitors=0; c.actions.monitor=async()=>{monitors++}; const raw=JSON.stringify(incident());
 for (const change of [b=>b.api_app_id='A999',b=>b.team.id='T999',b=>b.channel.id='C999',b=>b.container.channel_id='C999',b=>b.message.bot_id='B999',b=>b.container.message_ts='999.9']) {
  const body=envelope(raw); change(body); assert.equal((await c.actions.receive(body,async()=>{})).status,'blocked');
 }
 assert.equal(monitors,0); assert.equal(c.creates,0);
}));
test('ownership failure prevents binding and artifact creation',async()=>context(async c=>{
 c.actions.monitor=async()=>{throw new Error('ownership mismatch')};
 assert.equal((await c.actions.receive(envelope(JSON.stringify(incident())),async()=>{})).status,'blocked'); assert.equal(c.bound,undefined); assert.equal(c.creates,0);
}));
