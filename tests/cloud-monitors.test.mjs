import test from 'node:test';
import os from 'node:os';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, chmod, link, unlink, writeFile, rm } from 'node:fs/promises';
import { ownerTag, selector, definitions, owned, inventory, Journal, reconcile } from '../scripts/demo/cloud-monitors.mjs';

const owner = `cloud_owner:${'a'.repeat(32)}`;
const state = () => ({ schema: 1, owner, monitors: [], pending: null });
const row = (id = 123) => ({ ...definitions(owner)[0], id });
test('cloud selectors cannot target the local installation', () => {
  assert.match(ownerTag(), /^cloud_owner:[a-f0-9]{32}$/);
  assert.throws(() => selector(`local_owner:${'a'.repeat(32)}`));
  assert.equal(new Set(selector(owner)).size, 6);
  for (const m of definitions(owner)) {
    assert.match(m.query, /deskdrop.cloud/); assert.ok(m.query.includes(owner));
    assert.ok(m.tags.includes('host:deskdrop-demo'));
    assert.throws(() => owned({ ...m, id: 29524290 }, m));
    assert.throws(() => owned({ ...m, id: 123, tags: selector(ownerTag()) }, m));
    assert.equal(owned({ ...m, id: 123 }, m), 123);
  }
});
test('inventory rejects repeated IDs and changed pagination', async () => {
  await assert.rejects(inventory(async () => [row(), row()]));
  let count = 0;
  await assert.rejects(inventory(async () => [row(++count)]));
  assert.deepEqual(await inventory(async () => [row()]), [row()]);
});
test('unknown create is reconciled without creating again; ambiguous matches block', async () => {
  const s = state(); s.pending = { kind: 'create', name: row().name };
  let saves = 0;
  await assert.rejects(reconcile(s, { list: async () => [], get: async () => row() }, async () => saves++));
  assert.equal(s.pending.kind, 'create'); assert.equal(saves, 0);
  await assert.rejects(reconcile(s, { list: async () => [row(), row(124)], get: async id => row(id) }, async () => saves++));
  await reconcile(s, { list: async () => [row()], get: async () => row() }, async () => saves++);
  assert.equal(saves, 1); assert.deepEqual(s.monitors, [{ id: 123, name: row().name }]); assert.equal(s.pending, null);
});
test('unknown delete retains intent until absence is confirmed', async () => {
  const s = state(); s.monitors = [{ id: 123, name: row().name }]; s.pending = { kind: 'delete', id: 123, name: row().name };
  await assert.rejects(reconcile(s, { list: async () => [row()], get: async () => row() }, async () => {}));
  await reconcile(s, { list: async () => [], get: async () => assert.fail('missing monitor must not be fetched') }, async () => {});
  assert.deepEqual(s.monitors, []); assert.equal(s.pending, null);
});
test('protected journal rejects links, permissions, corruption and concurrent lock', async () => {
  const dir = await mkdtemp(`${os.homedir()}/deskdrop-journal-`); const journal = new Journal(dir, process.getuid());
  try {
    await journal.save(state()); assert.deepEqual(await journal.read(), state());
    const file = `${dir}/installation.json`;
    await link(file, `${dir}/alias`); await assert.rejects(journal.read()); await unlink(`${dir}/alias`);
    await chmod(file, 0o644); await assert.rejects(journal.read()); await chmod(file, 0o600);
    await writeFile(file, '{bad'); await assert.rejects(journal.read()); await assert.rejects(journal.save(state())); await unlink(file); await journal.save(state());
    await journal.locked(async () => { await assert.rejects(journal.locked(async () => assert.fail('second lock acquired'))); });
    await chmod(dir, 0o755); await assert.rejects(journal.read());
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('suppression is exact-owner, permanent and silent', async () => {
  const { protection, verifyProtection } = await import('../scripts/demo/cloud-monitors.mjs');
  const record = { ...protection(owner).data, id: 'owned-downtime' }; record.attributes.status = 'active';
  assert.equal(verifyProtection(record, owner), 'owned-downtime');
  assert.throws(() => verifyProtection(record, ownerTag()));
  record.attributes.schedule.end = '2026-01-01'; assert.throws(() => verifyProtection(record, owner));
});

function provider(s,{unknownCreate=false,unknownProtection=false,unknownDelete=false,ineffective=false}={}) {
  const rows=[],writes=[],saves=[];let downtime;
  const save=async value=>saves.push(structuredClone(value));
  const api={list:async()=>structuredClone(rows),get:async id=>structuredClone(rows.find(r=>r.id===id)),call:async(method,p,body)=>{
    if(method==='POST'&&p==='/api/v2/downtime'){
      assert.equal(saves.at(-1).protection.pending,true);writes.push([method,p]);
      downtime={...structuredClone(body.data),id:'owned-downtime'};downtime.attributes.status='active';
      if(unknownProtection)throw Error('unknown suppression response');return {data:structuredClone(downtime)};
    }
    if(method==='GET'&&p.startsWith('/api/v2/downtime?'))return {data:downtime?[structuredClone(downtime)]:[],meta:{page:{total_filtered_count:downtime?1:0}}};
    if(method==='GET'&&p==='/api/v2/downtime/owned-downtime')return {data:structuredClone(downtime)};
    if(method==='POST'&&p==='/api/v1/monitor'){
      assert.equal(saves.at(-1).pending.kind,'create');assert.equal(saves.at(-1).verified,false);
      writes.push([method,p]);const r={...body,id:1000+rows.length};rows.push(r);
      if(unknownCreate)throw Error('unknown monitor response');return structuredClone(r);
    }
    if(method==='DELETE'){
      assert.equal(saves.at(-1).pending.kind,'delete');const id=Number(p.split('/').at(-1));
      assert.ok(rows.some(r=>r.id===id));writes.push([method,p]);rows.splice(rows.findIndex(r=>r.id===id),1);
      if(unknownDelete)throw Error('unknown delete response');return null;
    }
    if(p.includes('/downtime_matches?'))return {data:ineffective?[]:[{id:downtime.id,attributes:{scope:'*',end:null}}],meta:{page:{total_filtered_count:ineffective?0:1}}};
    assert.fail(`unexpected provider operation ${method} ${p}`);
  }};
  return {api,save,writes,saves,rows};
}
test('installer persists intent before every mutation and proves effective permanent suppression',async()=>{
  const {install,removeOwned}=await import('../scripts/demo/cloud-monitors.mjs');
  const s=state(),f=provider(s);await install(s,f.api,f.save);
  assert.equal(s.verified,true);assert.equal(s.monitors.length,3);assert.equal(f.writes.length,4);
  await install(s,f.api,f.save);assert.equal(f.writes.length,4,'repeat does not create duplicates');
  await removeOwned(s,f.api,f.save);assert.equal(s.verified,false);assert.deepEqual(s.monitors,[]);
  assert.ok(f.writes.filter(([m])=>m==='DELETE').every(([,p])=>/^\/api\/v1\/monitor\/100[0-2]$/.test(p)));
});
test('lost suppression response is durably reconciled without a second POST',async()=>{
  const {install}=await import('../scripts/demo/cloud-monitors.mjs');const s=state(),f=provider(s,{unknownProtection:true});
  await assert.rejects(install(s,f.api,f.save));assert.equal(s.protection.pending,true);
  await install(s,f.api,f.save);assert.equal(s.verified,true);
  assert.equal(f.writes.filter(([,p])=>p==='/api/v2/downtime').length,1);
});
test('lost monitor creation/deletion responses never authorize another write',async()=>{
  const {install,removeOwned}=await import('../scripts/demo/cloud-monitors.mjs');const s=state(),f=provider(s,{unknownCreate:true});
  for(let i=0;i<3;i++)await assert.rejects(install(s,f.api,f.save));
  await install(s,f.api,f.save);assert.equal(s.monitors.length,3);assert.equal(f.writes.length,4);
  const before=f.writes.length;await install(s,f.api,f.save);assert.equal(f.writes.length,before);
  const g=provider(state(),{unknownDelete:true}),d=state();await install(d,g.api,g.save);
  await assert.rejects(removeOwned(d,g.api,g.save));assert.equal(d.pending.kind,'delete');
  await reconcile(d,g.api,g.save);assert.equal(d.monitors.length,2);
  assert.equal(g.writes.filter(([m])=>m==='DELETE').length,1);
});
test('ineffective suppression prevents runtime-ready proof; ambiguous downtime creates remain pending',async()=>{
  const {install,reconcileProtection}=await import('../scripts/demo/cloud-monitors.mjs');const s=state(),f=provider(s,{ineffective:true});
  await assert.rejects(install(s,f.api,f.save),/Effective/);assert.equal(s.verified,false);
  const pending={...state(),protection:{pending:true,id:null}};
  await assert.rejects(reconcileProtection(pending,{call:async()=>({data:[],meta:{page:{total_filtered_count:0}}})},async()=>assert.fail('must not save')));
  await assert.rejects(reconcileProtection(pending,{call:async()=>({data:[],meta:{page:{total_filtered_count:1}}})},async()=>assert.fail('must not save')),/Incomplete/);
  assert.equal(pending.protection.pending,true);
});
test('management transport fixes US3, bounds responses and never retries ambiguous mutations',async()=>{
  const {makeCloudApi}=await import('../scripts/demo/cloud-monitors.mjs');const {EventEmitter}=await import('node:events');
  const calls=[];
  const api=await makeCloudApi({apiKey:'A'.repeat(32),appKey:'B'.repeat(40)},(opts,done)=>{
    calls.push(opts);const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{
      const res=new EventEmitter();res.statusCode=302;done(res);queueMicrotask(()=>res.emit('end'));
    };return req;
  });
  await assert.rejects(api.call('POST','/api/v1/monitor',{}),/unknown/);assert.equal(calls.length,1);
  assert.equal(calls[0].hostname,'api.us3.datadoghq.com');
  assert.throws(()=>api.call('POST','https://other.test',{}));assert.equal(calls.length,1);
});

test('declared cloud contract matches executable tags/checks and cannot alter local definitions',async()=>{
  const {readFile}=await import('node:fs/promises');const {tags,checks}=await import('../scripts/demo/cloud-monitors.mjs');
  const spec=JSON.parse(await readFile(new URL('../deploy/datadog/cloud-monitors.json',import.meta.url),'utf8'));
  assert.equal(spec.site,'us3.datadoghq.com');assert.equal(spec.schema,1);assert.equal(spec.protection,'permanent-owner-downtime');
  assert.deepEqual(spec.tags,tags);assert.deepEqual(spec.checks,checks);
  assert.ok(definitions(owner).every(r=>!r.query.includes('local-demo')));
});
