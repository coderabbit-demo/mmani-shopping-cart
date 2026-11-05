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
