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

test('different grants keep source and authored contexts immutable in sequential and interleaved deliveries',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {createHash}=await import('node:crypto');const {State}=await import('../src/state.mjs');const {Delivery,CodeRabbitAdapter}=await import('../src/coderabbit.mjs');const {approvalRevision}=await import('../src/config.mjs');
 const root=await mkdtemp(join(tmpdir(),'bridge-contexts-')),state=new State(root,{initialize:true}),calls=[],ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],head='d'.repeat(40),base='b'.repeat(40);
 const grants=['one','two'].map(n=>{const g={objective:'Fix '+n,brief:'Fix '+n,repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/source-'+n,commit:'a'.repeat(40),base,baseBranch:'main',deliveryBranch:'codex/delivery-'+n,issueUrl:'https://coderabbit-demo.atlassian.net/browse/SC-'+(n==='one'?'38':'39'),owner:'U123',allowedFiles:['lib/a.ts'],uncapped:true,maxTasks:1,delivery:true,reviewMode:'fallback'};g.briefHash=createHash('sha256').update(g.brief).digest('hex');g.revision=approvalRevision(g);return g;});
 let revoked=false;
 const adapter=new CodeRabbitAdapter(async args=>{const id=args.at(-1);return {kind:'ok',stdout:JSON.stringify({type:'complete',status:'task_shown',task:{taskId:id,repository:{provider:'github',repoId:'1437431331',name:'mmani-shopping-cart'},branchName:grants[ids.indexOf(id)].branch,baseBranchName:grants[ids.indexOf(id)].branch,turnStatus:'completed',cancellationPending:false,deliveryStatus:'succeeded',result:{commitSha:head,branchName:'coderabbit/'+id}}})};},{branch:'codex/original'});
 const source=async args=>{calls.push(['source',args]);throw new Error('authored commands reached source')};
 const deliveries=grants.map((g,i)=>new Delivery({state,adapter,git:source,approval:async()=>{if(i===1 && revoked)throw new Error('revoked');return g},prepare:async(grant,h,branch)=>{
  assert.equal(grant.revision,g.revision);assert.equal(h,head);assert.equal(branch,'coderabbit/'+ids[i]);await new Promise(r=>setTimeout(r,i?2:5));
  const git=async args=>{calls.push([g.deliveryBranch,args]);const cmd=args[0];return {kind:'ok',stdout:cmd==='remote'?'https://github.com/coderabbit-demo/mmani-shopping-cart.git':cmd==='ls-remote'?`${head}\trefs/heads/${g.deliveryBranch}\n${base}\trefs/heads/main`:cmd==='rev-parse'?head:cmd==='diff' && args.includes('--name-only')?'lib/a.ts':''};};
  return {git,review:async(b,h)=>{calls.push([g.deliveryBranch,'review']);assert.equal(b,base);assert.equal(h,head);return {kind:'complete',base,head,findings:0,gate:{status:'passed'}}},github:{async create(grant,h){assert.equal(grant.revision,g.revision);assert.equal(h,head);calls.push([g.deliveryBranch,'pr']);return `https://github.com/coderabbit-demo/mmani-shopping-cart/pull/${i+100}`}},checks:async(pr,h,grant)=>{assert.equal(grant.deliveryBranch,g.deliveryBranch);assert.equal(h,head);assert.equal(pr,`https://github.com/coderabbit-demo/mmani-shopping-cart/pull/${i+100}`);return true}};
 }}));
 try {
  for(let i=0;i<2;i++) {const episode=String(i+1).repeat(64),g=grants[i];await state.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:String(i),event:String(i),test:true,actionable:true},ts:String(i),digest:String(i)});await state.call('initBudget',{episode,revision:g.revision,uncapped:true});for(const [kind,id,key] of [['jira',String(i+1),'SC-'+(i?'39':'38')],['task',ids[i],null],[`resume-${g.revision}`,ids[i],null]]) {const a=await state.call('claim',{episode,kind}),ref={episode,kind,fence:a.artifact.fence};await state.call('transition',{...ref,from:'claimed',to:'known',id,key});await state.call('transition',{...ref,from:'known',to:'confirmed'});}}
  const observed=await Promise.all(ids.map((id,i)=>adapter.show(id,20000,{branch:grants[i].branch})));assert.equal(observed[0].branchName,grants[0].branch);assert.equal(observed[1].branchName,grants[1].branch);await assert.rejects(adapter.show(ids[0],20000,{branch:grants[1].branch}));
  const results=await Promise.all(deliveries.map((d,i)=>d.deliver({episode:String(i+1).repeat(64),taskId:ids[i]})));assert.ok(results.every(r=>r.status==='awaiting_native_verify'));
  for(let i=0;i<2;i++)assert.equal((await deliveries[i].deliver({episode:String(i+1).repeat(64),taskId:ids[i]})).status,'awaiting_native_verify');
  assert.equal(calls.filter(c=>c[0]==='source').length,0);assert.equal(calls.filter(c=>c[1]==='review').length,2);assert.equal(calls.filter(c=>c[1]==='pr').length,2);assert.equal(adapter.expected.branch,'codex/original');assert.ok(deliveries.every(d=>d.git===source));
  revoked=true;const before=calls.length;assert.equal(await deliveries[1].deliver({episode:'2'.repeat(64),taskId:ids[1]}),'delivery_blocked');assert.equal(calls.length,before);
 }finally{await state.close();await rm(root,{recursive:true,force:true});}
});

test('native observation accepts absent outer task ID but rejects a conflicting identity',async()=>{
 const {CodeRabbitAdapter}=await import('../src/coderabbit.mjs');const id='11111111-1111-4111-8111-111111111111';let taskId;
 const adapter=new CodeRabbitAdapter(async args=>{assert.deepEqual(args,['code','resume','--agent',id]);return {kind:'ok',stdout:JSON.stringify({type:'complete',status:'turn_completed',taskId,turn:{outcome:'completed'},agentMinutes:null})}});
 assert.deepEqual(await adapter.observe(id),{minutes:null});taskId='22222222-2222-4222-8222-222222222222';assert.equal(await adapter.observe(id),null);
});


test('worker starts and flushes Jira status without consulting absent or invalid coding approval',async()=>{
 const {mkdtemp,writeFile,chmod,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');
 const {State}=await import('../src/state.mjs');const {Delivery,Supervisor}=await import('../src/coderabbit.mjs');const {startWorker}=await import('../src/main.mjs');const {readPrivate}=await import('../src/config.mjs');const {slackAdapter}=await import('../src/slack.mjs');
 for(const mode of ['missing','unsafe','mismatch']) {
  const root=await mkdtemp(join(tmpdir(),'bridge-grant-free-')),state=new State(root,{initialize:true}),episode='a'.repeat(64),file=join(root,'approval.json');
  let reads=0,started=0,stopped=0,updates=[];let shutdown;
  try {
   if(mode!=='missing') {await writeFile(file,JSON.stringify({uncapped:false}),{mode:0o600});if(mode==='unsafe')await chmod(file,0o644);}
   await state.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:'c',event:'e',test:true,actionable:true},ts:'1.1',digest:'d'});
   const claim=await state.call('claim',{episode,kind:'jira'}),ref={episode,kind:'jira',fence:claim.artifact.fence};await state.call('transition',{...ref,from:'claimed',to:'known',id:'1',key:'SC-38'});await state.call('transition',{...ref,from:'known',to:'confirmed'});await state.call('enqueue',{episode,ts:'1.1',status:'jira_confirmed'});
   const approval=async()=>{reads++;const grant=JSON.parse(readPrivate(file));if(grant.uncapped!==true)throw new Error('coding policy mismatch');return grant;};
   const slack=slackAdapter({chat:{async update(message){updates.push(message)}}},state),delivery=new Delivery({state,approval});
   const supervisor=new Supervisor({state,tasks:{},adapter:{},slack,delivery});
   shutdown=await startWorker({state,supervisor,doctor:async()=>{},app:{async start(){started++},async stop(){stopped++}}});
   assert.equal(started,1,mode);assert.equal(stopped,0,mode);assert.equal(reads,0,mode);assert.equal(updates.length,1,mode);assert.match(updates[0].blocks[1].elements[0].text,/jira_confirmed.*SC-38/);assert.equal((await state.call('pending')).length,0);
   await supervisor.tick();assert.equal(reads,0,mode);assert.equal(stopped,0,mode);
  } finally {if(shutdown)await shutdown();else if(!state.closed)await state.close();assert.equal(stopped,1,mode);await rm(root,{recursive:true,force:true});}
 }
});

test('pending handoffs isolate unavailable, invalid, changed and stale grants while preserving valid exact-head checks',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {createHash}=await import('node:crypto');
 const {State}=await import('../src/state.mjs');const {Delivery,Supervisor}=await import('../src/coderabbit.mjs');const {approvalRevision}=await import('../src/config.mjs');const {slackAdapter}=await import('../src/slack.mjs');
 const root=await mkdtemp(join(tmpdir(),'bridge-refresh-')),state=new State(root,{initialize:true});const head='d'.repeat(40),base='b'.repeat(40),id='11111111-1111-4111-8111-111111111111';
 const grant={objective:'Fix',brief:'Fix',briefHash:createHash('sha256').update('Fix').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/test',baseBranch:'main',deliveryBranch:'codex/fix',commit:'a'.repeat(40),base,owner:'U123',allowedFiles:['lib/a.ts'],uncapped:true,maxTasks:1};grant.revision=approvalRevision(grant);
 const changed={...grant,objective:'Different'};changed.revision=approvalRevision(changed);let reads=0,shows=0,prepares=0,checks=0,mutations=0,updates=[],gate='pass',changeGrant=false,shownHead=head;
 const approval=async()=>{reads++;if(reads===1)throw new Error('unreadable');if(reads===2)return {...grant,briefHash:'invalid'};if(reads===3 || changeGrant)return changed;return grant;};
 const git=async args=>({kind:'ok',stdout:args[0]==='remote'?'https://github.com/coderabbit-demo/mmani-shopping-cart.git':args[0]==='ls-remote'?`${head}\trefs/heads/codex/fix\n${base}\trefs/heads/main`:args[0]==='rev-parse'?head:args.includes('--name-only')?'lib/a.ts':''});
 const adapter={async show(task,timeout,expected){shows++;assert.equal(task,id);assert.deepEqual(expected,{branch:grant.branch});return {deliveryStatus:'succeeded',result:{commitSha:shownHead,branchName:'coderabbit/task'}}},async push(){mutations++}};
 const delivery=new Delivery({state,approval,adapter,review:async()=>{mutations++},github:{async create(){mutations++}},prepare:async(g,h,branch,reopen)=>{prepares++;assert.equal(g.revision,grant.revision);assert.equal(h,head);assert.equal(branch,'coderabbit/task');assert.equal(reopen,true);return {git,checks:async(pr,h,checkedGrant)=>{checks++;assert.equal(h,head);assert.equal(checkedGrant.revision,grant.revision);if(gate==='throw')throw new Error('checks unavailable');if(gate==='changed')changeGrant=true;return gate!=='fail' && pr.endsWith('/4');}}}});
 const slack=slackAdapter({chat:{async update(msg){updates.push(msg)}}},state),supervisor=new Supervisor({state,tasks:{},adapter,slack,delivery});
 try {
  for(let i=1;i<=5;i++) {
   const episode=String(i).repeat(64),pr=`https://github.com/coderabbit-demo/mmani-shopping-cart/pull/${i}`;
   await state.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:String(i),event:String(i),test:true,actionable:true},ts:String(i),digest:String(i)});
   if(i>=3) await state.call('initBudget',{episode,revision:i===4?grant.revision:(i===3?'e':'f').repeat(64),uncapped:true});
   for(const [kind,remoteId,key] of [['task',id,null],['pr',head,pr]]) {const claim=await state.call('claim',{episode,kind}),ref={episode,kind,fence:claim.artifact.fence};await state.call('transition',{...ref,from:'claimed',to:'known',id:remoteId,key});await state.call('transition',{...ref,from:'known',to:'confirmed'});}
   await state.call('setHandoff',{episode,pr,head});
  }
  await state.call('enqueue',{episode:'1'.repeat(64),ts:'1',status:'jira_confirmed'});
  await supervisor.tick();
  const rows=await state.call('handoffs');assert.deepEqual(rows.map(h=>h.status),['stale_exact_head','stale_exact_head','stale_exact_head','awaiting_native_verify','stale_exact_head']);
  assert.equal(reads,6);assert.equal(shows,1);assert.equal(prepares,1);assert.equal(checks,1);assert.equal(mutations,0);assert.equal(updates.length,1);assert.equal((await state.call('pending')).length,0);
  await supervisor.tick();assert.equal((await state.call('handoffs'))[3].status,'awaiting_native_verify');assert.equal(checks,2);
  for(const failure of ['throw','fail','changed','head','pr']) {
   const episode='4'.repeat(64),pr='https://github.com/coderabbit-demo/mmani-shopping-cart/pull/4';
   gate=['throw','fail','changed'].includes(failure)?failure:'pass';changeGrant=false;shownHead=failure==='head'?'e'.repeat(40):head;
   await state.call('setHandoff',{episode,pr:failure==='pr'?'https://github.com/coderabbit-demo/mmani-shopping-cart/pull/999':pr,head});
   await state.call('enqueue',{episode,ts:'4',status:`status_${failure}`});await supervisor.tick();
   assert.equal((await state.call('handoffs'))[3].status,'stale_exact_head',failure);assert.equal((await state.call('pending')).length,0,failure);
  }
  assert.equal(updates.length,6);assert.equal(mutations,0);
 }finally{await state.close();await rm(root,{recursive:true,force:true});}
});

test('limited verified handoff survives execution expiry while coding stays blocked and read-only gates recheck',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {createHash}=await import('node:crypto');
 const {State}=await import('../src/state.mjs');const {Delivery,Tasks}=await import('../src/coderabbit.mjs');const {approvalRevision}=await import('../src/config.mjs');
 const root=await mkdtemp(join(tmpdir(),'bridge-expired-handoff-')),state=new State(root,{initialize:true}),episode='a'.repeat(64),head='d'.repeat(40),base='b'.repeat(40),id='11111111-1111-4111-8111-111111111111',pr='https://github.com/coderabbit-demo/mmani-shopping-cart/pull/123';
 let now=1000,reads=0,gates=0,mutations=0,shownHead=head,gate=true,grantDuringCheck=null,grantAbsent=false,advanceDuringCheck=false;
 const grant={objective:'Fix',brief:'Fix',briefHash:createHash('sha256').update('Fix').digest('hex'),repository:'coderabbit-demo/mmani-shopping-cart',repositoryId:'1437431331',branch:'codex/test',baseBranch:'main',deliveryBranch:'codex/fix',commit:'a'.repeat(40),base,owner:'U123',allowedFiles:['lib/a.ts'],minutes:9,maxTasks:1,startsAt:900,endsAt:2000,delivery:true,reviewMode:'fallback',issueUrl:'https://coderabbit-demo.atlassian.net/browse/SC-38'};grant.revision=approvalRevision(grant);
 let current=grant;
 const approval=async()=>{reads++;if(grantAbsent)throw new Error('missing');return current;};
 const git=async args=>({kind:'ok',stdout:args[0]==='remote'?'https://github.com/coderabbit-demo/mmani-shopping-cart.git':args[0]==='ls-remote'?`${head}\trefs/heads/codex/fix\n${base}\trefs/heads/main`:args[0]==='rev-parse'?head:args.includes('--name-only')?'lib/a.ts':''});
 const adapter={async show(task,timeout,expected){assert.equal(task,id);assert.deepEqual(expected,{branch:grant.branch});return {deliveryStatus:'succeeded',result:{commitSha:shownHead,branchName:'coderabbit/task'}}},async create(){mutations++},async resume(){mutations++},async push(){mutations++}};
 const delivery=new Delivery({state,approval,adapter,now:()=>now,review:async()=>{mutations++},github:{async create(){mutations++}},prepare:async(g,h,branch,reopen)=>{assert.equal(g.revision,grant.revision);assert.equal(h,head);assert.equal(branch,'coderabbit/task');assert.equal(reopen,true);return {git,checks:async(actualPr,actualHead,g)=>{gates++;assert.equal(actualPr,pr);assert.equal(actualHead,head);assert.equal(g.revision,grant.revision);if(grantDuringCheck)current=grantDuringCheck;if(advanceDuringCheck)now=grant.endsAt+1;return gate;}}}});
 try {
  await state.call('bootstrap',{incident:{episode,monitor:'29524154',cycle:'c',event:'e',test:true,actionable:true},ts:'1.1',digest:'d'});await state.call('initBudget',{episode,revision:grant.revision,cap:9});
  for(const [kind,remoteId,key] of [['task',id,null],['pr',head,pr],['jira','11486','SC-38']]) {const claim=await state.call('claim',{episode,kind}),ref={episode,kind,fence:claim.artifact.fence};await state.call('transition',{...ref,from:'claimed',to:'known',id:remoteId,key});await state.call('transition',{...ref,from:'known',to:'confirmed'});}
  await state.call('setHandoff',{episode,pr,head});
  await delivery.refreshHandoffs();assert.equal((await state.call('handoffs'))[0].status,'awaiting_native_verify');assert.equal(gates,1);assert.equal(reads,2);
  now=grant.endsAt+1;await delivery.refreshHandoffs();assert.equal((await state.call('handoffs'))[0].status,'awaiting_native_verify');assert.equal(gates,2);assert.equal(reads,4);
  now=grant.endsAt-1;advanceDuringCheck=true;await delivery.refreshHandoffs();assert.equal(now,grant.endsAt+1);assert.equal((await state.call('handoffs'))[0].status,'awaiting_native_verify');assert.equal(gates,3);assert.equal(reads,6);advanceDuringCheck=false;
  const tasks=new Tasks({state,approval,source:async()=>true,adapter,now:()=>now});const before=JSON.stringify(await state.call('ledger'));
  assert.equal(await tasks.start(await state.call('getCard',{ts:'1.1'}),'U123'),'approval_required');await assert.rejects(tasks.approveAndResume({episode,taskId:id,revision:grant.revision,actor:'U123'}));
  assert.equal(await delivery.deliver({episode,taskId:id}),'delivery_blocked');await assert.rejects(delivery.publish({episode,taskId:id,head}));assert.equal(JSON.stringify(await state.call('ledger')),before);assert.equal(mutations,0);
  for(const failure of ['grant','scope','source','base','revoked','invalid','head','gates','postcheck']) {
   current=grant;grantAbsent=false;shownHead=head;gate=true;grantDuringCheck=null;
   const changed={...grant,objective:'Changed objective'};changed.revision=approvalRevision(changed);
   if(failure==='grant')current=changed;
   for(const [kind,fields] of [['scope',{allowedFiles:['lib/other.ts']}],['source',{branch:'codex/other'}],['base',{base:'e'.repeat(40)}]]) if(failure===kind) {current={...grant,...fields};current.revision=approvalRevision(current);}
   if(failure==='revoked')grantAbsent=true;if(failure==='invalid')current={...grant,minutes:0};if(failure==='head')shownHead='e'.repeat(40);if(failure==='gates')gate=false;if(failure==='postcheck')grantDuringCheck=changed;
   await state.call('setHandoff',{episode,pr,head});await delivery.refreshHandoffs();assert.equal((await state.call('handoffs'))[0].status,'stale_exact_head',failure);
  }
  assert.equal(mutations,0);
 }finally{await state.close();await rm(root,{recursive:true,force:true});}
});
