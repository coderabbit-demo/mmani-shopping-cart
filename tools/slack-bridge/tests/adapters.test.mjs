import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { run } from '../src/process.mjs';
import { Jira } from '../src/jira.mjs';
const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url));
test('spawn uses fixed argument array and minimal environment',async()=>{
 const marker='$(touch /tmp/never-bridge-injection)';
 const r=await run(process.execPath,[fixture,'args',marker],{cwd:process.cwd()}); assert.equal(r.kind,'ok');
 const result=JSON.parse(r.stdout); assert.deepEqual(result.args,[marker]); assert.deepEqual(result.envKeys,['HOME','LANG','PATH']);
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
 class FakeApp { constructor(){this.handlers=[];this.client={auth:{test:async()=>identity},chat:{update:async()=>{}}}} action(name,fn){this.handlers.push(name)} }
 try { cfg.ghPath=process.execPath; cfg.gitPath=process.execPath; await writeFile(join(root,'config.json'),JSON.stringify(cfg)); const bridge=await createBridge({root,App:FakeApp,makeProcess:()=>async()=>({kind:'unknown'})}); assert.deepEqual(bridge.app.handlers,['mmani_create_jira','mmani_debug_pr','mmani_approve_plan']); await bridge.state.close(); identity={ok:true,team_id:'T999',bot_id:'B123'}; await assert.rejects(createBridge({root,App:FakeApp,makeProcess:()=>async()=>({kind:'unknown'})})); } finally { await rm(root,{recursive:true,force:true}); }
});
test('review completion and exact-head checks fail closed on partial or changed evidence',async()=>{
 const {reviewAdapter,checksAdapter}=await import('../src/coderabbit.mjs');
 const line=x=>({kind:'ok',stdout:JSON.stringify(x)+'\n'});
 const valid={type:'complete',status:'review_completed',outcome:'completed',unreviewedFileCount:0,reused:false};
 assert.equal((await reviewAdapter(async()=>line(valid))('b'.repeat(40),'d'.repeat(40))).kind,'complete');
 assert.equal((await reviewAdapter(async()=>line({...valid,unreviewedFileCount:1}))('b'.repeat(40),'d'.repeat(40))).kind,'unknown');
 const grant={base:'b'.repeat(40),baseBranch:'codex/base',deliveryBranch:'codex/head'};
 const original=['d'.repeat(40),grant.base,grant.baseBranch,grant.deliveryBranch,'coderabbit-demo/mmani-shopping-cart','coderabbit-demo/mmani-shopping-cart']; let n=0;
 const gh=async()=>line(n++===0?original:['e'.repeat(40),...original.slice(1)]);
 assert.equal(await checksAdapter(gh,async()=>({kind:'ok'}))('https://github.com/coderabbit-demo/mmani-shopping-cart/pull/123','d'.repeat(40),grant),false);
});
