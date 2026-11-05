import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { run } from '../src/process.mjs';
import { Jira } from '../src/jira.mjs';
const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url));
test('spawn uses fixed argument array and minimal environment',async()=>{
 const marker='$(touch /tmp/never-bridge-injection)';
 const r=await run(process.execPath,[fixture,'args',marker],{cwd:process.cwd()}); assert.equal(r.kind,'ok');
 const result=JSON.parse(r.stdout); assert.deepEqual(result.args,[marker]); assert.deepEqual(result.envKeys,process.platform==='darwin'?['HOME','LANG','PATH','__CF_USER_TEXT_ENCODING']:['HOME','LANG','PATH']); assert.equal(result.envKeys.includes('SLACK_BOT_TOKEN'),false); assert.equal(result.envKeys.includes('BRIDGE_SENTINEL'),false);
});
test('Jira create accepts only native shape and readback validates identity',async()=>{
 const marker='deskdrop-bridge-'+'a'.repeat(64), calls=[];
 const invoke=async args=>{calls.push(args); if(args.includes('create')) return {kind:'ok',stdout:JSON.stringify({apiVersion:'v2',command:'jira.workitem.create',data:{success:true,issue:{id:'11486',key:'SC-38'}}})}; return {kind:'ok',stdout:JSON.stringify({apiVersion:'v2',command:'jira.workitem.get',data:[{id:'11486',key:'SC-38',summary:'alert',status:{name:'Open'},project:{id:'10107',key:'SC'},issuetype:{id:'10047',name:'Bug'},labels:[marker]}],meta:{acquisition:{requested:1,returned:1,succeeded:1,failed:0,omitted:0,truncated:0},evidence:{coverage:{status:'complete'},truncation:{truncated:false}}}})}; };
 const j=new Jira(invoke), created=await j.create({episode:'a'.repeat(64),monitor:'29524154',synthetic:true}); assert.deepEqual(created,{kind:'known',id:'11486',key:'SC-38'});
 assert.equal((await j.get(created.key,created.id,marker)).key,'SC-38'); assert.ok(calls[0].includes('--description-format'));
 const bad=new Jira(async()=>({kind:'ok',stdout:JSON.stringify({apiVersion:'v2',command:'jira.workitem.create',data:{success:true,key:'SC-38'}})})); assert.equal((await bad.create({episode:'a'.repeat(64),monitor:'29524154'})).kind,'unknown');
});
test('spawn timeout is ambiguous; missing executable is proven prestart',async()=>{
 assert.equal((await run('/no-such-deskdrop-executable',[],{cwd:process.cwd()})).kind,'prestart');
 assert.equal((await run(process.execPath,[fixture,'hang'],{cwd:process.cwd(),timeout:80})).kind,'unknown');
});
test('CodeRabbit adapter uses normal one-shot task and persists submitted ID from spawned process',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'); const {tmpdir}=await import('node:os'); const {join}=await import('node:path'); const {CodeRabbitAdapter}=await import('../src/coderabbit.mjs');
 const home=await mkdtemp(join(tmpdir(),'bridge-cli-'));
 try {
  const invoke=(args,options={})=>run(process.execPath,[fixture,'fake','coderabbit',...args],{cwd:process.cwd(),home,...options});
  const cr=new CodeRabbitAdapter(invoke); let id;
  assert.equal((await cr.create('plan only',async value=>{id=value},2000)).kind,'submitted'); assert.equal(id,'11111111-1111-4111-8111-111111111111');
  assert.deepEqual(await cr.resume(id,'approved',2000),{kind:'complete',minutes:0.5});
  assert.equal((await cr.show(id)).turnStatus,'completed');
 } finally { await rm(home,{recursive:true,force:true}); }
});
test('foreground receiver registers fixed actions and refuses mismatched Slack identity',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'); const {tmpdir}=await import('node:os'); const {join}=await import('node:path');
 const {State}=await import('../src/state.mjs'); const {createBridge}=await import('../src/main.mjs'); const root=await mkdtemp(join(tmpdir(),'bridge-main-')); const state=new State(root,{initialize:true}); await state.call('pending'); await state.close();
 const cfg={teamId:'T0AU433PG75',channelId:'C0CEPB2LURY',appId:'A123',botId:'B123',actionStart:1,actionEnd:Date.now()+60000,actors:{mmani_create_jira:['U123'],mmani_debug_pr:['U123']},twgPath:'/fake/twg',coderabbitPath:'/fake/cr',gitPath:'/fake/git',ghPath:'/fake/gh',bashPath:'/fake/bash',workdir:'/fake/repo',datadogCredentialsFile:join(root,'dd.env'),monitors:Object.fromEntries(['29524154','29524290','29524292'].map(id=>[id,{query:'avg:metric{host:deskdrop-mmani-local}',owner:'owner@example.test',tags:[]}]))};
 await writeFile(join(root,'config.json'),JSON.stringify(cfg),{mode:0o600}); await writeFile(join(root,'slack.env'),'SLACK_BOT_TOKEN=xoxb-synthetic\nSLACK_APP_TOKEN=xapp-synthetic\n',{mode:0o600}); await writeFile(cfg.datadogCredentialsFile,'DD_API_KEY=synthetic\nDD_APP_KEY=synthetic\n',{mode:0o600});
 let identity={ok:true,team_id:'T0AU433PG75',bot_id:'B123'};
 class FakeApp { constructor(){this.handlers=[];this.callbacks={};this.client={auth:{test:async()=>identity},chat:{update:async()=>{}}}} action(name,fn){this.handlers.push(name);this.callbacks[name]=fn} }
 try { cfg.ghPath=process.execPath; cfg.gitPath=process.execPath; await writeFile(join(root,'config.json'),JSON.stringify(cfg)); const bridge=await createBridge({root,App:FakeApp,makeProcess:()=>async()=>({kind:'unknown'})}); assert.deepEqual(bridge.app.handlers,['mmani_create_jira','mmani_debug_pr','mmani_approve_plan']); const {envelope}=await import('./fixtures/cli.mjs'); const body=envelope('f'.repeat(64)); body.actions=[{action_id:'mmani_approve_plan',block_id:'mmani_plan_approval_v1',value:'f'.repeat(64)}]; let acknowledgements=0, replies=0; const handler=bridge.app.callbacks.mmani_approve_plan; const invoke=async b=>handler({body:b,ack:async()=>{acknowledgements++},respond:async msg=>{assert.equal(msg.response_type,'ephemeral');replies++}}); await invoke(body); assert.equal(replies,1); body.user.id='U999'; await invoke(body); assert.equal(replies,1); assert.equal(acknowledgements,2); await bridge.state.close(); identity={ok:true,team_id:'T999',bot_id:'B123'}; await assert.rejects(createBridge({root,App:FakeApp,makeProcess:()=>async()=>({kind:'unknown'})})); } finally { await rm(root,{recursive:true,force:true}); }
});
test('review completion and exact-head checks fail closed on partial or changed evidence',async()=>{
 const {reviewAdapter,checksAdapter}=await import('../src/coderabbit.mjs');
 const line=x=>({kind:'ok',stdout:JSON.stringify(x)+'\n'});
 const valid={type:'complete',status:'review_completed',outcome:'completed',findings:0,gate:{threshold:'major',status:'passed',blockingFindings:0},reviewedFiles:['lib/fixture.ts']}; const reviewGit=async args=>({kind:'ok',stdout:args[0]==='rev-parse'?'d'.repeat(40):'lib/fixture.ts\n'});
 assert.equal((await reviewAdapter(async()=>line(valid),reviewGit)('b'.repeat(40),'d'.repeat(40))).kind,'complete');
 assert.equal((await reviewAdapter(async()=>line({...valid,unreviewedFileCount:1,reviewedFiles:[]} ),reviewGit)('b'.repeat(40),'d'.repeat(40))).kind,'unknown');
 const grant={base:'b'.repeat(40),baseBranch:'codex/base',deliveryBranch:'codex/head'};
 const original=['d'.repeat(40),grant.base,grant.baseBranch,grant.deliveryBranch,'coderabbit-demo/mmani-shopping-cart','coderabbit-demo/mmani-shopping-cart']; let n=0;
 const gh=async()=>line(n++===0?original:['e'.repeat(40),...original.slice(1)]);
 assert.equal(await checksAdapter(gh,async()=>({kind:'ok'}))('https://github.com/coderabbit-demo/mmani-shopping-cart/pull/123','d'.repeat(40),grant),false);
});
test('last stdout event without newline persists submitted identity before close',async()=>{
 const {CodeRabbitAdapter}=await import('../src/coderabbit.mjs'); let saved;
 const id='11111111-1111-4111-8111-111111111111';
 const cr=new CodeRabbitAdapter((args,o)=>run(process.execPath,['-e',`process.stdout.write(JSON.stringify({status:'task_submitted',taskId:'${id}'}))`],{cwd:process.cwd(),...o}));
 assert.equal((await cr.create('plan',async value=>{await new Promise(r=>setTimeout(r,10));saved=value},1000)).kind,'submitted'); assert.equal(saved,id);
});
test('delivery permits scoped regression additions and rejects deleted assertions',async()=>{
 const {Delivery}=await import('../src/coderabbit.mjs'); let deleted='0'; const head='d'.repeat(40),base='b'.repeat(40), grant={base,baseBranch:'main',deliveryBranch:'codex/fix',allowedFiles:['tests/store.test.mjs','lib/store.ts']};
 const git=async a=>({kind:'ok',stdout:a[0]==='remote'?'https://github.com/coderabbit-demo/mmani-shopping-cart.git':a[0]==='ls-remote'?`${head}\trefs/heads/codex/fix\n${base}\trefs/heads/main`:a[0]==='rev-parse'?head:a.includes('--name-only')?'lib/store.ts\ntests/store.test.mjs':a.includes('--numstat')?`4\t${deleted}\ttests/store.test.mjs`:''});
 const d=new Delivery({git}); assert.equal(await d.verifyFiles(grant,head),true); deleted='1'; assert.equal(await d.verifyFiles(grant,head),false);
});
test('GitHub publisher sends first-line issue URL through stdin body-file',async()=>{
 const {githubAdapter}=await import('../src/coderabbit.mjs'); let captured;
 const api=githubAdapter(async(args,options)=>{captured={args,options}; return {kind:'ok',stdout:'https://github.com/coderabbit-demo/mmani-shopping-cart/pull/123'};});
 await api.create({deliveryBranch:'codex/fix',baseBranch:'main',issueUrl:'https://coderabbit-demo.atlassian.net/browse/SC-38'},'d'.repeat(40));
 assert.deepEqual(captured.args.slice(-2),['--body-file','-']); assert.equal(captured.options.stdin.split('\n')[0],'Fixes https://coderabbit-demo.atlassian.net/browse/SC-38'); assert.match(captured.options.stdin,/Jira: SC-38/);
});
test('startup failure stops the Socket Mode app and closes state exactly once',async()=>{
 const {startWorker}=await import('../src/main.mjs');let stop=0,close=0;const bridge={doctor:async()=>{},app:{async start(){},async stop(){stop++}},state:{async close(){close++}},supervisor:{async tick(){throw new Error('failed')}}};await assert.rejects(startWorker(bridge));assert.equal(stop,1);assert.equal(close,1);
});
test('delivery contexts stay independent for concurrent and later episodes',async()=>{
 const {Delivery}=await import('../src/coderabbit.mjs');const {approvalRevision}=await import('../src/config.mjs');const {createHash}=await import('node:crypto');const now=Date.now();
 const grant={objective:'Fix',brief:'Fix',briefHash:createHash('sha256').update('Fix').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/test',commit:'a'.repeat(40),base:'b'.repeat(40),owner:'U123',allowedFiles:['lib/a.ts'],minutes:9,maxTasks:1,startsAt:now-100,endsAt:now+60000,delivery:true,reviewMode:'fallback'};grant.revision=approvalRevision(grant);const id='11111111-1111-4111-8111-111111111111',source=()=>{}, prepared=[];
 const state={async call(op,args){if(op==='getBudget')return {used:0,cap:9,usage_unknown:0};if(op==='getArtifact')return args.kind==='task'?{remote_id:id}:{state:'confirmed'};throw new Error('unexpected')}};
 const adapter={async show(){return {turnStatus:'completed',cancellationPending:false,deliveryStatus:'succeeded',result:{commitSha:'d'.repeat(40),branchName:'coderabbit/task'}}}};
 const d=new Delivery({state,adapter,git:source,approval:async()=>grant,prepare:async()=>{const git=()=>{};prepared.push(git);await new Promise(r=>setTimeout(r,5));return {git};}});
 const original=Delivery.prototype.publish;Delivery.prototype.publish=async function(){return this.git};try {const result=await Promise.all([d.deliver({episode:'a',taskId:id}),d.deliver({episode:'b',taskId:id})]);assert.equal(result[0],prepared[0]);assert.equal(result[1],prepared[1]);assert.equal(d.git,source);assert.equal(await d.deliver({episode:'c',taskId:id}),prepared[2]);} finally {Delivery.prototype.publish=original;}
});
test('review reconciliation reopens the verified authored checkout without publication',async()=>{
 const {Delivery}=await import('../src/coderabbit.mjs');const {approvalRevision}=await import('../src/config.mjs');const {createHash}=await import('node:crypto');const now=Date.now(),id='11111111-1111-4111-8111-111111111111',episode='a'.repeat(64),head='d'.repeat(40),base='b'.repeat(40);
 const grant={objective:'Fix',brief:'Fix',briefHash:createHash('sha256').update('Fix').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/test',baseBranch:'main',deliveryBranch:'codex/fix',commit:'a'.repeat(40),base,owner:'U123',allowedFiles:['lib/a.ts'],minutes:5,maxTasks:1,startsAt:now-1,endsAt:now+60000};grant.revision=approvalRevision(grant);
 const git=async args=>({kind:'ok',stdout:args[0]==='remote'?'https://github.com/coderabbit-demo/mmani-shopping-cart.git':args[0]==='ls-remote'?`${head}\trefs/heads/codex/fix\n${base}\trefs/heads/main`:args[0]==='rev-parse'?head:args.includes('--name-only')?'lib/a.ts':''});let reopened=0;const ops=[];
 const state={async call(op,args){ops.push(op);if(op==='getBudget')return {revision:grant.revision};if(op==='getArtifact')return args.kind==='task'?{remote_id:id}:{state:'unknown',fence:2};if(op==='transition')return {state:args.to};if(op==='saveReview')return true;throw new Error(op)}};
 const d=new Delivery({state,approval:async()=>grant,adapter:{async show(){return {deliveryStatus:'succeeded',result:{commitSha:head,branchName:'coderabbit/task'}}}},prepare:async(g,h,b,reopen)=>{assert.equal(reopen,true);reopened++;return {git}}});
 const receipt={taskId:id,revision:grant.revision,base,head,events:[{type:'complete',status:'review_completed',outcome:'completed',findings:0,gate:{threshold:'major',status:'passed',blockingFindings:0},reviewedFiles:['lib/a.ts']}]};
 assert.equal((await d.reconcile({episode,kind:'review',id:head,receipt})).state,'confirmed');assert.equal(reopened,1);assert.ok(ops.includes('saveReview'));
});
