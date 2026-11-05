import { createHash } from 'node:crypto';
import { validateEnvelope, validateApprovalEnvelope, ACTIONS } from './cards.mjs';
import { parseIncident } from './incidents.mjs';

export class Actions {
  constructor({state, config, monitor, jira, slack, task, delivery=null, now=Date.now}) { Object.assign(this,{state,config,monitor,jira,slack,task,delivery,now}); }
  async receive(body, ack) {
    await ack();
    try { return await this.handle(body); }
    catch { return {status:'blocked'}; }
  }
  async approve(body,ack) {
    await ack();
    try {
      const click=validateApprovalEnvelope(body,this.config);
      if (this.now()<this.config.actionStart || this.now()>=this.config.actionEnd) throw new Error('action window closed');
      const control=await this.state.call('getControl',{handle:click.handle,ts:click.ts});
      if (!control || !this.task) throw new Error('unknown approval');
      const card=await this.state.call('getCard',{ts:click.ts});
      if (!card || card.episode!==control.episode) throw new Error('card mismatch');
      await this.monitor(card.monitor);
      const result=await this.task.approveAndResume({episode:control.episode,taskId:control.task_id,revision:control.revision,actor:click.actor});
      if (result==='implementation_complete' && this.delivery) {
        const delivered=await this.delivery.deliver({episode:control.episode,taskId:control.task_id});
        if (typeof delivered==='object' && delivered.status==='awaiting_native_verify') return this.status(card,`awaiting_native_verify ${delivered.pr} ${delivered.head}`);
        return this.status(card,delivered);
      }
      return this.status(card,result);
    } catch { return {status:'blocked'}; }
  }
  async handle(body) {
    const card=validateEnvelope(body,this.config);
    const now=this.now();
    if (!Number.isFinite(this.config.actionStart) || !Number.isFinite(this.config.actionEnd) || now<this.config.actionStart || now>=this.config.actionEnd) throw new Error('action window closed');
    let bound;
    if (/^[a-f0-9]{64}$/.test(card.value)) {
      bound=await this.state.call('resolve',{ts:card.ts,action:card.action,handle:card.value});
      if (card.elements.find(x=>x.action_id===ACTIONS[0]).value!==bound.jira_handle || card.elements.find(x=>x.action_id===ACTIONS[1]).value!==bound.debug_handle) throw new Error('card binding mismatch');
      await this.monitor(bound.monitor);
    } else {
      if (card.elements.some(e=>e.value!==card.value)) throw new Error('conflicting card values');
      const incident=parseIncident(card.value,this.now());
      await this.monitor(incident.monitor);
      const digest=createHash('sha256').update(card.value).digest('hex');
      bound=await this.state.call('bootstrap',{incident,ts:card.ts,digest});
      bound={...bound,monitor:incident.monitor,synthetic:Number(incident.test)};
      await this.slack.bind(card.message,bound);
    }
    if (!bound.actionable) return this.status(bound,'non_actionable');
    const jira=await this.ensureJira(bound);
    if (jira.state!=='confirmed') return this.status(bound,jira.state);
    if (card.action===ACTIONS[1]) {
      if (!this.task) return this.status(bound,'approval_required');
      const task=await this.task.start(bound,card.actor);
      return this.status(bound,task);
    }
    return this.status(bound,'jira_confirmed');
  }
  async status(card,status) {
    const id=await this.state.call('enqueue',{episode:card.episode,ts:card.ts,status});
    try { await this.slack.status(card.ts,status); await this.state.call('delivered',{id}); } catch { /* queued for later delivery */ }
    return {status};
  }
  async ensureJira(card) {
    const claim=await this.state.call('claim',{episode:card.episode,kind:'jira'});
    let artifact=claim.artifact;
    if (!claim.acquired) {
      if (artifact.state==='known') return this.verifyJira(card,artifact);
      return artifact;
    }
    const ref={episode:card.episode,kind:'jira',fence:artifact.fence};
    try {
      await this.jira.metadata();
      const found=await this.jira.lookup(`deskdrop-bridge-${card.episode}`);
      if (found) {
        artifact=await this.state.call('transition',{...ref,from:'claimed',to:'known',id:found.id,key:found.key});
        return this.verifyJira(card,artifact);
      }
    } catch {
      return this.state.call('transition',{...ref,from:'claimed',to:'prestart_failed'});
    }
    await this.state.call('transition',{...ref,from:'claimed',to:'dispatch_intent'});
    let created;
    try { created=await this.jira.create({episode:card.episode,monitor:card.monitor,synthetic:!!card.synthetic}); }
    catch { created={kind:'unknown'}; }
    if (created.kind!=='known') return this.state.call('transition',{...ref,from:'dispatch_intent',to:created.kind==='prestart'?'prestart_failed':'unknown'});
    artifact=await this.state.call('transition',{...ref,from:'dispatch_intent',to:'known',id:created.id,key:created.key});
    return this.verifyJira(card,artifact);
  }
  async reconcileJira(body,id,key) {
    const card=validateEnvelope(body,this.config);
    const now=this.now();
    if (now<this.config.actionStart || now>=this.config.actionEnd) throw new Error('action window closed');
    const bound=await this.state.call('resolve',{ts:card.ts,action:card.action,handle:card.value});
    if (card.elements.find(x=>x.action_id===ACTIONS[0]).value!==bound.jira_handle || card.elements.find(x=>x.action_id===ACTIONS[1]).value!==bound.debug_handle) throw new Error('card binding mismatch');
    await this.monitor(bound.monitor);
    const artifact=await this.state.call('getArtifact',{episode:bound.episode,kind:'jira'});
    if (!artifact || artifact.state!=='unknown') throw new Error('reconciliation unavailable');
    await this.jira.get(key,id,`deskdrop-bridge-${bound.episode}`);
    const ref={episode:bound.episode,kind:'jira',fence:artifact.fence};
    await this.state.call('transition',{...ref,from:'unknown',to:'known',id,key});
    return this.state.call('transition',{...ref,from:'known',to:'confirmed'});
  }
  async verifyJira(card,artifact) {
    try {
      await this.jira.get(artifact.remote_key,artifact.remote_id,`deskdrop-bridge-${card.episode}`);
      return await this.state.call('transition',{episode:card.episode,kind:'jira',fence:artifact.fence,from:'known',to:'confirmed'});
    } catch { return artifact; }
  }
}
