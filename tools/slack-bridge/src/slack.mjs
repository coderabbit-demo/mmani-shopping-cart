import { ACTIONS } from './cards.mjs';

export function render(card,status,control=null) {
  const label=card.synthetic ? '[TEST synthetic]' : '[Unverified alert]';
  const elements=ACTIONS.map((id,index)=>({type:'button',text:{type:'plain_text',text:index===0?'Create Jira Ticket':'Debug and Create PR'},action_id:id,value:index===0?card.jira_handle:card.debug_handle}));
  const blocks=[{type:'section',text:{type:'plain_text',text:`${label} DeskDrop monitor ${card.monitor}`}},{type:'context',elements:[{type:'plain_text',text:`Status: ${status}`} ]},{type:'actions',block_id:'mmani_incident_controls_v1',elements}];
  if (control) blocks.push({type:'actions',block_id:'mmani_plan_approval_v1',elements:[{type:'button',text:{type:'plain_text',text:'Approve plan'},action_id:'mmani_approve_plan',value:control.handle}]});
  return blocks;
}
export function slackAdapter(client,state) {
  async function update(card,status) { const control=await state.call('controlForCard',{ts:card.ts}); await client.chat.update({channel:'C0CEPB2LURY',ts:card.ts,text:'DeskDrop incident action status',blocks:render(card,status,control)}); }
  return {
    async bind(message,card) { await update(card,'registered'); },
    async status(ts,status) {
      const card=await state.call('getCard',{ts}); if (!card) throw new Error('unknown card');
      await update(card,status);
    },
    async flush() { for (const entry of await state.call('pending')) { const card=await state.call('getCard',{ts:entry.ts}); if (!card) continue; await update(card,entry.status); await state.call('delivered',{id:entry.id}); } }
  };
}
