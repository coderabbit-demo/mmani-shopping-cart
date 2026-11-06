import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduler, heartbeat, datagram, boundedRun, dockerTransport } from '../scripts/demo/cloud-runtime.mjs';
const flush = () => new Promise(r => setImmediate(r));
test('30s cadence has no overlap or catch-up storm; heartbeat is independent', async () => {
  let time = 0, release; const calls = [], reports = [], health = [];
  const hung = new Promise(r => { release = r; });
  const s = scheduler({ now: () => time, setTimer: () => 1, clearTimer() {}, run: async name => { calls.push(name); if (name === 'checkout') await hung; return true; }, report: async (...a) => reports.push(a), health: async v => health.push(v) });
  await flush(); time = 30000; s.tick(); await flush();
  assert.equal(calls.filter(x => x === 'checkout').length, 1);
  assert.equal(heartbeat({ healthy: false, updated: time }, time), 2);
  assert.equal(heartbeat({ healthy: true, updated: time }, time), 0);
  assert.equal(heartbeat({ healthy: true, updated: 0 }, 65001), 2);
  time = 300000; s.tick(); await flush();
  assert.equal(calls.filter(x => x === 'availability').length, 3);
  release(); await flush(); await s.stop(); assert.equal(health.at(-1), false);
});
test('telemetry failure makes controller unhealthy and blocks replacement', async () => {
  let time = 0, count = 0;
  const s = scheduler({ now: () => time, setTimer: () => 1, clearTimer() {}, run: async () => { count++; return true; }, report: async () => { throw Error('intake down'); }, health: async () => {} });
  await flush(); assert.equal(s.status().healthy, false); time = 30000; s.tick(); await flush(); assert.equal(count, 2); await s.stop();
});
test('cloud telemetry carries only approved identity/status', () => {
  const owner = `cloud_owner:${'a'.repeat(32)}`;
  assert.ok(datagram(owner, 'checkout', 2).toString().includes(owner));
  assert.throws(() => datagram(owner, 'checkout', 1)); assert.throws(() => datagram(owner, 'other', 0));
});
test('completed children clear deadlines; rejected execution cannot be reported healthy', async () => {
  let stopped = false;
  const child = { wait: async () => 0, term: async () => { stopped = true; }, remove: async () => {}, running: async () => false };
  assert.equal(await boundedRun(child), true);
  assert.equal(stopped, true);
  assert.equal(await boundedRun({ ...child, wait: async () => { throw Error('unknown child'); } }), false);
  await assert.rejects(boundedRun({ ...child, running: async () => true }));
});
test('Docker transport rejects non-container operations before contacting socket', async () => {
  let called = false; const call = dockerTransport({ request: () => { called = true; } });
  for (const endpoint of ['/images/create', '/v1.45/images/create', '/v1.45/containers/../../images/create']) await assert.rejects(call('POST', endpoint));
  assert.equal(called, false);
});

test('hung real child is terminated, removed and cannot overlap its replacement', async () => {
  const { spawn } = await import('node:child_process');
  const processChild = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const exited = new Promise(resolve => processChild.once('exit', code => resolve(code)));
  const actions = [];
  try {
    const result = await boundedRun({ wait: () => exited, term: async () => { actions.push('term'); processChild.kill('SIGTERM'); }, remove: async () => { actions.push('remove'); if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill('SIGKILL'); await exited; }, running: async () => processChild.exitCode === null && processChild.signalCode === null }, { setTimer: (fn, ms) => setTimeout(fn, ms / 100), clearTimer: clearTimeout });
    assert.equal(result, false); assert.deepEqual(actions, ['term', 'remove']);
    assert.equal(unrelated.exitCode, null); assert.equal(unrelated.signalCode, null);
  } finally { processChild.kill('SIGKILL'); unrelated.kill('SIGTERM'); }
});

test('checker specification has no credentials, socket or host network', async () => {
  const { checkerSpec, verifyChild, validateRuntime } = await import('../scripts/demo/cloud-runtime.mjs');
  const c = { owner: `cloud_owner:${'a'.repeat(32)}`, source: 'b'.repeat(40), app: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:${'c'.repeat(64)}`, checker: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/checker@sha256:${'d'.repeat(64)}`, bundleHash: 'e'.repeat(64), project: 'se-demos-project', zone: 'us-central1-a', architecture: 'linux/amd64' };
  const s = checkerSpec(c, 'checkout', '{}');
  assert.equal(s.HostConfig.NetworkMode, 'deskdrop_isolated'); assert.equal(s.User, '1000:1000'); assert.equal(s.HostConfig.Binds, undefined);
  assert.deepEqual(s.HostConfig.CapDrop, ['ALL']); assert.equal(s.Env.length, 3);
  assert.throws(() => validateRuntime({ ...c, project: 'other' }));
  assert.throws(() => verifyChild({ Id: 'a'.repeat(64), Config: { ...s, Image: c.app }, HostConfig: s.HostConfig }, c, 'checkout'));
});

const config = () => ({ owner: `cloud_owner:${'a'.repeat(32)}`, source: 'b'.repeat(40), app: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:${'c'.repeat(64)}`, checker: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/checker@sha256:${'d'.repeat(64)}`, bundleHash: 'e'.repeat(64), project: 'se-demos-project', zone: 'us-central1-a', architecture: 'linux/amd64' });
async function dockerFixture(t, behavior = {}) {
  const http = await import('node:http'), fs = await import('node:fs/promises'), os = await import('node:os');
  const dir = await fs.mkdtemp(`${os.tmpdir()}/cloud-docker-`), socketPath = `${dir}/docker.sock`;
  const c = config(), appId = '1'.repeat(64), childId = '2'.repeat(64), networkId = '3'.repeat(64);
  let child, name; const calls = [];
  const server = http.createServer(async (req,res) => {
    let raw = ''; for await (const b of req) raw += b;
    const body = raw ? JSON.parse(raw) : undefined; calls.push([req.method, req.url, body]);
    let result = null;
    if (req.url === '/v1.52/containers/json?all=true') result = [{ Id: appId, Names: ['/deskdrop-app-1'], Labels: { 'com.docker.compose.project': 'deskdrop', 'com.docker.compose.service': 'app' } }, ...(child ? [{ Id: childId, Names: [`/${name}`] }] : []), { Id: '4'.repeat(64), Names: ['/unrelated'] }];
    else if (req.url === `/v1.52/containers/${appId}/json`) result = { Config: { Image: behavior.wrongApp ? 'wrong' : c.app, User: '1000:1000', Labels: { 'org.opencontainers.image.revision': c.source } }, State: { Running: true }, Mounts: [], HostConfig: {}, NetworkSettings: { Networks: { deskdrop_isolated: { NetworkID: networkId } } } };
    else if (req.url === `/v1.52/networks/${networkId}`) result = { Name: 'deskdrop_isolated', Internal: !behavior.egress, EnableIPv6: false, Options: { 'com.docker.network.bridge.name': 'br-deskdrop' } };
    else if (req.url.startsWith('/v1.52/containers/create?name=')) {
      name = req.url.split('=')[1]; child = { Id: childId, Config: body, HostConfig: body.HostConfig, Mounts: [], State: { Running: false, ExitCode: 0 } };
      if (behavior.foreign) child.Config.Labels['deskdrop.cloud_owner'] = `cloud_owner:${'f'.repeat(32)}`;
      if (behavior.unknownCreate) res.statusCode = 503;
      result = { Id: childId };
    } else if (req.url === `/v1.52/containers/${childId}/start`) { child.State.Running = !!behavior.hung; }
    else if (req.url === `/v1.52/containers/${childId}/json`) result = child;
    else if (req.url === `/v1.52/containers/${childId}/stop?t=3`) { if (!behavior.ignoreTerm) child.State.Running = false; else res.statusCode = 503; }
    else if (req.url === `/v1.52/containers/${childId}/kill?signal=SIGKILL`) { if (!behavior.unclean) child.State.Running = false; }
    else if (req.method === 'DELETE' && req.url === `/v1.52/containers/${childId}`) { assert.equal(child.State.Running, false); child = null; }
    else { res.statusCode = 400; }
    res.end(JSON.stringify(result));
  });
  await new Promise(r => server.listen(socketPath,r));
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await fs.rm(dir,{recursive:true,force:true}); });
  let time = 0;
  const { jobs } = await import('../scripts/demo/cloud-runtime.mjs');
  const work = jobs(c,dockerTransport({socketPath}), '{}', { now: () => time, sleep: async ms => { time += ms; } });
  return { work,calls,child: () => child };
}
test('executable Docker socket adapter creates fresh children and removes them before replacement', async t => {
  const f = await dockerFixture(t);
  await f.work.reconcile();
  assert.equal(await f.work.run('checkout'),true); assert.equal(f.child(),null);
  assert.equal(await f.work.run('checkout'),true);
  const creates = f.calls.filter(([m,p]) => m === 'POST' && p.includes('/create?'));
  assert.equal(creates.length,2);
  assert.deepEqual(creates[0][2].Entrypoint,['node','/checker/cloud-checker.mjs']);
  assert.equal(f.calls.filter(([m]) => m === 'DELETE').length,2);
  assert.ok(f.calls.every(([,p]) => !p.includes('4'.repeat(64))));
});
test('25s deadline forces cleanup after 3s TERM failure; ambiguous cleanup blocks replacement', async t => {
  const f = await dockerFixture(t,{hung:true,ignoreTerm:true});
  assert.equal(await f.work.run('checkout'),false);
  assert.ok(f.calls.some(([,p])=>p.endsWith('/stop?t=3')));
  assert.ok(f.calls.some(([,p])=>p.endsWith('/kill?signal=SIGKILL'))); assert.equal(f.child(),null);
  const g = await dockerFixture(t,{hung:true,ignoreTerm:true,unclean:true});
  await assert.rejects(g.work.run('checkout'),/remains running/);
  await assert.rejects(g.work.run('checkout'),/reconciled/);
  assert.equal(g.calls.filter(([,p])=>p.includes('/create?')).length,1);
});
test('unknown creation reconciles exact child; foreign owner and wrong app/network cannot be mutated',async t=>{
  const f=await dockerFixture(t,{unknownCreate:true});
  await assert.rejects(f.work.run('checkout'));assert.equal(f.child(),null);
  const foreign=await dockerFixture(t,{foreign:true});
  await assert.rejects(foreign.work.run('checkout'),/ownership/);
  assert.ok(!foreign.calls.some(([m,p])=>m==='DELETE'||p.endsWith('/start')||p.includes('/stop?')));
  for(const behavior of [{wrongApp:true},{egress:true}]){
    const g=await dockerFixture(t,behavior);await assert.rejects(g.work.run('checkout'));
    assert.ok(g.calls.every(([m])=>m==='GET'));
  }
});
test('restart reconciliation removes previously owned child before any fresh creation',async t=>{
  const f=await dockerFixture(t,{hung:true,ignoreTerm:true,unclean:true});
  await assert.rejects(f.work.run('checkout'));
  const count=f.calls.length;await assert.rejects(f.work.reconcile());
  assert.ok(f.calls.slice(count).every(([,p])=>!p.includes('/create?')));
});

test('production heartbeat loop ticks in a distinct process while a real checker hangs; forced cleanup preserves unrelated process',async t=>{
  const {spawn}=await import('node:child_process');
  const heartbeatSource=new URL('../scripts/demo/cloud-runtime.mjs',import.meta.url).href;
  function launch(source) {
    const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','ignore','ignore','ipc']});
    const messages=[];child.on('message',m=>messages.push(m));
    const closed=new Promise(resolve=>{child.once('close',(code,signal)=>resolve({code,signal}));});
    const waitFor=predicate=>new Promise((resolve,reject)=>{
      const existing=messages.find(predicate);if(existing){resolve(existing);return;}
      const clean=()=>{clearTimeout(timer);child.off('message',message);child.off('exit',exit);child.off('error',error);};
      const message=m=>{if(predicate(m)){clean();resolve(m);}};
      const exit=()=>{clean();reject(Error('Owned child exited before progress'));};
      const error=e=>{clean();reject(e);};
      const timer=setTimeout(()=>{clean();reject(Error('Owned child readiness/progress deadline'));},15000);
      child.on('message',message);child.once('exit',exit);child.once('error',error);
      if(child.exitCode!==null||child.signalCode!==null)exit();
    });
    return {child,messages,closed,waitFor};
  }
  for(const delay of [0,700])await t.test(`heartbeat startup delay ${delay}ms`,async()=>{
    const checker=launch(`process.on('SIGTERM',()=>{});process.send({ready:true});setInterval(()=>{},1000);`);
    const unrelated=launch(`process.send({ready:true});setInterval(()=>{},1000);`);
    const hb=launch(`import {heartbeatWorker} from ${JSON.stringify(heartbeatSource)};
      await new Promise(r=>setTimeout(r,${delay}));let count=0;
      const stop=await heartbeatWorker({read:async()=>({healthy:false,updated:Date.now()}),send:async status=>process.send({tick:++count,status}),failed:()=>process.exit(1),setTimer:fn=>setInterval(fn,20)});
      process.on('SIGTERM',()=>{stop();process.disconnect();});process.send({ready:true});`);
    let observed;
    try{
      await Promise.all([checker.waitFor(m=>m.ready),unrelated.waitFor(m=>m.ready),hb.waitFor(m=>m.ready)]);
      const baseline=hb.messages.filter(m=>m.tick).length;
      const progress=hb.waitFor(m=>m.tick>=baseline+3);
      const actions=[],deadlines=[];
      const result=await boundedRun({wait:async()=>{await checker.closed;return 1;},term:async()=>{actions.push('term');checker.child.kill('SIGTERM');},remove:async()=>{actions.push('kill');checker.child.kill('SIGKILL');await checker.closed;},running:async()=>checker.child.exitCode===null&&checker.child.signalCode===null},{setTimer:(fn,ms)=>{
        deadlines.push(ms);
        // Advance the injected execution clock only after actual independent progress.
        // Startup contention cannot consume a wall-clock window before HB is ready.
        if(ms===25000){const token={cancelled:false};progress.then(()=>{if(!token.cancelled)fn();},()=>{if(!token.cancelled)fn();});return token;}
        return setTimeout(fn,ms/100);
      },clearTimer:timer=>{if(timer&&Object.hasOwn(timer,'cancelled'))timer.cancelled=true;else clearTimeout(timer);}});
      observed=await progress;
      assert.equal(result,false);assert.deepEqual(actions,['term','kill']);assert.equal(checker.child.signalCode,'SIGKILL');
      const ticks=hb.messages.filter(m=>m.tick>baseline).map(m=>String(m.status)).join('\n');
      assert.ok(ticks.trim().split('\n').length>=3);assert.ok(ticks.trim().split('\n').every(s=>s==='2'));
      assert.ok(observed.tick>=baseline+3);assert.equal(deadlines[0],25000);assert.ok(deadlines.includes(3000));
      assert.equal(unrelated.child.exitCode,null);assert.equal(unrelated.child.signalCode,null);
    }finally{
      for(const owned of [checker,hb,unrelated])if(owned.child.exitCode===null&&owned.child.signalCode===null)owned.child.kill('SIGKILL');
      await Promise.all([checker.closed,hb.closed,unrelated.closed]);
      assert.ok([checker,hb,unrelated].every(o=>o.child.exitCode!==null||o.child.signalCode!==null));
    }
  });
});

test('normal interleaved completion keeps heartbeat healthy; expired work and failures stay degraded',async()=>{
  let time=0,finishCheckout;const health=[];
  const checkout=new Promise(r=>{finishCheckout=r;});
  const s=scheduler({now:()=>time,setTimer:()=>1,clearTimer(){},run:async n=>n==='checkout'?checkout:true,report:async()=>{},health:async healthy=>health.push({healthy,updated:time})});
  await flush();assert.equal(s.status().active,1);assert.equal(heartbeat(health.at(-1),time),0,'legitimate checkout must not cause critical heartbeat');
  const {heartbeatWorker}=await import('../scripts/demo/cloud-runtime.mjs');let heartbeatTick;const statuses=[];
  const stopHeartbeat=await heartbeatWorker({read:async()=>({...health.at(-1),updated:Date.now()}),send:async status=>statuses.push(status),failed:()=>assert.fail('heartbeat failed'),setTimer:fn=>{heartbeatTick=fn;return 1;},clearTimer(){}});
  assert.equal(statuses.at(-1),0);heartbeatTick();await flush();assert.equal(statuses.at(-1),0);
  time=30000;s.tick();await flush();assert.equal(s.status().healthy,false);assert.equal(heartbeat(health.at(-1),time),2,'overlap is degraded even after availability completes');
  heartbeatTick();await flush();assert.equal(statuses.at(-1),2);
  finishCheckout(true);await flush();assert.equal(heartbeat(health.at(-1),time),0,'confirmed cleanup permits recovery');stopHeartbeat();await s.stop();
  const failed=scheduler({setTimer:()=>1,clearTimer(){},run:async()=>{throw Error('cleanup unknown');},report:async()=>{},health:async healthy=>health.push({healthy,updated:time})});
  await flush();assert.equal(heartbeat(health.at(-1),time),2);assert.equal(failed.status().healthy,false);await failed.stop();
});
