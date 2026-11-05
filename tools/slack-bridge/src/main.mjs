import { join,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import bolt from '@slack/bolt';
import { State } from './state.mjs';
import { readPrivate,tokens,validateConfig,privateHome } from './config.mjs';
import { readMonitor } from './incidents.mjs';
import { Jira } from './jira.mjs';
import { fixedProcess,verifySource,executable,prepareCheckout } from './process.mjs';
import { Actions } from './actions.mjs';
import { CodeRabbitAdapter,Tasks,Supervisor,Delivery,reviewAdapter,githubAdapter,checksAdapter } from './coderabbit.mjs';
import { slackAdapter } from './slack.mjs';
import { ACTIONS,validateIdentity } from './cards.mjs';

const log={debug(){},info(){},warn(){},error(){},setLevel(){},getLevel(){return bolt.LogLevel.ERROR},setName(){}};
function ddCredentials(path) {
  const rows=readPrivate(path).trim().split('\n').map(x=>/^(DD_API_KEY|DD_APP_KEY)=(\S+)$/.exec(x));
  if (rows.length!==2 || rows.some(x=>!x) || new Set(rows.map(x=>x[1])).size!==2) throw new Error('invalid monitor credentials');
  const v=Object.fromEntries(rows.map(x=>[x[1],x[2]])); return {apiKey:v.DD_API_KEY,appKey:v.DD_APP_KEY};
}
export async function createBridge({root,App=bolt.App,fetcher=fetch,makeProcess=fixedProcess}) {
  privateHome(root); const config=validateConfig(JSON.parse(readPrivate(join(root,'config.json'))));
  const secrets=tokens(join(root,'slack.env')); const dd=ddCredentials(config.datadogCredentialsFile);
  const state=new State(root);
  try {
    const toolPath=[dirname(executable(process.execPath)),'/usr/bin','/bin'].join(':');
    await state.call('recoverJira');
    const invokeJira=makeProcess(config.twgPath,config.workdir,{path:toolPath}), invokeCode=makeProcess(config.coderabbitPath,config.workdir,{path:toolPath}), git=makeProcess(config.gitPath,config.workdir,{path:toolPath});
    const app=new App({token:secrets.SLACK_BOT_TOKEN,appToken:secrets.SLACK_APP_TOKEN,socketMode:true,logger:log});
    const identity=await app.client.auth.test();
    if (identity.ok!==true || identity.team_id!==config.teamId || identity.bot_id!==config.botId) throw new Error('Slack identity mismatch');
    const slack=slackAdapter(app.client,state), jira=new Jira(invokeJira), adapter=new CodeRabbitAdapter(invokeCode);
    const approval=async()=>{const grant=JSON.parse(readPrivate(join(root,'approval.json'))); if(config.uncapped!==undefined && (grant.uncapped===true)!==config.uncapped) throw new Error('coding policy mismatch'); return grant;};
    const monitor=id=>readMonitor(id,config.monitors[id],dd,fetcher);
    const tasks=new Tasks({state,approval,source:grant=>verifySource(git,grant),adapter});
    const gh=makeProcess(config.ghPath,config.workdir);
    const commandPath=[dirname(executable(config.ghPath)),dirname(executable(config.gitPath)),dirname(process.execPath),'/usr/bin','/bin'].join(':');
    if (commandPath.split(':').some(p=>!p.startsWith('/'))) throw new Error('invalid command path');
    const bash=makeProcess(config.bashPath,config.workdir,{path:commandPath});
    const strict=args=>bash([join(config.workdir,'scripts/golden/strict-gate.sh'),...args]);
    const delivery=new Delivery({state,git,adapter,approval,review:reviewAdapter(invokeCode,git),github:githubAdapter(gh),checks:checksAdapter(gh,strict),prepare:async(grant,head,authoredBranch,reopenOnly=false)=>{const p=await prepareCheckout({git,gitPath:config.gitPath,ghPath:config.ghPath,bashPath:config.bashPath,codePath:config.coderabbitPath,root,grant,head,authoredBranch,makeProcess,reopenOnly}); return {git:p.git,review:reviewAdapter(p.code,p.git),github:githubAdapter(p.gh),checks:checksAdapter(p.gh,args=>p.bash([join(p.dir,'scripts/golden/strict-gate.sh'),...args]))};}});
    const actions=new Actions({state,config,monitor,jira,slack,task:tasks,delivery});
    const supervisor=new Supervisor({state,tasks,adapter,slack,delivery});
    for (const action of ACTIONS) app.action(action,async({body,ack,respond})=>{
      const result=await actions.receive(body,ack);
      if(result.status==='blocked' && respond) { try { validateIdentity(body,config); if(config.actors[action].includes(body.user.id)) await respond({response_type:'ephemeral',text:'Action blocked: check the operator status.'}); } catch {} }
    });
    app.action('mmani_approve_plan',async({body,ack,respond})=>{ const result=await actions.approve(body,ack); if(result.status==='blocked' && respond) { try { validateIdentity(body,config); if(config.actors.mmani_debug_pr.includes(body.user?.id)) await respond({response_type:'ephemeral',text:'Action blocked: check the operator status.'}); } catch {} } });
    return {app,state,actions,tasks,supervisor,delivery,async reconcileJira(episode,key,id) {
      if (!/^[a-f0-9]{64}$/.test(episode) || !/^SC-[1-9][0-9]*$/.test(key) || !/^[0-9]+$/.test(id)) throw new Error('invalid reconciliation identity');
      const raw=(await state.call('cards')).find(c=>c.episode===episode); if (!raw) throw new Error('unknown incident');
      const card=await state.call('getCard',{ts:raw.ts}), artifact=await state.call('getArtifact',{episode,kind:'jira'});
      if (artifact?.state!=='unknown') throw new Error('reconciliation unavailable');
      await monitor(card.monitor); await jira.get(key,id,`deskdrop-bridge-${episode}`);
      const ref={episode,kind:'jira',fence:artifact.fence};
      await state.call('transition',{...ref,from:'unknown',to:'known',id,key});
      return state.call('transition',{...ref,from:'known',to:'confirmed'});
    },async doctor(){ await jira.metadata(); for(const id of Object.keys(config.monitors)) await monitor(id); return true; }};
  } catch { await state.close(); throw new Error('bridge preflight failed'); }
}
export async function startWorker(bridge) {
  let timer=null, cleanup=null;
  const shutdown=()=>cleanup ||= (async()=>{ if(timer) clearInterval(timer); try { await bridge.app.stop(); } finally { await bridge.state.close(); } })();
  try { await bridge.doctor(); await bridge.app.start(); await bridge.supervisor.tick(); timer=setInterval(()=>bridge.supervisor.tick().catch(()=>{}),1000); return shutdown; }
  catch { await shutdown().catch(()=>{}); throw new Error('bridge start failed'); }
}
async function cli() {
  process.umask(0o077); const root=join(homedir(),'.deskdrop-slack-bridge'), command=process.argv[2];
  if(command==='init') { const state=new State(root,{initialize:true}); await state.call('pending'); await state.close(); console.log('Bridge state initialized'); return; }
  if(command==='status') { const state=new State(root); try { console.log(JSON.stringify({artifacts:await state.call('artifacts'),pending:(await state.call('pending')).length,handoffs:await state.call('handoffs'),activeRuns:await state.call('activeRuns'),ledger:await state.call('ledger')})); } finally { await state.close(); } return; }
  if(!['doctor','run','reconcile-jira','reconcile-artifact'].includes(command)) throw new Error('invalid command');
  const bridge=await createBridge({root});
  if(command==='reconcile-artifact') { try { const receipt=process.argv[4]==='review'?JSON.parse(readPrivate(join(root,'review-receipt.json'))):null; await bridge.delivery.reconcile({episode:process.argv[3],kind:process.argv[4],id:process.argv[5],receipt}); console.log('Authoritative artifact verified; uncertain outcomes remain fenced'); } finally {await bridge.state.close();} return; }
  if(command==='reconcile-jira') { try { await bridge.reconcileJira(process.argv[3],process.argv[4],process.argv[5]); console.log('Jira identity verified'); } finally { await bridge.state.close(); } return; }
  if(command==='doctor') { try { await bridge.doctor(); console.log('Bridge read-only preflight passed'); } finally { await bridge.state.close(); } return; }
  const shutdown=await startWorker(bridge);
  const stop=async()=>{ await shutdown(); process.exit(0); };
  process.once('SIGINT',stop); process.once('SIGTERM',stop);
  console.log('Bridge Socket Mode worker started');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) cli().catch(()=>{ console.error('Bridge startup failed; inspect private configuration and prerequisites.'); process.exitCode=1; });
