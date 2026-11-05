export const ACTIONS = Object.freeze(['mmani_create_jira', 'mmani_debug_pr']);
export function validateEnvelope(body, config) {
  if (!body || body.type !== 'block_actions' || body.api_app_id !== config.appId || body.team?.id !== 'T0AU433PG75' || body.channel?.id !== 'C0CEPB2LURY' || body.container?.channel_id !== 'C0CEPB2LURY' || body.message?.bot_id !== config.botId || body.container?.message_ts !== body.message?.ts || !/^\d+\.\d+$/.test(body.message?.ts || '')) throw new Error('unauthorized source');
  if (!Array.isArray(body.actions) || body.actions.length !== 1) throw new Error('invalid action');
  const action = body.actions[0];
  if (!ACTIONS.includes(action.action_id) || action.block_id !== 'mmani_incident_controls_v1' || !config.actors?.[action.action_id]?.includes(body.user?.id) || typeof action.value !== 'string' || Buffer.byteLength(action.value) > 2000) throw new Error('unauthorized action');
  const blocks = body.message.blocks;
  const controls = Array.isArray(blocks) ? blocks.filter(b => b.type === 'actions' && b.block_id === 'mmani_incident_controls_v1') : [];
  if (controls.length !== 1 || !Array.isArray(controls[0].elements) || controls[0].elements.length !== 2) throw new Error('invalid source card');
  const elements = controls[0].elements;
  if (ACTIONS.some(id => elements.filter(e => e.type === 'button' && e.action_id === id).length !== 1)) throw new Error('invalid card buttons');
  if (elements.find(e => e.action_id === action.action_id).value !== action.value) throw new Error('conflicting card action');
  return { action: action.action_id, value: action.value, elements, message: body.message, ts: body.message.ts, actor: body.user.id };
}
