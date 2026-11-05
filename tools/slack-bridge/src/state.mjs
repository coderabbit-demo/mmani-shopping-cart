import { Worker } from 'node:worker_threads';
import { openSync,closeSync,writeFileSync,constants } from 'node:fs';
import { privateHome } from './config.mjs';
export class State {
  constructor(root,{initialize=false}={}) {
    const {db,marker}=privateHome(root,initialize);
    if (initialize) {
      const fd=openSync(db,constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,0o600); closeSync(fd);
      const mark=openSync(marker,constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,0o600); try { writeFileSync(mark,'deskdrop-state-v1\n'); } finally { closeSync(mark); }
    }
    this.worker = new Worker(new URL('./state-worker.mjs', import.meta.url), { workerData:{path:db,initialize} });
    this.next = 0; this.pending = new Map(); this.closed = false;
    this.worker.on('message', ({id,value,error}) => { const item=this.pending.get(id); if (!item) return; this.pending.delete(id); error ? item.reject(new Error(error)) : item.resolve(value); });
    const fail = () => { this.closed = true; for (const p of this.pending.values()) p.reject(new Error('state worker unavailable')); this.pending.clear(); };
    this.worker.on('error', fail); this.worker.on('exit', fail);
  }
  call(op,args={}) { return new Promise((resolve,reject) => { if (this.closed) { reject(new Error('state worker unavailable')); return; } const id=++this.next; this.pending.set(id,{resolve,reject}); this.worker.postMessage({id,op,args}); }); }
  async close() { await this.call('close'); await this.worker.terminate(); }
}
