import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export function executable(path) {
  if (!isAbsolute(path)) throw new Error('executable must be absolute');
  const real=realpathSync(path); const s=statSync(real);
  if (!s.isFile() || (s.mode & 0o111) === 0 || (s.mode & 0o022) !== 0) throw new Error('unsafe executable');
  return real;
}
export function run(path, args, {cwd, stdin='', timeout=20000, maxOutput=1048576, home=process.env.HOME, path:commandPath='/usr/bin:/bin', onLine=null}={}) {
  if (!isAbsolute(path) || !isAbsolute(cwd) || !Array.isArray(args) || args.some(v=>typeof v!=='string' || v.includes('\0')) || Buffer.byteLength(stdin)>65536) throw new Error('invalid process contract');
  return new Promise(resolve => {
    let child, out='', err='', started=false, ended=false, overflow=false, timedOut=false, killTimer, lineBuffer='', callbacks=Promise.resolve();
    const finish = result => { if (ended) return; ended=true; clearTimeout(timer); clearTimeout(killTimer); callbacks.then(()=>resolve(result),()=>resolve({kind:'unknown'})); };
    try { child=spawn(path,args,{cwd,env:{HOME:home,LANG:'C',PATH:commandPath},shell:false,stdio:['pipe','pipe','pipe']}); }
    catch { resolve({kind:'prestart'}); return; }
    const stop = () => { child.kill('SIGTERM'); killTimer=setTimeout(()=>child.kill('SIGKILL'),1000); };
    const timer=setTimeout(()=>{ timedOut=true; stop(); },timeout);
    child.on('spawn',()=>{started=true; child.stdin.end(stdin);});
    child.on('error',()=>finish({kind:started?'unknown':'prestart'}));
    child.stdin.on('error',()=>{});
    for (const [stream, which] of [[child.stdout,'out'],[child.stderr,'err']]) stream.on('data',chunk=>{ if (which==='out') { out+=chunk; if (onLine) { lineBuffer+=chunk; const lines=lineBuffer.split('\n'); lineBuffer=lines.pop(); for (const line of lines) callbacks=callbacks.then(()=>onLine(line)); } } else err+=chunk; if (Buffer.byteLength(out)+Buffer.byteLength(err)>maxOutput) { if (!overflow) { overflow=true; stop(); } } });
    child.on('close',(code,signal)=>{ if(onLine && lineBuffer) { const rest=lineBuffer; lineBuffer=''; callbacks=callbacks.then(()=>onLine(rest)); } finish(!overflow && !timedOut && code===0 && !signal ? {kind:'ok',stdout:out} : {kind:'unknown',exitCode:code,...(overflow?{}:{stdout:out})}); });
  });
}
export function object(result, command) {
  if (result.kind !== 'ok') throw new Error('process outcome unavailable');
  let data; try { data=JSON.parse(result.stdout); } catch { throw new Error('invalid process response'); }
  if (!data || Array.isArray(data) || data.ok === false || data.error || data.data?.ok === false || data.data?.error || data.apiVersion !== 'v2' || data.command !== command || data.meta?.acquisition?.omitted > 0 || data.meta?.acquisition?.truncated > 0 || data.meta?.acquisition?.failed > 0 || data.meta?.evidence?.truncation?.truncated === true || data.meta?.evidence?.coverage?.status === 'partial') throw new Error('invalid process response');
  return data;
}

export function fixedProcess(path,cwd,options={}) {
  const binary=executable(path);
  if (!isAbsolute(cwd) || !statSync(cwd).isDirectory()) throw new Error('invalid working directory');
  return (args,extra={})=>run(binary,args,{cwd,...options,...extra});
}
export function events(result) {
  if (result.kind!=='ok' || typeof result.stdout!=='string') throw new Error('CLI outcome unknown');
  const lines=result.stdout.split('\n').filter(Boolean);
  if (!lines.length) throw new Error('empty CLI response');
  try { return lines.map(line=>JSON.parse(line)); } catch { throw new Error('invalid CLI response'); }
}
export async function verifySource(git,grant) {
  if (!/^[-A-Za-z0-9._/]+$/.test(grant.baseBranch || '') || grant.baseBranch.startsWith('-') || grant.baseBranch.includes('..') || grant.baseBranch.includes('//')) return false;
  async function read(args) { const r=await git(args); if(r.kind!=='ok') throw new Error('git preflight failed'); return r.stdout.trim(); }
  try {
    const url=await read(['remote','get-url','origin']);
    if (!['https://github.com/coderabbit-demo/mmani-shopping-cart.git','git@github.com:coderabbit-demo/mmani-shopping-cart.git'].includes(url)) return false;
    if (await read(['branch','--show-current'])!==grant.branch || await read(['rev-parse','HEAD'])!==grant.commit || await read(['status','--porcelain'])!=='') return false;
    const remote=await read(['ls-remote','--heads','origin',`refs/heads/${grant.branch}`,`refs/heads/${grant.baseBranch}`]);
    const rows=remote.split('\n').map(line=>line.split('\t'));
    return rows.length===2 && rows.some(([sha,ref])=>sha===grant.commit && ref===`refs/heads/${grant.branch}`) && rows.some(([sha,ref])=>sha===grant.base && ref===`refs/heads/${grant.baseBranch}`);
  } catch { return false; }
}

export async function prepareCheckout({git,gitPath,ghPath,bashPath,codePath,root,grant,head,authoredBranch,makeProcess=fixedProcess,reopenOnly=false}) {
  const {join}=await import('node:path'); const {existsSync}=await import('node:fs');
  const {privatePath}=await import('./config.mjs'); privatePath(root,true);
  if (!/^[a-f0-9]{40}$/.test(head) || !/^coderabbit\/[A-Za-z0-9._/-]+$/.test(authoredBranch) || authoredBranch.includes('..') || !/^codex\/[A-Za-z0-9._/-]+$/.test(grant.deliveryBranch || '') || grant.deliveryBranch.includes('..') || grant.deliveryBranch===grant.branch || grant.deliveryBranch===grant.baseBranch) throw new Error('invalid checkout identity');
  const must=async args=>{const r=await git(args); if(r.kind!=='ok') throw new Error('checkout unavailable'); return r.stdout.trim();};
  const origin=await must(['remote','get-url','origin']); if(!['https://github.com/coderabbit-demo/mmani-shopping-cart.git','git@github.com:coderabbit-demo/mmani-shopping-cart.git'].includes(origin)) throw new Error('origin mismatch');
  const refs=await must(['ls-remote','--heads','origin',`refs/heads/${authoredBranch}`,`refs/heads/${grant.baseBranch}`]);
  if(!refs.split('\n').includes(`${head}\trefs/heads/${authoredBranch}`) || !refs.split('\n').includes(`${grant.base}\trefs/heads/${grant.baseBranch}`)) throw new Error('remote identity mismatch');
  if(!reopenOnly) await must(['fetch','--no-tags','origin',`refs/heads/${authoredBranch}`]);
  await must(['merge-base','--is-ancestor',grant.base,head]);
  const dir=join(root,`delivery-${grant.revision}`);
  if (!existsSync(dir)) { if(reopenOnly) throw new Error('existing checkout unavailable'); await must(['worktree','add','--detach',dir,head]); }
  const commandPath=[(await import('node:path')).dirname(executable(process.execPath)),(await import('node:path')).dirname(executable(ghPath)),'/usr/bin','/bin'].join(':');
  const local=makeProcess(gitPath,dir,{path:commandPath});
  for(const [args,expected] of [[['rev-parse','HEAD'],head],[['status','--porcelain'],'']]) { const r=await local(args); if(r.kind!=='ok' || r.stdout.trim()!==expected) throw new Error('checkout mismatch'); }
  const names=await local(['diff','--name-only','--no-renames',grant.base,head,'--']);
  if(names.kind!=='ok' || names.stdout.trim().split('\n').some(p=>!grant.allowedFiles.includes(p))) throw new Error('scope mismatch');
  const current=await local(['branch','--show-current']);
  if(current.kind!=='ok') throw new Error('branch unavailable');
  if(reopenOnly && current.stdout.trim()!==grant.deliveryBranch) throw new Error('delivery checkout mismatch');
  if(!current.stdout.trim()) { const r=await local(['checkout','-b',grant.deliveryBranch]); if(r.kind!=='ok') throw new Error('delivery branch exists; reconcile'); }
  else if(current.stdout.trim()!==grant.deliveryBranch) throw new Error('branch mismatch');
  const remote=await local(['ls-remote','--heads','origin',`refs/heads/${grant.deliveryBranch}`]); if(remote.kind!=='ok' || (remote.stdout.trim() && remote.stdout.trim()!==`${head}\trefs/heads/${grant.deliveryBranch}`)) throw new Error('existing delivery branch differs');
  const protectedDiff=await local(['diff','--quiet',grant.base,head,'--','tests/golden','scripts/golden','package.json','package-lock.json']); if(protectedDiff.kind!=='ok') throw new Error('protected changes');
  const regression=await local(['diff','--numstat',grant.base,head,'--','tests']); if(regression.kind!=='ok' || regression.stdout.trim().split('\n').filter(Boolean).some(row=>row.split('\t')[1]!=='0')) throw new Error('existing assertions removed');
  if(!reopenOnly) { const pushed=await local(['push','origin',`HEAD:refs/heads/${grant.deliveryBranch}`]); if(pushed.kind!=='ok') throw new Error('push requires reconciliation'); }
  const gh=makeProcess(ghPath,dir,{path:commandPath}), bash=makeProcess(bashPath,dir,{path:commandPath}), code=makeProcess(codePath,dir,{path:commandPath});
  return {git:local,gh,bash,code,dir};
}
