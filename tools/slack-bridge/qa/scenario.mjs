import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { State } from '../src/state.mjs';
import { Actions } from '../src/actions.mjs';
import { approvalRevision } from '../src/config.mjs';
import { Tasks,verifyHandoff } from '../src/coderabbit.mjs';
import { Jira } from '../src/jira.mjs';
import { config,envelope,incident } from '../tests/fixtures/cli.mjs';
const root=await mkdtemp(join(tmpdir(),'deskdrop-bridge-qa-'));
const state=new State(root,{initialize:true});
try {
 const count={jira:0,task:0,resume:0}, taskId='11111111-1111-4111-8111-111111111111', now=Date.now();
 let card, marker;
 const grant={repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',commit:'a'.repeat(40),base:'b'.repeat(40),branch:'codex/offline-fixture',owner:'U123',revision:'c'.repeat(64),allowedFiles:['lib/fixture.ts'],minutes:5,maxTasks:1,startsAt:now-1000,endsAt:now+60000};
 grant.revision=approvalRevision(grant);
 const invoke=async args=>{
  const response=(command,data,meta={})=>({kind:'ok',stdout:JSON.stringify({apiVersion:'v2',command,data,meta})});
  if(args.includes('create-metadata')) return response('jira.workitem.field.create-metadata',{fields:[]});
  if(args.includes('query')) return response('jira.workitem.query',{issues:[]});
  if(args.includes('create')) { count.jira++; marker=args[args.indexOf('--labels')+1]; return response('jira.workitem.create',{success:true,issue:{id:'11486',key:'SC-38'}}); }
  if(args.includes('get')) return response('jira.workitem.get',[{id:'11486',key:'SC-38',summary:'synthetic',status:{name:'Open'},project:{id:'10107',key:'SC'},issuetype:{id:'10047',name:'Bug'},labels:[marker]}],{acquisition:{requested:1,returned:1,succeeded:1,failed:0,omitted:0,truncated:0},evidence:{coverage:{status:'complete'},truncation:{truncated:false}}});
  throw new Error('unexpected fixture operation');
 };
 const task=new Tasks({state,approval:async()=>grant,source:async()=>true,adapter:{async create(prompt,submitted){ count.task++; assert.match(prompt,/plan only/); await submitted(taskId); return {kind:'complete'}; },async resume(id){assert.equal(id,taskId);count.resume++;return {kind:'complete',minutes:0.5};}}});
 const actions=new Actions({state,config:config(),monitor:async()=>true,jira:new Jira(invoke),task,slack:{async bind(message,c){card=c},async status(){}}});
 const payload=JSON.stringify(incident()); let acknowledgements=0;
 assert.equal((await actions.receive(envelope(payload),async()=>{acknowledgements++})).status,'jira_confirmed');
 const second=envelope(card.debug_handle,'mmani_debug_pr'); second.message.blocks[0].elements[0].value=card.jira_handle;
 assert.equal((await actions.receive(second,async()=>{acknowledgements++})).status,'plan_submitted');
 await task.recordPlan(card.episode,taskId,0.25);
 assert.equal(await task.approveAndResume({episode:card.episode,taskId,revision:grant.revision,actor:'U123'}),'implementation_complete');
 const head='d'.repeat(40), handoff=verifyHandoff({pr:'https://github.com/coderabbit-demo/mmani-shopping-cart/pull/123',head,reviewHead:head,ciHead:head,securityHead:head,reviewPassed:true,ciPassed:true,securityPassed:true});
 assert.deepEqual(count,{jira:1,task:1,resume:1}); assert.equal(acknowledgements,2); assert.equal(handoff.status,'awaiting_native_verify');
 console.log(JSON.stringify({scenario:'offline_fixture',result:'pass',acknowledgements,counts:count,handoff:handoff.status,external:'fake',limitations:'No live Slack, Jira, CodeRabbit, PR or native Verify was performed.'}));
} finally { await state.close(); await rm(root,{recursive:true,force:true}); }
