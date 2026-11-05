import { State } from '../../src/state.mjs';
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export function incident(overrides={}) { return {v:1,monitor:'29524154',event:'8884561078445671160',cycle:'cycle-001',transition:'Triggered',at:String(Math.floor(Date.now()/1000)),scope:'host:deskdrop-mmani-local',host:'deskdrop-mmani-local',alertTitle:'[TEST] DeskDrop',eventTitle:'DeskDrop',type:'metric alert',...overrides}; }
export function config() { return {appId:'A123',botId:'B123',actionStart:Date.now()-10000,actionEnd:Date.now()+3600000,actors:{mmani_create_jira:['U123'],mmani_debug_pr:['U123']}}; }
export function envelope(raw, action='mmani_create_jira', ts='1234567890.123456') {
  return {type:'block_actions',api_app_id:'A123',team:{id:'T0AU433PG75'},channel:{id:'C0CEPB2LURY'},container:{channel_id:'C0CEPB2LURY',message_ts:ts},user:{id:'U123'},message:{ts,bot_id:'B123',blocks:[{type:'actions',block_id:'mmani_incident_controls_v1',elements:['mmani_create_jira','mmani_debug_pr'].map(action_id=>({type:'button',action_id,value:raw}))}]},actions:[{action_id:action,block_id:'mmani_incident_controls_v1',value:raw}]};
}
if (process.argv[2]==='claim') {
  const s=new State(process.argv[3]);
  try { const r=await s.call('claim',{episode:process.argv[4],kind:'jira'}); console.log(JSON.stringify(r)); } finally { await s.close(); }
} else if (process.argv[2]==='fake') {
 const [target,...args]=process.argv.slice(3), log=join(process.env.HOME,'calls.jsonl');
 appendFileSync(log,JSON.stringify({target,args:args.map(x=>x.length>100?'[bounded]':x)})+'\n',{mode:0o600});
 const emit=x=>console.log(JSON.stringify(x));
 if(target==='jira') {
   const wrap=(command,data,meta={})=>emit({apiVersion:'v2',command,data,meta});
   if(args.includes('create-metadata')) wrap('jira.workitem.field.create-metadata',{fields:[]});
   else if(args.includes('query')) wrap('jira.workitem.query',{issues:[]});
   else if(args.includes('create')) { const marker=args[args.indexOf('--labels')+1]; writeFileSync(join(process.env.HOME,'marker'),marker,{mode:0o600}); if (existsSync(join(process.env.HOME,'force-unknown'))) process.exitCode=1; else wrap('jira.workitem.create',{success:true,issue:{id:'11486',key:'SC-38'}}); }
   else if(args.includes('get')) { const marker=readFileSync(join(process.env.HOME,'marker'),'utf8'); wrap('jira.workitem.get',[{id:'11486',key:'SC-38',summary:'synthetic',status:{name:'Open'},project:{id:'10107',key:'SC'},issuetype:{id:'10047',name:'Bug'},labels:[marker]}],{acquisition:{requested:1,returned:1,succeeded:1,failed:0,omitted:0,truncated:0},evidence:{coverage:{status:'complete'},truncation:{truncated:false}}}); }
   else process.exitCode=1;
 } else if(target==='coderabbit') {
   const taskId='11111111-1111-4111-8111-111111111111';
   if(args[0]==='review') emit({type:'complete',status:'review_completed',outcome:'completed',unreviewedFileCount:0,reused:false});
   else if(args[1]==='new') emit({type:'complete',status:'task_submitted',taskId});
   else if(args[1]==='resume') { if (args.includes('--message')) writeFileSync(join(process.env.HOME,'implemented'),'1',{mode:0o600}); emit({type:'progress',status:'message_sent',clientOperationId:'fixture'}); emit({type:'complete',status:'turn_completed',taskId,turn:{outcome:'completed'},agentMinutes:0.5}); }
   else if(args[1]==='show') emit({type:'complete',status:'task_shown',taskId,task:{turnStatus:'completed',cancellationPending:false,result:{commit:'d'.repeat(40)},delivery:{status:'succeeded'}}});
   else if(args[1]==='cancel') emit({type:'complete',status:'cancel_pending',taskId});
   else process.exitCode=1;
 } else if(target==='git') {
   if(args[0]==='remote') console.log('https://github.com/coderabbit-demo/mmani-shopping-cart.git');
   else if(args[0]==='ls-remote') { for (const ref of args.filter(x=>x.startsWith('refs/heads/'))) { const hash=ref.endsWith('fixture-base')?'b':ref.endsWith('fixture-delivery')?'d':'a'; console.log(hash.repeat(40)+'\t'+ref); } }
   else if(args[0]==='status') {}
   else if(args[0]==='branch') console.log('codex/offline-fixture');
   else if(args[0]==='rev-parse') console.log((existsSync(join(process.env.HOME,'implemented'))?'d':'a').repeat(40));
   else if(args[0]==='diff' && args.includes('--name-only')) console.log('lib/fixture.ts');
   else if(args[0]!=='diff') process.exitCode=1;
 } else if(target==='gh') { if(args[0]==='pr') console.log('https://github.com/coderabbit-demo/mmani-shopping-cart/pull/123'); else if(args[0]==='api') console.log(JSON.stringify(['d'.repeat(40),'b'.repeat(40),'codex/fixture-base','codex/fixture-delivery','coderabbit-demo/mmani-shopping-cart','coderabbit-demo/mmani-shopping-cart'])); else process.exitCode=1; }
 else if(target==='strict') console.log('PASS');
 else process.exitCode=1;
} else if (process.argv[2]==='hang') { process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); } else if (process.argv[2]==='args') console.log(JSON.stringify({args:process.argv.slice(3),envKeys:Object.keys(process.env).sort()}));
