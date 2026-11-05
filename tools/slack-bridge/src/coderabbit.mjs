import { validateApproval } from './config.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Tasks {
  constructor({state,approval,source,adapter,now=Date.now}) { Object.assign(this,{state,approval,source,adapter,now}); }
  async start(card,actor) {
    let grant;
    try {
      grant=validateApproval(await this.approval(),this.now());
      if (actor!==grant.owner || !await this.source(grant)) throw new Error('source mismatch');
      await this.state.call('initBudget',{episode:card.episode,revision:grant.revision,cap:grant.minutes});
    } catch { return 'approval_required'; }
    const claim=await this.state.call('claim',{episode:card.episode,kind:'task'});
    if (!claim.acquired) return claim.artifact.state;
    const ref={episode:card.episode,kind:'task',fence:claim.artifact.fence};
    const deadline=Math.min(grant.endsAt,this.now()+Math.floor(grant.minutes*20000));
    try { await this.state.call('reserve',{episode:card.episode,stage:'plan',amount:grant.minutes/3,deadline}); } catch { await this.state.call('transition',{...ref,from:'claimed',to:'prestart_failed'}); return 'budget_blocked'; }
    await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
    let id=null, persisted=false;
    const prompt=`Normal Code task. First turn: plan only, make no changes until approved. Repository ${grant.repository}, branch ${grant.branch}, commit ${grant.commit}, base ${grant.base}. Allowed files: ${grant.allowedFiles.join(', ')}. Jira issue is the already verified episode issue. Preserve existing tests and goldens. No merge or deployment. ${grant.reviewMode==='fallback'?'Do not run a CLI review; one operator fallback review is reserved.':''}`;
    try {
      const result=await this.adapter.create(prompt,async taskId=>{
        if (id!==null || !uuid.test(taskId)) throw new Error('invalid task identity');
        id=taskId; await this.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id}); persisted=true;
      },Math.max(1,deadline-this.now()));
      if (persisted) return 'plan_submitted';
      await this.state.call('finishRun',{episode:card.episode,stage:'plan',minutes:result.kind==='prestart'?0:null});
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:result.kind==='prestart'?'prestart_failed':'unknown'});
      return result.kind==='prestart'?'prestart_failed':'unknown';
    } catch {
      if (persisted) return 'plan_submitted';
      await this.state.call('finishRun',{episode:card.episode,stage:'plan',minutes:result.kind==='prestart'?0:null});
      await this.state.call('finishRun',{episode:card.episode,stage:'plan',minutes:null}).catch(()=>{});
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:'unknown'}).catch(()=>{});
      return 'unknown';
    }
  }
  async cancelOnce(episode,stage,id) {
    const kind=`cancel-${stage}`; const claim=await this.state.call('claim',{episode,kind});
    if (!claim.acquired && claim.artifact.state!=='claimed') return 'cancel_unknown';
    const ref={episode,kind,fence:claim.artifact.fence};
    await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
    try { await this.adapter.cancel(id); } catch {}
    await this.state.call('transition',{...ref,from:'dispatch_intent',to:'unknown'});
    return 'cancel_unknown';
  }
  async planControl(card,taskId) {
    const grant=validateApproval(await this.approval(),this.now());
    return this.state.call('makeControl',{episode:card.episode,ts:card.ts,taskId,revision:grant.revision});
  }
  async recordPlan(episode,taskId,minutes) {
    const task=await this.state.call('getArtifact',{episode,kind:'task'});
    if (!task || task.remote_id!==taskId || task.state!=='known') throw new Error('task mismatch');
    await this.state.call('finishRun',{episode,stage:'plan',minutes});
    return this.state.call('transition',{episode,kind:'task',fence:task.fence,from:'known',to:'confirmed'});
  }
  async approveAndResume({episode,taskId,revision,actor}) {
    const grant=validateApproval(await this.approval(),this.now());
    if (actor!==grant.owner || revision!==grant.revision || !uuid.test(taskId) || !await this.source(grant)) throw new Error('approval mismatch');
    await this.state.call('initBudget',{episode,revision,cap:grant.minutes});
    await this.state.call('approval',{episode,revision,taskId});
    await this.state.call('consumeApproval',{episode,revision,taskId});
    const kind=`resume-${revision}`, claim=await this.state.call('claim',{episode,kind});
    if (!claim.acquired) return claim.artifact.state;
    const ref={episode,kind,fence:claim.artifact.fence};
    const deadline=Math.min(grant.endsAt,this.now()+Math.floor(grant.minutes*20000));
    try { await this.state.call('reserve',{episode,stage:'implementation',amount:grant.minutes/3,deadline}); } catch { await this.state.call('transition',{...ref,from:'claimed',to:'prestart_failed'}); return 'budget_blocked'; }
    await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
    const prompt='The approved human has accepted the plan. Implement only the approved scope, preserve tests and goldens, and report results. Do not merge or deploy.';
    let result; try { result=await this.adapter.resume(taskId,prompt,Math.max(1,deadline-this.now())); } catch { result={kind:'unknown'}; }
    if (result.kind!=='complete') {
      if (result.kind!=='prestart' && this.adapter.cancel) await this.cancelOnce(episode,'implementation',taskId);
      await this.state.call('finishRun',{episode,stage:'implementation',minutes:result.kind==='prestart'?0:null});
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:result.kind==='prestart'?'prestart_failed':'unknown'});
      return result.kind==='prestart'?'prestart_failed':'unknown';
    }
    await this.state.call('finishRun',{episode,stage:'implementation',minutes:result.minutes});
    await this.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id:taskId});
    await this.state.call('transition',{...ref,from:'known',to:'confirmed'});
    return !Number.isFinite(result.minutes) || result.minutes<0 ? 'usage_unknown' : 'implementation_complete';
  }
}
export function verifyHandoff({pr,head,reviewHead,ciHead,securityHead,reviewPassed,ciPassed,securityPassed}) {
  if (!/^https:\/\/github\.com\/coderabbit-demo\/mmani-shopping-cart\/pull\/[1-9]\d*$/.test(pr || '') || !/^[a-f0-9]{40}$/.test(head || '') || reviewHead!==head || ciHead!==head || securityHead!==head || reviewPassed!==true || ciPassed!==true || securityPassed!==true) throw new Error('exact-head gates incomplete');
  return {status:'awaiting_native_verify',pr,head,location:'CodeRabbit native Verify UI'};
}

export class CodeRabbitAdapter {
  constructor(invoke) { this.invoke=invoke; }
  async create(prompt,submitted,timeout) {
    let seen=false;
    const result=await this.invoke(['code','new','--agent','--access','manual','-'],{stdin:prompt,timeout,onLine:async line=>{
      let e; try { e=JSON.parse(line); } catch { return; }
      if (e.status==='task_submitted' && uuid.test(e.taskId || '') && !seen) { seen=true; await submitted(e.taskId); }
    }});
    if (result.kind==='prestart') return {kind:'prestart'};
    if (result.kind!=='ok') return {kind:'unknown'};
    return {kind:seen?'submitted':'unknown'};
  }
  async show(id,timeout=20000) {
    if (!uuid.test(id)) throw new Error('invalid task identity');
    const {events}=await import('./process.mjs'); const list=events(await this.invoke(['code','show','--agent',id],{timeout})); const e=list.at(-1);
    if (e.type!=='complete' || e.status!=='task_shown' || e.taskId!==id || !e.task) throw new Error('task status unknown');
    return e.task;
  }
  async resume(id,prompt,timeout) {
    if (!uuid.test(id)) throw new Error('invalid task identity');
    const {events}=await import('./process.mjs');
    const r=await this.invoke(['code','resume','--agent',id,'--message','-'],{stdin:prompt,timeout});
    if (r.kind==='prestart') return {kind:'prestart'};
    try { const list=events(r), sent=list.some(e=>e.status==='message_sent' && e.clientOperationId), end=list.at(-1);
      if (!sent || end.type!=='complete' || end.status!=='turn_completed' || end.taskId!==id || end.turn?.outcome!=='completed') throw new Error('uncertain continuation');
      return {kind:'complete',minutes:end.agentMinutes};
    } catch { return {kind:'unknown'}; }
  }
  async observe(id,timeout=20000) {
    if (!uuid.test(id)) throw new Error('invalid task identity');
    const {events}=await import('./process.mjs');
    try { const e=events(await this.invoke(['code','resume','--agent',id],{timeout})).at(-1); if (e.type!=='complete' || e.status!=='turn_completed' || e.taskId!==id || e.turn?.outcome!=='completed') throw new Error(); return {minutes:e.agentMinutes}; } catch { return null; }
  }
  async cancel(id) {
    if (!uuid.test(id)) throw new Error('invalid task identity');
    const {events}=await import('./process.mjs');
    try { const e=events(await this.invoke(['code','cancel','--agent',id])).at(-1); return e.type==='complete' && ['cancelled','cancel_pending'].includes(e.status) ? e.status : 'unknown'; } catch { return 'unknown'; }
  }
  async push(id) {
    if (!uuid.test(id)) throw new Error('invalid task identity');
    const {events}=await import('./process.mjs');
    try { const e=events(await this.invoke(['code','push','--agent',id])).at(-1); return e.type==='complete' && e.status==='push_completed' ? e : null; } catch { return null; }
  }
}

export class Supervisor {
  constructor({state,tasks,adapter,slack,now=Date.now}) { Object.assign(this,{state,tasks,adapter,slack,now}); this.busy=false; }
  async tick() {
    if (this.busy) return; this.busy=true;
    try {
      for (const run of await this.state.call('activeRuns')) {
        const task=await this.state.call('getArtifact',{episode:run.episode,kind:'task'});
        if (this.now()>=run.deadline) {
          if (run.stage!=='review' && task?.remote_id) await this.tasks.cancelOnce(run.episode,run.stage,task.remote_id);
          await this.state.call('finishRun',{episode:run.episode,stage:run.stage,minutes:null}).catch(()=>{});
          continue;
        }
        if (run.stage!=='plan' || !task?.remote_id || task.state!=='known') continue;
        let shown; try { shown=await this.adapter.show(task.remote_id,Math.max(1,Math.min(20000,run.deadline-this.now()))); } catch { continue; }
        if (shown.turnStatus!=='completed' || shown.cancellationPending!==false) continue;
        const observed=await this.adapter.observe(task.remote_id,Math.max(1,Math.min(20000,run.deadline-this.now())));
        if (!observed) continue;
        try {
          await this.tasks.recordPlan(run.episode,task.remote_id,observed.minutes);
          if (!Number.isFinite(observed.minutes)) continue;
          for (const raw of await this.state.call('cards')) if (raw.episode===run.episode) {
            const card=await this.state.call('getCard',{ts:raw.ts});
            await this.tasks.planControl(card,task.remote_id);
            const id=await this.state.call('enqueue',{episode:card.episode,ts:card.ts,status:'plan_ready'});
            try { await this.slack.status(card.ts,'plan_ready'); await this.state.call('delivered',{id}); } catch {}
          }
        } catch {}
      }
      for (const run of await this.state.call('pendingStops')) {
        const task=await this.state.call('getArtifact',{episode:run.episode,kind:'task'});
        if (!task?.remote_id) continue;
        try {
          const shown=await this.adapter.show(task.remote_id,5000);
          if (shown.cancellationPending===false && shown.turnStatus!=='in_progress' && shown.turnStatus) await this.state.call('stopped',{episode:run.episode,stage:run.stage});
        } catch {}
      }
      try { await this.slack.flush(); } catch {}
    } finally { this.busy=false; }
  }
}

export class Delivery {
  constructor({state,git,review,github,checks,approval,adapter,now=Date.now}) { Object.assign(this,{state,git,review,github,checks,approval,adapter,now}); }
  async verifyFiles(grant,head) {
    if (!/^[a-f0-9]{40}$/.test(head)) return false;
    if (!/^codex\/[A-Za-z0-9._/-]+$/.test(grant.deliveryBranch || '') || grant.deliveryBranch.includes('..') || grant.deliveryBranch.includes('//')) return false;
    const origin=await this.git(['remote','get-url','origin']);
    if (origin.kind!=='ok' || !['https://github.com/coderabbit-demo/mmani-shopping-cart.git','git@github.com:coderabbit-demo/mmani-shopping-cart.git'].includes(origin.stdout.trim())) return false;
    const remote=await this.git(['ls-remote','--heads','origin',`refs/heads/${grant.deliveryBranch}`,`refs/heads/${grant.baseBranch}`]);
    if (remote.kind!=='ok') return false;
    const refs=remote.stdout.trim().split('\n').map(row=>row.split('\t'));
    if (refs.length!==2 || !refs.some(([sha,ref])=>sha===head && ref===`refs/heads/${grant.deliveryBranch}`) || !refs.some(([sha,ref])=>sha===grant.base && ref===`refs/heads/${grant.baseBranch}`)) return false;
    const clean=await this.git(['status','--porcelain']); if(clean.kind!=='ok' || clean.stdout.trim()) return false;
    const actual=await this.git(['rev-parse','HEAD']);
    if (actual.kind!=='ok' || actual.stdout.trim()!==head) return false;
    const changes=await this.git(['diff','--name-only','--no-renames',grant.base,head,'--']);
    if (changes.kind!=='ok') return false;
    const paths=changes.stdout.trim().split('\n').filter(Boolean);
    if (!paths.length || paths.some(p=>!grant.allowedFiles.includes(p) || p==='package.json' || p==='package-lock.json' || p.startsWith('tests/golden/'))) return false;
    const protectedFiles=await this.git(['diff','--quiet',grant.base,head,'--','tests','scripts/golden','package.json','package-lock.json']);
    return protectedFiles.kind==='ok';
  }
  async deliver({episode,taskId}) {
    let grant; try { grant=validateApproval(await this.approval(),this.now()); } catch { return 'delivery_blocked'; }
    if (!grant.delivery || grant.reviewMode!=='fallback' || !this.adapter) return 'delivery_blocked';
    const continuation=await this.state.call('getArtifact',{episode,kind:`resume-${grant.revision}`});
    const tracked=await this.state.call('getArtifact',{episode,kind:'task'});
    const budget=await this.state.call('getBudget',{episode});
    if (tracked?.remote_id!==taskId || continuation?.state!=='confirmed' || !budget || budget.usage_unknown || budget.used>=budget.cap) return 'delivery_blocked';
    let task; try { task=await this.adapter.show(taskId); } catch { return 'delivery_blocked'; }
    const head=task.result?.commit;
    if (task.turnStatus!=='completed' || task.cancellationPending!==false || !/^[a-f0-9]{40}$/.test(head || '')) return 'delivery_blocked';
    if (task.delivery?.status!=='succeeded') {
      if (task.delivery?.status!=='ready' || !await (await import('./process.mjs')).verifySource(this.git,grant)) return 'delivery_blocked';
      const claim=await this.state.call('claim',{episode,kind:'push'});
      if (!claim.acquired) return 'push_reconcile_required';
      const ref={episode,kind:'push',fence:claim.artifact.fence}; await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
      const pushed=await this.adapter.push(taskId).catch(()=>null);
      if (!pushed) { await this.state.call('transition',{...ref,from:'dispatch_intent',to:'unknown'}); return 'push_reconcile_required'; }
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id:head});
      await this.state.call('transition',{...ref,from:'known',to:'confirmed'});
    }
    return this.publish({episode,taskId,head});
  }
  async publish({episode,taskId,head}) {
    const grant=validateApproval(await this.approval(),this.now());
    if (grant.delivery!==true || grant.reviewMode!=='fallback' || !/^[-A-Za-z0-9._/]+$/.test(grant.baseBranch || '') || grant.baseBranch.startsWith('-') || grant.baseBranch.includes('..') || grant.baseBranch.includes('//') || !/^https:\/\/github\.com\/coderabbit-demo\/mmani-shopping-cart\/issues\/[1-9]\d*$/.test(grant.issueUrl || '') || !uuid.test(taskId)) return 'delivery_blocked';
    const task=await this.state.call('getArtifact',{episode,kind:'task'});
    const continuation=await this.state.call('getArtifact',{episode,kind:`resume-${grant.revision}`});
    const budget=await this.state.call('getBudget',{episode});
    if (!task || task.remote_id!==taskId || task.state!=='confirmed' || continuation?.state!=='confirmed' || !budget || budget.usage_unknown || budget.used>=budget.cap || !this.adapter) return 'delivery_blocked';
    let shown; try { shown=await this.adapter.show(taskId); } catch { return 'delivery_blocked'; }
    if (shown.turnStatus!=='completed' || shown.cancellationPending!==false || shown.result?.commit!==head || shown.delivery?.status!=='succeeded' || !await this.verifyFiles(grant,head)) return 'delivery_blocked';
    const reviewClaim=await this.state.call('claim',{episode,kind:'review'}); let review=reviewClaim.artifact;
    if (reviewClaim.acquired) {
      const ref={episode,kind:'review',fence:review.fence};
      await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
      const start=this.now(), deadline=Math.min(grant.endsAt,start+Math.floor(grant.minutes*20000));
      try { await this.state.call('reserve',{episode,stage:'review',amount:grant.minutes/3,deadline}); } catch { await this.state.call('transition',{...ref,from:'dispatch_intent',to:'unknown'}); return 'review_reconcile_required'; }
      let result; try { result=await this.review(grant.base,head,Math.max(1,deadline-start)); } catch { result={kind:'unknown'}; }
      await this.state.call('finishRun',{episode,stage:'review',minutes:result.kind==='complete'?Math.max(0,(this.now()-start)/60000):null});
      if (result.kind!=='complete' || result.head!==head || result.base!==grant.base || result.findings!==0) { await this.state.call('transition',{...ref,from:'dispatch_intent',to:'unknown'}); return 'review_reconcile_required'; }
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id:head});
      review=await this.state.call('transition',{...ref,from:'known',to:'confirmed'});
    }
    if (review.state!=='confirmed' || review.remote_id!==head) return 'review_reconcile_required';
    let refreshed; try { refreshed=validateApproval(await this.approval(),this.now()); } catch { return 'delivery_blocked'; }
    if (refreshed.revision!==grant.revision) return 'delivery_blocked';
    const claim=await this.state.call('claim',{episode,kind:'pr'}); let pr=claim.artifact;
    if (claim.acquired) {
      const ref={episode,kind:'pr',fence:claim.artifact.fence};
      await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
      let created; try { created=await this.github.create(grant,head); } catch { created=null; }
      if (!/^https:\/\/github\.com\/coderabbit-demo\/mmani-shopping-cart\/pull\/[1-9]\d*$/.test(created || '')) { await this.state.call('transition',{...ref,from:'dispatch_intent',to:'unknown'}); return 'pr_reconcile_required'; }
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id:head,key:created});
      pr=await this.state.call('transition',{...ref,from:'known',to:'confirmed'});
    }
    if (pr.state!=='confirmed' || pr.remote_id!==head) return 'pr_reconcile_required';
    if (!await this.checks(pr.remote_key,head,grant)) return 'awaiting_exact_head_checks';
    const handoff=verifyHandoff({pr:pr.remote_key,head,reviewHead:head,ciHead:head,securityHead:head,reviewPassed:true,ciPassed:true,securityPassed:true});
    await this.state.call('setHandoff',{episode,pr:handoff.pr,head:handoff.head});
    return handoff;
  }
}
export function reviewAdapter(invoke) {
  return async(base,head,timeout=900000)=>{
    const {events}=await import('./process.mjs');
    try {
      const list=events(await invoke(['review','--agent','--committed','--base-commit',base,'--gate','major'],{timeout}));
      const last=list.at(-1), findings=list.filter(e=>e.type==='finding').length;
      if (last.type!=='complete' || last.status!=='review_completed' || !['completed','completed_with_warnings'].includes(last.outcome) || last.unreviewedFileCount!==0 || last.reused===true) return {kind:'unknown'};
      return {kind:'complete',base,head,findings};
    } catch { return {kind:'unknown'}; }
  };
}
export function githubAdapter(invoke) {
  return {async create(grant,head) {
    if (!/^codex\/[A-Za-z0-9._/-]+$/.test(grant.deliveryBranch || '') || grant.deliveryBranch.includes('..') || !/^[a-f0-9]{40}$/.test(head)) throw new Error('invalid PR input');
    const r=await invoke(['pr','create','--repo','coderabbit-demo/mmani-shopping-cart','--base',grant.baseBranch,'--head',grant.deliveryBranch,'--title','DeskDrop incident fix','--body','-'],{stdin:`Fixes ${grant.issueUrl}\n\nCodeRabbit-authored incident fix.\n`});
    if (r.kind!=='ok') return null; return r.stdout.trim();
  }};
}

export function checksAdapter(gh,strict) {
  return async(pr,head,grant)=>{
    const match=/^https:\/\/github\.com\/coderabbit-demo\/mmani-shopping-cart\/pull\/([1-9]\d*)$/.exec(pr || '');
    if (!match || !/^[a-f0-9]{40}$/.test(head || '')) return false;
    const read=()=>gh(['api',`repos/coderabbit-demo/mmani-shopping-cart/pulls/${match[1]}`,'--jq','[.head.sha,.base.sha,.base.ref,.head.ref,.head.repo.full_name,.base.repo.full_name] | @json']);
    const matches=r=>{ if(r.kind!=='ok') return false; try { const v=JSON.parse(r.stdout); return Array.isArray(v) && v[0]===head && v[1]===grant.base && v[2]===grant.baseBranch && v[3]===grant.deliveryBranch && v[4]==='coderabbit-demo/mmani-shopping-cart' && v[5]==='coderabbit-demo/mmani-shopping-cart'; } catch { return false; } };
    try {
      const before=await read(); if (!matches(before)) return false;
      const gate=await strict([match[1]]); if (gate.kind!=='ok') return false;
      const after=await read(); return matches(after);
    } catch { return false; }
  };
}
