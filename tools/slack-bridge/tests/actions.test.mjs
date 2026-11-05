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
 const grant={objective:'Repair the approved fixture defect',brief:'Fix lib/fixture.ts only; preserve all assertions.',briefHash:'91c6ef',repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',commit:'a'.repeat(40),base:'b'.repeat(40),branch:'codex/test',owner:'U123',revision:'c'.repeat(64),allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-1000,endsAt:now+60000}; let resumes=0; grant.briefHash=(await import('node:crypto')).createHash('sha256').update(grant.brief).digest('hex'); grant.revision=approvalRevision(grant);
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
 const grant={objective:'Repair the approved fixture defect',brief:'Fix lib/fixture.ts only; preserve all assertions.',briefHash:'91c6ef',repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',commit:'a'.repeat(40),base:'b'.repeat(40),branch:'codex/test',owner:'U123',allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-1000,endsAt:now+60000}; grant.briefHash=(await import('node:crypto')).createHash('sha256').update(grant.brief).digest('hex'); grant.revision=approvalRevision(grant); let resumes=0;
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
test('live plan usage wins over historical null and is committed exactly once',async()=>context(async c=>{
 const {Tasks,Supervisor,CodeRabbitAdapter}=await import('../src/coderabbit.mjs'); const {createHash}=await import('node:crypto');
 const id='11111111-1111-4111-8111-111111111111',now=Date.now(),grant={objective:'Fix fixture',brief:'Fix fixture',briefHash:createHash('sha256').update('Fix fixture').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/test',commit:'a'.repeat(40),base:'b'.repeat(40),owner:'U123',allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-1,endsAt:now+60000};grant.revision=approvalRevision(grant);
 await c.actions.receive(envelope(JSON.stringify(incident())),async()=>{});
 let release,submitted,creates=0,observations=0;const waiting=new Promise(r=>release=r),saved=new Promise(r=>submitted=r);
 const adapter=new CodeRabbitAdapter(async(args,o)=>{
  if(args[1]==='new') {creates++;assert.ok(args.includes('--resume'));await o.onLine(JSON.stringify({status:'task_submitted',taskId:id}));submitted();await waiting;await o.onLine(JSON.stringify({type:'complete',status:'turn_completed',turn:{outcome:'completed'},agentMinutes:0.5}));return {kind:'ok',stdout:''};}
  if(args[1]==='show')return {kind:'ok',stdout:JSON.stringify({type:'complete',status:'task_shown',task:{taskId:id,repository:{provider:'github',repoId:'1437431331',name:'mmani-shopping-cart'},branchName:'codex/test',baseBranchName:'codex/test',turnStatus:'completed',patchStatus:'none',result:null,cancellationPending:false}})};
  observations++;return {kind:'ok',stdout:JSON.stringify({type:'complete',status:'turn_completed',taskId:id,turn:{outcome:'completed'},agentMinutes:null})};
 });
 const tasks=new Tasks({state:c.state,approval:async()=>grant,source:async()=>true,adapter}),sup=new Supervisor({state:c.state,tasks,adapter,slack:{async flush(){}}});
 const start=tasks.start(c.bound,'U123');await saved;await sup.tick();assert.equal(observations,0);assert.equal((await c.state.call('getBudget',{episode:c.bound.episode})).used,0);release();assert.equal(await start,'plan_submitted');await sup.tick();await tasks.recordPlan(c.bound.episode,id,0.5);assert.equal((await c.state.call('getBudget',{episode:c.bound.episode})).used,0.5);assert.equal((await c.state.call('getBudget',{episode:c.bound.episode})).usage_unknown,0);assert.ok(await c.state.call('controlForCard',{ts:c.bound.ts}));assert.equal(creates,1);
 // A restarted observer sees only historical null and cannot invent usage or a fresh task.
 const other=await c.state.call('bootstrap',{incident:{episode:'e'.repeat(64),monitor:'29524154',cycle:'lost',event:'lost',test:true,actionable:true},ts:'2.2',digest:'lost'});const revision='f'.repeat(64);await c.state.call('initBudget',{episode:other.episode,revision,cap:5});await c.state.call('reserve',{episode:other.episode,stage:'plan',amount:1,deadline:now+60000});const claim=await c.state.call('claim',{episode:other.episode,kind:'task'}),ref={episode:other.episode,kind:'task',fence:claim.artifact.fence};await c.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});await c.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id});
 const restarted=new Tasks({state:c.state,adapter});const observer=new Supervisor({state:c.state,tasks:restarted,adapter,slack:{async flush(){}}});await observer.tick();assert.equal((await c.state.call('getBudget',{episode:other.episode})).used,0);assert.equal((await c.state.call('getArtifact',{episode:other.episode,kind:'task'})).state,'known');assert.equal(await c.state.call('controlForCard',{ts:'2.2'}),null);assert.equal(creates,1);
}));
test('invalid Jira grant is rejected before reservation and corrected grant can start',async()=>context(async c=>{
 const {Tasks}=await import('../src/coderabbit.mjs'); const {createHash}=await import('node:crypto');const now=Date.now();
 const g={objective:'Fix',brief:'Fix',briefHash:createHash('sha256').update('Fix').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/test',commit:'a'.repeat(40),base:'b'.repeat(40),owner:'U123',allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-10,endsAt:now+60000,issueUrl:'https://coderabbit-demo.atlassian.net/browse/SC-99'};g.revision=approvalRevision(g);
 let calls=0;const t=new Tasks({state:c.state,approval:async()=>g,source:async()=>true,adapter:{async create(p,save){calls++;await save('11111111-1111-4111-8111-111111111111');return {kind:'submitted'}}}});
 await c.actions.receive(envelope(JSON.stringify(incident())),async()=>{});assert.equal(await t.start(c.bound,'U123'),'approval_required');assert.equal(await c.state.call('getBudget',{episode:c.bound.episode}),null);assert.equal(await c.state.call('getArtifact',{episode:c.bound.episode,kind:'task'}),null);
 for(const issueUrl of ['https://invalid.example/browse/SC-38','https://github.com/coderabbit-demo/mmani-shopping-cart/issues/10']) { g.issueUrl=issueUrl; g.revision=approvalRevision(g); assert.equal(await t.start(c.bound,'U123'),'approval_required'); assert.equal(await c.state.call('getBudget',{episode:c.bound.episode}),null); }
 g.issueUrl='https://coderabbit-demo.atlassian.net/browse/SC-38';g.revision=approvalRevision(g);assert.equal(await t.start(c.bound,'U123'),'plan_submitted');assert.equal(calls,1);
}));
test('proven prestart task and continuation retry, unknown continuation remains fenced',async()=>context(async c=>{
 const {Tasks}=await import('../src/coderabbit.mjs');const {createHash}=await import('node:crypto');const now=Date.now(),id='11111111-1111-4111-8111-111111111111';
 const g={objective:'Fix',brief:'Fix',briefHash:createHash('sha256').update('Fix').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/test',commit:'a'.repeat(40),base:'b'.repeat(40),owner:'U123',allowedFiles:['lib/a.ts'],minutes:9,maxTasks:1,startsAt:now-10,endsAt:now+60000};g.revision=approvalRevision(g);let starts=0,resumes=0;
 const t=new Tasks({state:c.state,approval:async()=>g,source:async()=>true,adapter:{async create(p,save){if(++starts===1)return {kind:'prestart'};await save(id);return {kind:'submitted'}},async resume(){return ++resumes===1?{kind:'prestart'}:{kind:'unknown'}},async cancel(){}}});
 await c.actions.receive(envelope(JSON.stringify(incident())),async()=>{});assert.equal(await t.start(c.bound,'U123'),'prestart_failed');assert.equal(await t.start(c.bound,'U123'),'plan_submitted');await t.recordPlan(c.bound.episode,id,0.5);const approval={episode:c.bound.episode,taskId:id,revision:g.revision,actor:'U123'};assert.equal(await t.approveAndResume(approval),'prestart_failed');assert.equal(await t.approveAndResume(approval),'unknown');await assert.rejects(t.approveAndResume(approval));assert.equal(resumes,2);
}));

test('uncapped verified null usage progresses only through one human approval; unknown work never replays',async()=>{
 const {Tasks,Supervisor}=await import('../src/coderabbit.mjs');const {createHash}=await import('node:crypto');
 const d=await mkdtemp(join(tmpdir(),'bridge-uncapped-task-'));let state=new State(d,{initialize:true});const episode='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';let news=0,resumes=0,cancels=0,detached=false;
 const grant={objective:'Fix fixture',brief:'Fix fixture',briefHash:createHash('sha256').update('Fix fixture').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/fix',commit:'b'.repeat(40),base:'c'.repeat(40),owner:'U123',allowedFiles:['lib/a.ts'],uncapped:true,maxTasks:1};grant.revision=approvalRevision(grant);
 const adapter={async create(prompt,submitted,timeout,complete){news++;assert.equal(timeout,540000);await submitted(id);if(!detached)await complete({agentMinutes:null});return {kind:'unknown'};},async show(){return {branchName:grant.branch,baseBranchName:grant.branch,turnStatus:'completed',patchStatus:'none',result:null,cancellationPending:false}},async observe(){return {minutes:null}},async resume(){resumes++;return {kind:'complete',minutes:null}},async cancel(){cancels++;}};
 try {
  await state.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:'c',event:'e',test:true,actionable:true},ts:'1.1',digest:'d'});let claim=await state.call('claim',{episode,kind:'jira'});await state.call('transition',{episode,kind:'jira',fence:claim.artifact.fence,from:'claimed',to:'known',id:'1',key:'SC-38'});await state.call('transition',{episode,kind:'jira',fence:claim.artifact.fence,from:'known',to:'confirmed'});
  let tasks=new Tasks({state,adapter,approval:async()=>grant,source:async()=>true});const card=await state.call('getCard',{ts:'1.1'});assert.equal(await tasks.start(card,'U123'),'plan_submitted');assert.equal((await state.call('getArtifact',{episode,kind:'task'})).state,'confirmed');await tasks.planControl(card,id);
  assert.equal(await tasks.approveAndResume({episode,taskId:id,revision:grant.revision,actor:'U123'}),'implementation_complete');await assert.rejects(tasks.approveAndResume({episode,taskId:id,revision:grant.revision,actor:'U123'}));assert.equal(resumes,1);assert.equal(news,1);assert.equal(cancels,0);assert.equal((await state.call('getBudget',{episode})).usage_unknown,1);assert.equal((await state.call('ledger')).runs.find(r=>r.stage==='implementation').status,'complete');
  await state.close();state=new State(d);tasks=new Tasks({state,adapter,approval:async()=>grant,source:async()=>true});assert.equal(await tasks.start(card,'U123'),'confirmed');assert.equal(news,1);
 }finally{await state.close();await rm(d,{recursive:true,force:true});}
});

test('uncapped detached plan recovers known completion read-only and fences unknown implementation',async()=>{
 const {Tasks,Supervisor}=await import('../src/coderabbit.mjs');const {createHash}=await import('node:crypto');const d=await mkdtemp(join(tmpdir(),'bridge-uncapped-detach-'));let state=new State(d,{initialize:true});const episode='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';let sends=0,news=0,cancels=0,observes=0;
 const grant={objective:'Fix',brief:'Fix',briefHash:createHash('sha256').update('Fix').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/fix',commit:'b'.repeat(40),base:'c'.repeat(40),owner:'U123',allowedFiles:['lib/a.ts'],uncapped:true,maxTasks:1};grant.revision=approvalRevision(grant);
 const adapter={async create(p,submitted){news++;await submitted(id);return {kind:'unknown'}},async show(){return {branchName:grant.branch,baseBranchName:grant.branch,turnStatus:'completed',cancellationPending:false,patchStatus:'none',result:null}},async observe(){observes++;return {minutes:null}},async resume(){sends++;return {kind:'unknown'}},async cancel(){cancels++;}};
 try {
  await state.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:'c',event:'e',test:true,actionable:true},ts:'1.1',digest:'d'});const a=await state.call('claim',{episode,kind:'jira'}),ref={episode,kind:'jira',fence:a.artifact.fence};await state.call('transition',{...ref,from:'claimed',to:'known',id:'1',key:'SC-38'});await state.call('transition',{...ref,from:'known',to:'confirmed'});let tasks=new Tasks({state,adapter,approval:async()=>grant,source:async()=>true});const card=await state.call('getCard',{ts:'1.1'});await tasks.start(card,'U123');assert.equal((await state.call('getArtifact',{episode,kind:'task'})).state,'known');await state.close();state=new State(d);tasks=new Tasks({state,adapter,approval:async()=>grant,source:async()=>true});const sup=new Supervisor({state,tasks,adapter,slack:{async flush(){}}});await sup.tick();assert.equal((await state.call('controlForCard',{ts:'1.1'})).task_id,id);assert.equal(observes,1);
  assert.equal(await tasks.approveAndResume({episode,taskId:id,revision:grant.revision,actor:'U123'}),'unknown');await assert.rejects(tasks.approveAndResume({episode,taskId:id,revision:grant.revision,actor:'U123'}));await sup.tick();assert.equal(sends,1);assert.equal(news,1);assert.equal(cancels,0);assert.equal((await state.call('getArtifact',{episode,kind:`resume-${grant.revision}`})).state,'unknown');
 }finally{await state.close();await rm(d,{recursive:true,force:true});}
});
