import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIncident,validateMonitor } from '../src/incidents.mjs';
import { incident } from './fixtures/cli.mjs';
test('native identity and honest test classification',()=>{
 const x=incident(), a=parseIncident(JSON.stringify(x));
 assert.equal(a.event,'8884561078445671160'); assert.equal(a.test,true); assert.equal(a.actionable,true);
 assert.equal(parseIncident(JSON.stringify(incident({alertTitle:'Ordinary',eventTitle:'[TEST] fixture'}))).test,true);
 assert.equal(parseIncident(JSON.stringify(incident({alertTitle:'Alert',eventTitle:'Alert',type:'test'}))).test,false);
 assert.equal(parseIncident(JSON.stringify(incident({alertTitle:'test server down',eventTitle:'Alert'}))).test,false);
 assert.equal(parseIncident(JSON.stringify(incident({transition:'Recovered'}))).actionable,false);
 assert.notEqual(a.episode,parseIncident(JSON.stringify(incident({cycle:'cycle-002'}))).episode);
 for (const x of [incident({cycle:''}),incident({host:''}),incident({event:'$ID'}),incident({at:'0'}),incident({alertTitle:'x'.repeat(2100)})]) assert.throws(()=>parseIncident(JSON.stringify(x)));
 assert.throws(()=>parseIncident('{"v":1,"v":1}'));
 assert.throws(()=>parseIncident(JSON.stringify({...incident(),extra:'x'})));
});
test('monitor ownership and scope are independently verified',()=>{
 const i=parseIncident(JSON.stringify(incident())); const expected={query:'avg:metric{host:deskdrop-mmani-local}',owner:'owner@example.test',tags:[]};
 const monitor={id:29524154,query:expected.query,creator:{handle:expected.owner},tags:['service:deskdrop','env:local-demo','demo_id:mmani-shopping-cart-local','host:deskdrop-mmani-local']};
 assert.equal(validateMonitor(monitor,expected,i),true);
 assert.throws(()=>validateMonitor({...monitor,creator:{handle:'other'}},expected,i));
 assert.throws(()=>validateMonitor({...monitor,tags:[]},expected,i));
});
test('monitor lookup is pinned to US3 and rejects mismatched scope',async()=>{
 const {readMonitor}=await import('../src/incidents.mjs');
 const expected={query:'avg:metric{host:deskdrop-mmani-local}',owner:'owner@example.test',tags:[]};
 const monitor={id:29524154,query:expected.query,creator:{handle:expected.owner},tags:['service:deskdrop','env:local-demo','demo_id:mmani-shopping-cart-local','host:deskdrop-mmani-local']};
 let target; const fetcher=async(url,opts)=>{target=url; assert.equal(opts.method,'GET'); assert.equal(opts.redirect,'error'); return new Response(JSON.stringify(monitor));};
 assert.equal(await readMonitor('29524154',expected,{apiKey:'local-synthetic',appKey:'local-synthetic'},fetcher),true);
 assert.equal(target,'https://api.us3.datadoghq.com/api/v1/monitor/29524154');
 await assert.rejects(readMonitor('1',expected,{apiKey:'x',appKey:'x'},fetcher));
});
test('proposed payload carries both native titles and seconds in canonical controls',async()=>{
 const {readFile}=await import('node:fs/promises'); const template=JSON.parse(await readFile(new URL('../../../deploy/slack/datadog-payload.json',import.meta.url),'utf8'));
 const controls=template.blocks.find(b=>b.block_id==='mmani_incident_controls_v1').elements;
 assert.equal(controls.length,2); assert.equal(controls[0].value,controls[1].value);
 const raw=JSON.parse(controls[0].value); assert.equal(raw.at,'$DATE_POSIX'); assert.equal(raw.alertTitle,'$ALERT_TITLE'); assert.equal(raw.eventTitle,'$EVENT_TITLE'); assert.equal(raw.type,'$EVENT_TYPE');
 assert.throws(()=>parseIncident(controls[0].value));
});
test('native timestamp must be fresh and cycle never derives from another field',()=>{
 const now=Date.now();
 assert.throws(()=>parseIncident(JSON.stringify(incident({cycle:'',event:'123',at:String(Math.floor(now/1000))})),now));
 assert.throws(()=>parseIncident(JSON.stringify(incident({at:String(Math.floor((now-86401000)/1000))})),now));
 assert.throws(()=>parseIncident(JSON.stringify(incident({at:String(Math.floor((now+301000)/1000))})),now));
});

test('owned monitor requires pinned host query and actual ownership metadata',()=>{
 const i=parseIncident(JSON.stringify(incident()));
 const query='avg(last_5m):avg:deskdrop.health{service:deskdrop,env:local-demo,host:deskdrop-mmani-local} > 0';
 const expected={query,owner:'synthetic-owner@example.test',tags:['managed_by:demo','local_owner:synthetic']};
 const monitor={id:29524154,query,creator:{handle:expected.owner},tags:['service:deskdrop','env:local-demo','demo_id:mmani-shopping-cart-local',...expected.tags]};
 assert.equal(validateMonitor(monitor,expected,i),true);
 assert.throws(()=>validateMonitor({...monitor,query:query.replace('> 0','> 1')},expected,i));
 assert.throws(()=>validateMonitor({...monitor,creator:{handle:'different'}},expected,i));
 assert.throws(()=>validateMonitor({...monitor,tags:monitor.tags.filter(t=>t!=='local_owner:synthetic')},expected,i));
 for(const host of ['host:other','host:deskdrop-mmani-local-other','!host:deskdrop-mmani-local','host:deskdrop-mmani-local OR env:other']) {
  const wrong=query.replace('host:deskdrop-mmani-local',host);
  assert.throws(()=>validateMonitor({...monitor,query:wrong},{...expected,query:wrong},i));
 }
});

test('native service-check over scopes require exact protected query and host',()=>{
 for(const [id,name] of [['29524154','availability'],['29524290','checkout'],['29524292','heartbeat']]) {
  const query=`"deskdrop.local.${name}".over("service:deskdrop","env:local-demo","demo_id:mmani-shopping-cart-local","host:deskdrop-mmani-local").by("host").last(2).count_by_status()`;
  const expected={query,owner:'synthetic@example.test',tags:['managed_by:demo','local_owner:fixture']};
  const m={id:Number(id),type:'service check',query,creator:{handle:expected.owner},tags:['service:deskdrop','env:local-demo','demo_id:mmani-shopping-cart-local',...expected.tags]};
  assert.equal(validateMonitor(m,expected,{monitor:id}),true);
  assert.throws(()=>validateMonitor({...m,query:query.replace('last(2)','last(3)')},expected,{monitor:id}));
  assert.throws(()=>validateMonitor({...m,creator:{handle:'other'}},expected,{monitor:id}));
  assert.throws(()=>validateMonitor({...m,tags:m.tags.filter(x=>x!=='managed_by:demo')},expected,{monitor:id}));
  for(const bad of ['host:other','host:*','!host:deskdrop-mmani-local','host:deskdrop-mmani-local OR host:other','host:deskdrop-mmani-local*','host:deskdrop-mmani-local,host:other']) {
   const wrong=query.replace('host:deskdrop-mmani-local',bad); assert.throws(()=>validateMonitor({...m,query:wrong},{...expected,query:wrong},{monitor:id}));
  }
 }
});
