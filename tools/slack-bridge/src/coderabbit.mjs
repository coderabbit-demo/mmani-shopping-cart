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
    await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
    let id=null, persisted=false;
    const prompt=`Normal Code task. First turn: plan only, make no changes until approved. Repository ${grant.repository}, branch ${grant.branch}, commit ${grant.commit}, base ${grant.base}. Allowed files: ${grant.allowedFiles.join(', ')}. Jira issue is the already verified episode issue. Preserve existing tests and goldens. No merge or deployment.`;
    try {
      const result=await this.adapter.create(prompt,async taskId=>{
        if (id!==null || !uuid.test(taskId)) throw new Error('invalid task identity');
        id=taskId; await this.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id}); persisted=true;
      },Math.min(grant.endsAt-this.now(),grant.minutes*60000));
      if (persisted) return 'plan_submitted';
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:result.kind==='prestart'?'prestart_failed':'unknown'});
      return result.kind==='prestart'?'prestart_failed':'unknown';
    } catch {
      if (persisted) return 'plan_submitted';
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:'unknown'}).catch(()=>{});
      return 'unknown';
    }
  }
  async recordPlan(episode,taskId,minutes) {
    const task=await this.state.call('getArtifact',{episode,kind:'task'});
    if (!task || task.remote_id!==taskId || task.state!=='known') throw new Error('task mismatch');
    await this.state.call('usage',{episode,minutes});
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
    await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
    const prompt='The approved human has accepted the plan. Implement only the approved scope, preserve tests and goldens, and report results. Do not merge or deploy.';
    let result; try { result=await this.adapter.resume(taskId,prompt,Math.min(grant.endsAt-this.now(),grant.minutes*60000)); } catch { result={kind:'unknown'}; }
    if (result.kind!=='complete') {
      await this.state.call('usage',{episode,minutes:null});
      await this.state.call('transition',{...ref,from:'dispatch_intent',to:result.kind==='prestart'?'prestart_failed':'unknown'});
      return result.kind==='prestart'?'prestart_failed':'unknown';
    }
    await this.state.call('usage',{episode,minutes:result.minutes});
    await this.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id:taskId});
    await this.state.call('transition',{...ref,from:'known',to:'confirmed'});
    return !Number.isFinite(result.minutes) || result.minutes<0 ? 'usage_unknown' : 'implementation_complete';
  }
}
export function verifyHandoff({pr,head,reviewHead,ciHead,securityHead,reviewPassed,ciPassed,securityPassed}) {
  if (!/^https:\/\/github\.com\/coderabbit-demo\/mmani-shopping-cart\/pull\/[1-9]\d*$/.test(pr || '') || !/^[a-f0-9]{40}$/.test(head || '') || reviewHead!==head || ciHead!==head || securityHead!==head || reviewPassed!==true || ciPassed!==true || securityPassed!==true) throw new Error('exact-head gates incomplete');
  return {status:'awaiting_native_verify',pr,head,location:'CodeRabbit native Verify UI'};
}
