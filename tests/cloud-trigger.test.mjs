import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recover, attempt, limits } from '../scripts/demo/cloud-trigger.mjs';

function fixture(overrides = {}) {
  const calls = [], saves = [], intents = [];
  const record = { run: '11111111-1111-4111-8111-111111111111', phase: 'admitted' };
  const adapter = Object.fromEntries(['protect', 'restoreApp', 'fence', 'verify', 'suppressed', 'release'].map(name => [name, async (...args) => { calls.push(name); return overrides[name] ? overrides[name](...args) : true; }]));
  const store = { load: async () => record, save: async value => saves.push(value), intent: async value => intents.push(value) };
  return { adapter, store, calls, saves, intents };
}
test('recovery restores owned app despite failed suppression and retains uncertainty', async () => {
  const f = fixture({ protect: () => { throw Error('provider'); }, suppressed: () => false });
  const result = await recover(f.adapter, f.store);
  assert.equal(result.app, true);
  assert.equal(result.outcome, 'reconciliation-required');
  assert.deepEqual(f.calls, ['protect', 'restoreApp', 'fence', 'verify', 'suppressed']);
  assert.equal(f.saves.at(-1).phase, 'uncertain');
  assert.equal(f.intents[1].operation, 'restore-app');
  assert.equal(result.deadline - result.started, 360000);
});
test('recovery releases only after all independent confirmations', async () => {
  const f = fixture();
  const result = await recover(f.adapter, f.store);
  assert.equal(result.outcome, 'restored');
  assert.deepEqual(f.calls, ['protect', 'restoreApp', 'fence', 'verify', 'suppressed', 'release']);
  assert.equal(f.saves.at(-1).phase, 'complete');
});
test('unknown late mutation cannot release reservation even with healthy app', async () => {
  const f = fixture({ fence: () => false });
  const result = await recover(f.adapter, f.store);
  assert.equal(result.app, true);
  assert.equal(result.released, false);
  assert.deepEqual(f.calls, ['protect', 'restoreApp', 'fence']);
});
test('wrong app or source and uncertain release retain evidence', async () => {
  for (const key of ['restoreApp', 'verify', 'release']) {
    const f = fixture({ [key]: () => false });
    assert.equal((await recover(f.adapter, f.store)).outcome, 'reconciliation-required');
    assert.equal(f.saves.at(-1).phase, 'uncertain');
  }
});
test('hung operation aborts within bound; late success is not confirmation', async () => {
  let signal;
  const result = await attempt(s => { signal = s; return new Promise(resolve => setTimeout(() => resolve(true), 40)); }, 5);
  assert.equal(result.confirmed, false);
  assert.equal(signal.aborted, true);
  assert.equal(limits.alert, 180000);
});

import { protectionHandoff, verifyRouting, runTrigger, TriggerStore, validateOperation } from '../scripts/demo/cloud-trigger.mjs';
import { definitions, protection, makeCloudApi, makeTriggerApi } from '../scripts/demo/cloud-monitors.mjs';
import { inspectTarget, jobs } from '../scripts/demo/cloud-runtime.mjs';
import { EventEmitter } from 'node:events';

const owner = `cloud_owner:${'a'.repeat(32)}`;
function migrationFixture() {
  const monitors = definitions(owner).map((d,i) => ({ ...d, id: 700+i }));
  const state = { schema: 1, owner, verified: true, pending: null, protection: { pending: false, id: 'broad' }, monitors: monitors.map(({id,name}) => ({id,name})) };
  const record = { run: '11111111-1111-4111-8111-111111111111', broad: 'broad', temporary: {}, pending: null };
  const rows = [{ id: 'broad', ...protection(owner).data }]; rows[0].attributes.status = 'active';
  const writes = [], saves = [], matches = [];
  const covering = id => rows.filter(r => r.attributes.status === 'active' && (r.attributes.monitor_identifier.monitor_tags?.includes(owner) || r.attributes.monitor_identifier.monitor_id === id));
  const api = { call: async (method, endpoint, body) => {
    if (method !== 'GET') {
      assert.ok(saves.at(-1)?.pending, 'persist intent before every write');
      writes.push([method, endpoint]);
    }
    if (method === 'POST') { const row = { ...structuredClone(body.data), id: `guard-${rows.length}` }; row.attributes.status = 'active'; rows.push(row); return { data: row }; }
    if (method === 'DELETE') { rows.find(r => r.id === endpoint.split('/').at(-1)).attributes.status = 'canceled'; assert.ok(covering(700).length && covering(702).length, 'non-checkout always protected'); return null; }
    if (endpoint.includes('downtime_matches')) {
      const id = Number(endpoint.split('/')[4]), current = covering(id); matches.push([id,current.map(r => r.id)]);
      return { data: current.map(r => ({id:r.id,attributes:{scope:'*'}})), meta:{page:{total_filtered_count:current.length}} };
    }
    if (endpoint.includes('downtime?')) return { data: structuredClone(rows), meta:{page:{total_filtered_count:rows.length}} };
    return { data: structuredClone(rows.find(r => r.id === endpoint.split('/').at(-1))) };
  } };
  const store = { save: async r => saves.push(structuredClone(r)) };
  const handoff = protectionHandoff(state, api, async s => { assert.equal(s.protection.pending,false); }, record, store);
  return { state, record, api, rows, monitors, writes, saves, matches, store, handoff, covering };
}
test('broad stage14 suppression migrates without exposing availability or heartbeat and returns to one guard', async () => {
  const f = migrationFixture();
  await f.handoff.open();
  assert.equal(f.covering(701).length,0);
  assert.equal(f.covering(700).length,1); assert.equal(f.covering(702).length,1);
  assert.deepEqual(f.writes.map(w=>w[0]), ['POST','POST','POST','DELETE','DELETE']);
  assert.equal(await f.handoff.close(),true);
  for (const id of [700,701,702]) assert.deepEqual(f.covering(id).map(r=>r.id),[f.state.protection.id]);
  assert.notEqual(f.state.protection.id,'broad'); assert.deepEqual(f.record.temporary,{});
  const count = f.writes.length; await f.handoff.close(); assert.equal(f.writes.length,count);
});
test('unknown create is retained, reconciles an observed write, and never retries absent or ambiguous POST', async () => {
  for (const observed of [true,false]) {
    const f = migrationFixture(), call = f.api.call;
    f.api.call = async (...args) => { if (args[0] === 'POST') { if (observed) await call(...args); throw Error('lost response'); } return call(...args); };
    await assert.rejects(f.handoff.open()); assert.equal(f.record.pending.kind,'create');
    const before = f.rows.length; f.api.call = call;
    if (observed) assert.equal(await f.handoff.close(),true);
    else { await assert.rejects(f.handoff.close()); assert.equal(f.rows.length,before); assert.equal(f.record.pending.kind,'create'); }
  }
});
test('extra effective protection, unowned identifier, unstable inventory fail before opening a window', async () => {
  for (const mutation of ['extra','identifier','unstable']) {
    const f = migrationFixture(), call = f.api.call; let scans=0;
    f.api.call = async (...args) => {
      const r = await call(...args);
      if (mutation==='extra' && args[1].includes('downtime_matches')) r.meta.page.total_filtered_count++;
      if (mutation==='identifier' && args[1]==='/api/v2/downtime/broad') r.data.attributes.monitor_identifier.monitor_tags=['other'];
      if (mutation==='unstable' && args[1].includes('downtime?') && ++scans%2===0) r.data.reverse();
      // Different material inventory on the second scan, not harmless row ordering.
      if (mutation==='unstable' && args[1].includes('downtime?') && scans%2===0) r.data[0].attributes.scope='other';
      return r;
    };
    await assert.rejects(f.handoff.open()); assert.equal(f.covering(701).some(r=>r.id==='broad'),true);
  }
});
function routingFixture() {
  const f=migrationFixture(), route={rule:'owned-rule',recipient:'webhook-approved-cloud'};
  const row={id:route.rule,type:'monitor-notification-rule',attributes:{name:'actual cloud route',filter:{tags:definitions(owner)[0].tags},conditional_recipients:{conditions:[{scope:'transition_type:is_alert',recipients:[route.recipient]}],fallback_recipients:[]}}};
  const rows=[row];
  const api={call:async (m,p)=>p.includes('?')?{data:structuredClone(rows),meta:{page:{total_count:rows.length}}}:{data:structuredClone(row)}};
  return {state:f.state,route,row,rows,api};
}
test('routing requires complete stable coverage, enrolled Alert-only recipient and rejects unsupported or overlapping rules',async()=>{
  const f=routingFixture();assert.equal(await verifyRouting(f.api,f.state,f.route),true);
  for(const mutate of [f=>f.row.attributes.conditional_recipients.conditions[0].scope='transition_type:is_recovery',f=>f.row.attributes.recipients=['other'],f=>f.rows.push({...structuredClone(f.row),id:'other'}),f=>f.row.attributes.filter={scope:'*'},f=>f.row.attributes.filter.tags=['service:deskdrop']]){
    const f=routingFixture();mutate(f);await assert.rejects(verifyRouting(f.api,f.state,f.route));
  }
});
test('routing read extension does not broaden stage14 writes or allow monitor/rule updates',async()=>{
  const paths=[];
  const request= (options,cb)=>{
    paths.push([options.method,options.path]);const req=new EventEmitter();req.destroy=()=>{};
    req.end=()=>{queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;cb(res);res.emit('data',Buffer.from('{}'));res.emit('end');});};return req;
  };
  const credentials={apiKey:'a'.repeat(32),appKey:'b'.repeat(40)};
  const install=await makeCloudApi(credentials,request),trigger=await makeTriggerApi(credentials,request);
  const path='/api/v2/monitor/notification_rule?page=0&per_page=100&sort=name%3Aasc';
  assert.throws(()=>install.call('GET',path));await trigger.call('GET',path);
  await trigger.call('GET','/api/v1/monitor/701?group_states=all');
  for(const method of ['POST','PUT','PATCH','DELETE']) assert.throws(()=>trigger.call(method,'/api/v2/monitor/notification_rule/owned-rule'));
  assert.throws(()=>trigger.call('PUT','/api/v1/monitor/701'));
  assert.equal(paths.length,2);
});

function executableFixture() {
  const f=migrationFixture(), routing=routingFixture(), call=f.api.call, stamp=1793900000000;
  const config={owner,project:'se-demos-project',zone:'us-central1-a',architecture:'linux/amd64',source:'1'.repeat(40),app:`us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:${'2'.repeat(64)}`,checker:`us-central1-docker.pkg.dev/se-demos-project/deskdrop/checker@sha256:${'3'.repeat(64)}`,bundleHash:'4'.repeat(64)};
  const id='5'.repeat(64),network='6'.repeat(64);
  const app={Id:id,Config:{Image:config.app,User:'1000:1000',Labels:{'org.opencontainers.image.revision':config.source}},State:{Running:true},HostConfig:{Privileged:false},Mounts:[],NetworkSettings:{Networks:{deskdrop_isolated:{NetworkID:network}}}};
  const mutations=[];
  const docker=async(method,path)=>{
    if(method==='POST'){mutations.push(path);app.State.Running=path.endsWith('/start');return null;}
    if(path.includes('networks/'))return {Name:'deskdrop_isolated',Internal:true,EnableIPv6:false,Options:{'com.docker.network.bridge.name':'br-deskdrop'}};
    if(path.endsWith('json?all=true'))return [{Id:id,Labels:{'com.docker.compose.project':'deskdrop','com.docker.compose.service':'app'}}];
    return structuredClone(app);
  };
  const api={...f.api,call:async(method,path,body)=>{
    if(path.includes('notification_rule'))return routing.api.call(method,path,body);
    if(path.startsWith('/api/v1/monitor/')){
      const m=structuredClone(f.monitors.find(m=>m.id===Number(path.split('/').at(-1).split('?')[0])));
      m.state={groups:{'host:deskdrop-demo':{status:app.State.Running?'OK':'Alert',last_resolved_ts:stamp/1000-100,last_nodata_ts:0,last_triggered_ts:stamp/1000}}};return m;
    }
    return call(method,path,body);
  }};
  api.list=async()=>structuredClone(f.monitors);api.get=id=>api.call('GET',`/api/v1/monitor/${id}`);
  let operation;
  const lease={schema:1,started:stamp/1000,deadline:stamp/1000+360,installation:'mmani-shopping-cart-gcp',run:'11111111-1111-4111-8111-111111111111',phase:'admitted'};
  const saves=[];
  const store={load:async name=>{if(name==='lease.json')return lease;if(!operation)throw Object.assign(Error(),{code:'ENOENT'});return structuredClone(operation);},save:async r=>{operation=structuredClone(r);f.saves.push(operation);saves.push(operation);}};
  const context={config,state:f.state,api,docker,store,journal:{save:async()=>{}},route:routing.route,health:async()=>({healthy:true,updated:stamp,source:config.source,owner}),now:()=>stamp,sleep:async()=>{}};
  return {...f,app,config,mutations,context,saves,lease};
}
test('actual trigger adapter opens checkout only, stops exact app, observes fresh Alert and restores broad protection',async()=>{
  const f=executableFixture();const result=await runTrigger({...f.context,mode:'trigger'});
  assert.equal(result.status,'restored');assert.equal(f.app.State.Running,true);
  assert.deepEqual(f.mutations,[`/v1.52/containers/${f.app.Id}/stop?t=3`,`/v1.52/containers/${f.app.Id}/start`]);
  assert.ok(f.saves.some(r=>r.phase==='observed'));assert.equal(f.saves.at(-1).phase,'complete');
  assert.equal(f.covering(701).length,1);
});
test('executable recovery attempts exact app even with unavailable management; uncertain stop never releases',async()=>{
  for(const failure of ['provider','unknown-stop']){
    const f=executableFixture();
    if(failure==='provider'){
      f.app.State.Running=false;f.context.api={call:async()=>{throw Error('unavailable');},list:async()=>{throw Error('unavailable');}};
      const result=await runTrigger({...f.context,mode:'recover'});assert.equal(result.status,'reconciliation-required');assert.equal(result.app,true);
    }else{
      const docker=f.context.docker;f.context.docker=async(...args)=>{const result=await docker(...args);if(args[1].endsWith('/stop?t=3'))throw Error('lost response');return result;};
      const result=await runTrigger({...f.context,mode:'trigger'});assert.equal(result.status,'reconciliation-required');assert.equal(result.runtimeCertain,false);
    }
    assert.equal(f.app.State.Running,true);assert.ok(f.mutations.some(p=>p.endsWith('/start')));assert.equal(f.saves.at(-1).phase,'uncertain');
  }
});
test('wrong app source, routing or health denies admission before any fault or provider write',async()=>{
  for(const mutation of [f=>f.app.Config.Image='wrong',f=>f.context.route.recipient='different',f=>f.context.health=async()=>({healthy:false})]){
    const f=executableFixture();mutation(f);await assert.rejects(runTrigger({...f.context,mode:'trigger'}));assert.equal(f.mutations.length,0);assert.equal(f.writes.length,0);
  }
});
test('stopped owned app returns a failed recurring check while wrong source still rejects',async()=>{
  const f=executableFixture();f.app.State.Running=false;
  assert.equal((await inspectTarget(f.config,f.context.docker)).State.Running,false);
  const worker=jobs(f.config,f.context.docker,'{}');
  assert.equal(await worker.run('checkout'),false);assert.equal(await worker.run('availability'),false);assert.equal(f.mutations.length,0);
  f.app.Config.Image='wrong';await assert.rejects(worker.run('checkout'));
});

test('Alert observation has a monotonic 180-second bound; stale Alert cannot become fresh evidence',async()=>{
  const f=executableFixture();let elapsed=0;f.context.monotonic=()=>elapsed;
  f.context.sleep=async ms=>{elapsed+=ms;};const call=f.context.api.call;
  f.context.api.call=async(...args)=>{const r=await call(...args);if(args[1].includes('group_states'))r.state.groups['host:deskdrop-demo'].last_triggered_ts=1;return r;};
  const result=await runTrigger({...f.context,mode:'trigger'});
  assert.equal(elapsed,180000);assert.equal(result.status,'restored');assert.ok(!f.saves.some(r=>r.phase==='observed'));
  assert.equal(f.app.State.Running,true);
});

test('trigger suppression reconciliation tolerates volatile provider metadata but keeps safety comparisons',async()=>{
 const f=migrationFixture(),call=f.api.call;let tick=0;
 f.api.call=async(...args)=>{const r=await call(...args);if(args[1].includes('downtime?'))for(const row of r.data)row.attributes.modified=++tick;return r;};
 await f.handoff.open();assert.equal(f.covering(701).length,0);assert.equal(await f.handoff.close(),true);
});
