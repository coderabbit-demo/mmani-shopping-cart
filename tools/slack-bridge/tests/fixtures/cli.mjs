import { State } from '../../src/state.mjs';
export function incident(overrides={}) { return {v:1,monitor:'29524154',event:'8884561078445671160',cycle:'cycle-001',transition:'Triggered',at:String(Math.floor(Date.now()/1000)),scope:'host:deskdrop-mmani-local',host:'deskdrop-mmani-local',alertTitle:'[TEST] DeskDrop',eventTitle:'DeskDrop',type:'metric alert',...overrides}; }
export function config() { return {appId:'A123',botId:'B123',actionStart:Date.now()-10000,actionEnd:Date.now()+3600000,actors:{mmani_create_jira:['U123'],mmani_debug_pr:['U123']}}; }
export function envelope(raw, action='mmani_create_jira', ts='1234567890.123456') {
  return {type:'block_actions',api_app_id:'A123',team:{id:'T0AU433PG75'},channel:{id:'C0CEPB2LURY'},container:{channel_id:'C0CEPB2LURY',message_ts:ts},user:{id:'U123'},message:{ts,bot_id:'B123',blocks:[{type:'actions',block_id:'mmani_incident_controls_v1',elements:['mmani_create_jira','mmani_debug_pr'].map(action_id=>({type:'button',action_id,value:raw}))}]},actions:[{action_id:action,block_id:'mmani_incident_controls_v1',value:raw}]};
}
if (process.argv[2]==='claim') {
  const s=new State(process.argv[3]);
  try { const r=await s.call('claim',{episode:process.argv[4],kind:'jira'}); console.log(JSON.stringify(r)); } finally { await s.close(); }
} else if (process.argv[2]==='hang') { process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); } else if (process.argv[2]==='args') console.log(JSON.stringify({args:process.argv.slice(3),envKeys:Object.keys(process.env).sort()}));
