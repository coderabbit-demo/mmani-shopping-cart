import { ACTIONS } from './cards.mjs';

export function render(card,status) {
  const label=card.synthetic ? '[TEST synthetic]' : '[Unverified alert]';
  const elements=ACTIONS.map((id,index)=>({type:'button',text:{type:'plain_text',text:index===0?'Create Jira Ticket':'Debug and Create PR'},action_id:id,value:index===0?card.jira_handle:card.debug_handle}));
  return [{type:'section',text:{type:'plain_text',text:`${label} DeskDrop monitor ${card.monitor}`}},{type:'context',elements:[{type:'plain_text',text:`Status: ${status}`} ]},{type:'actions',block_id:'mmani_incident_controls_v1',elements}];
}
export function slackAdapter(client,state) {
  async function update(card,status) { await client.chat.update({channel:'C0CEPB2LURY',ts:card.ts,text:'DeskDrop incident action status',blocks:render(card,status)}); }
  return {
    async bind(message,card) { await update(card,'registered'); },
    async status(ts,status) {
      const card=await state.call('getCard',{ts}); if (!card) throw new Error('unknown card');
      await update(card,status);
    },
    async flush() { for (const entry of await state.call('pending')) { const card=await state.call('getCard',{ts:entry.ts}); if (!card) continue; await update(card,entry.status); await state.call('delivered',{id:entry.id}); } }
  };
}
