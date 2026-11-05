import { spawn } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export function executable(path) {
  if (!isAbsolute(path)) throw new Error('executable must be absolute');
  const real=realpathSync(path); const s=statSync(real);
  if (!s.isFile() || (s.mode & 0o111) === 0 || (s.mode & 0o022) !== 0) throw new Error('unsafe executable');
  return real;
}
export function run(path, args, {cwd, stdin='', timeout=20000, maxOutput=1048576, home=process.env.HOME, onLine=null}={}) {
  if (!isAbsolute(path) || !isAbsolute(cwd) || !Array.isArray(args) || args.some(v=>typeof v!=='string' || v.includes('\0')) || Buffer.byteLength(stdin)>65536) throw new Error('invalid process contract');
  return new Promise(resolve => {
    let child, out='', err='', started=false, ended=false, overflow=false, timedOut=false, killTimer, lineBuffer='', callbacks=Promise.resolve();
    const finish = result => { if (ended) return; ended=true; clearTimeout(timer); clearTimeout(killTimer); callbacks.then(()=>resolve(result),()=>resolve({kind:'unknown'})); };
    try { child=spawn(path,args,{cwd,env:{HOME:home,LANG:'C',PATH:'/usr/bin:/bin'},shell:false,stdio:['pipe','pipe','pipe']}); }
    catch { resolve({kind:'prestart'}); return; }
    const stop = () => { child.kill('SIGTERM'); killTimer=setTimeout(()=>child.kill('SIGKILL'),1000); };
    const timer=setTimeout(()=>{ timedOut=true; stop(); },timeout);
    child.on('spawn',()=>{started=true; child.stdin.end(stdin);});
    child.on('error',()=>finish({kind:started?'unknown':'prestart'}));
    child.stdin.on('error',()=>{});
    for (const [stream, which] of [[child.stdout,'out'],[child.stderr,'err']]) stream.on('data',chunk=>{ if (which==='out') { out+=chunk; if (onLine) { lineBuffer+=chunk; const lines=lineBuffer.split('\n'); lineBuffer=lines.pop(); for (const line of lines) callbacks=callbacks.then(()=>onLine(line)); } } else err+=chunk; if (Buffer.byteLength(out)+Buffer.byteLength(err)>maxOutput) { if (!overflow) { overflow=true; stop(); } } });
    child.on('close',(code,signal)=>finish(!overflow && !timedOut && code===0 && !signal ? {kind:'ok',stdout:out} : {kind:'unknown'}));
  });
}
export function object(result, command) {
  if (result.kind !== 'ok') throw new Error('process outcome unavailable');
  let data; try { data=JSON.parse(result.stdout); } catch { throw new Error('invalid process response'); }
  if (!data || Array.isArray(data) || data.ok === false || data.error || data.data?.ok === false || data.data?.error || data.apiVersion !== 'v2' || data.command !== command || data.meta?.acquisition?.omitted > 0 || data.meta?.acquisition?.truncated > 0 || data.meta?.acquisition?.failed > 0 || data.meta?.evidence?.truncation?.truncated === true || data.meta?.evidence?.coverage?.status === 'partial') throw new Error('invalid process response');
  return data;
}
