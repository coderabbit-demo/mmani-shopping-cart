import { join,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import bolt from '@slack/bolt';
import { State } from './state.mjs';
import { readPrivate,tokens,validateConfig,privateHome } from './config.mjs';
import { readMonitor } from './incidents.mjs';
import { Jira } from './jira.mjs';
import { fixedProcess,verifySource,executable } from './process.mjs';
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
    const invokeJira=makeProcess(config.twgPath,config.workdir), invokeCode=makeProcess(config.coderabbitPath,config.workdir), git=makeProcess(config.gitPath,config.workdir);
    const app=new App({token:secrets.SLACK_BOT_TOKEN,appToken:secrets.SLACK_APP_TOKEN,socketMode:true,logger:log});
    const identity=await app.client.auth.test();
    if (identity.ok!==true || identity.team_id!==config.teamId || identity.bot_id!==config.botId) throw new Error('Slack identity mismatch');
    const slack=slackAdapter(app.client,state), jira=new Jira(invokeJira), adapter=new CodeRabbitAdapter(invokeCode);
    const approval=async()=>JSON.parse(readPrivate(join(root,'approval.json')));
    const monitor=id=>readMonitor(id,config.monitors[id],dd,fetcher);
    const tasks=new Tasks({state,approval,source:grant=>verifySource(git,grant),adapter});
    const gh=makeProcess(config.ghPath,config.workdir);
    const commandPath=[dirname(executable(config.ghPath)),dirname(executable(config.gitPath)),dirname(process.execPath),'/usr/bin','/bin'].join(':');
    if (commandPath.split(':').some(p=>!p.startsWith('/'))) throw new Error('invalid command path');
    const bash=makeProcess(config.bashPath,config.workdir,{path:commandPath});
    const strict=args=>bash([join(config.workdir,'scripts/golden/strict-gate.sh'),...args]);
    const delivery=new Delivery({state,git,adapter,approval,review:reviewAdapter(invokeCode),github:githubAdapter(gh),checks:checksAdapter(gh,strict)});
    const actions=new Actions({state,config,monitor,jira,slack,task:tasks,delivery});
    const supervisor=new Supervisor({state,tasks,adapter,slack});
    for (const action of ACTIONS) app.action(action,async({body,ack,respond})=>{
      const result=await actions.receive(body,ack);
      if(result.status==='blocked' && respond) { try { validateIdentity(body,config); if(config.actors[action].includes(body.user.id)) await respond({response_type:'ephemeral',text:'Action blocked: check the operator status.'}); } catch {} }
    });
    app.action('mmani_approve_plan',async({body,ack})=>actions.approve(body,ack));
    return {app,state,actions,tasks,supervisor,async reconcileJira(episode,key,id) {
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
async function cli() {
  process.umask(0o077); const root=join(homedir(),'.deskdrop-slack-bridge'), command=process.argv[2];
  if(command==='init') { const state=new State(root,{initialize:true}); await state.call('pending'); await state.close(); console.log('Bridge state initialized'); return; }
  if(command==='status') { const state=new State(root); try { console.log(JSON.stringify({artifacts:await state.call('artifacts'),pending:(await state.call('pending')).length,handoffs:await state.call('handoffs'),activeRuns:await state.call('activeRuns')})); } finally { await state.close(); } return; }
  if(!['doctor','run','reconcile-jira'].includes(command)) throw new Error('invalid command');
  const bridge=await createBridge({root});
  if(command==='reconcile-jira') { try { await bridge.reconcileJira(process.argv[3],process.argv[4],process.argv[5]); console.log('Jira identity verified'); } finally { await bridge.state.close(); } return; }
  if(command==='doctor') { try { await bridge.doctor(); console.log('Bridge read-only preflight passed'); } finally { await bridge.state.close(); } return; }
  try { await bridge.doctor(); await bridge.app.start(); } catch { await bridge.state.close(); throw new Error('bridge start failed'); }
  await bridge.supervisor.tick();
  const timer=setInterval(()=>bridge.supervisor.tick().catch(()=>{}),1000);
  const shutdown=async()=>{ clearInterval(timer); await bridge.app.stop(); await bridge.state.close(); process.exit(0); };
  process.once('SIGINT',shutdown); process.once('SIGTERM',shutdown);
  console.log('Bridge Socket Mode worker started');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) cli().catch(()=>{ console.error('Bridge startup failed; inspect private configuration and prerequisites.'); process.exitCode=1; });
