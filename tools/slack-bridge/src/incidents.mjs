import { createHash } from 'node:crypto';

export const MONITORS = Object.freeze(['29524154', '29524290', '29524292']);
const keys = ['v', 'monitor', 'event', 'cycle', 'transition', 'at', 'scope', 'host', 'alertTitle', 'eventTitle', 'type'];
const identity = /^[A-Za-z0-9_.:-]+$/;
const clean = s => typeof s === 'string' && !/[\u0000-\u001f\u007f]|\$[A-Z_]+/.test(s);

export function parseIncident(raw, now = Date.now()) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 2000) throw new Error('invalid incident size');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('invalid incident JSON'); }
  if (!data || Array.isArray(data) || Object.keys(data).join(',') !== keys.join(',') || JSON.stringify(data) !== raw || data.v !== 1) throw new Error('noncanonical incident');
  for (const key of keys.slice(1)) if (!clean(data[key])) throw new Error('invalid incident field');
  if (!MONITORS.includes(data.monitor) || !identity.test(data.event) || data.event.length > 128 || !identity.test(data.cycle) || data.cycle.length > 128) throw new Error('invalid native identity');
  if (!data.scope || data.scope.length > 512 || data.host !== 'deskdrop-mmani-local' || !data.alertTitle || data.alertTitle.length > 512 || !data.eventTitle || data.eventTitle.length > 512 || !data.type || data.type.length > 128 || data.transition.length > 64) throw new Error('invalid native evidence');
  if (!/^\d{10,11}$/.test(data.at)) throw new Error('invalid native timestamp');
  const millis = Number(data.at) * 1000;
  if (!Number.isSafeInteger(millis) || millis > now + 300000 || millis < now - 86400000) throw new Error('stale native timestamp');
  const test = /\[TEST\]/i.test(data.alertTitle) || /\[TEST\]/i.test(data.eventTitle);
  const episode = createHash('sha256').update(JSON.stringify(['us3', data.monitor, data.host, 'local-demo', 'deskdrop', data.cycle])).digest('hex');
  return { ...data, test, episode, actionable: data.transition === 'Triggered' };
}

export function validateMonitor(monitor, expected, incident) {
  if (!monitor || String(monitor.id) !== incident.monitor || !expected || typeof expected.query !== 'string' || !expected.query || !expected.owner || monitor.query !== expected.query) throw new Error('monitor ownership mismatch');
  const tags = new Set(monitor.tags || []);
  for (const tag of ['service:deskdrop', 'env:local-demo', 'demo_id:mmani-shopping-cart-local', ...expected.tags]) if (!tags.has(tag)) throw new Error('monitor scope mismatch');
  if (monitor.creator?.handle !== expected.owner) throw new Error('monitor owner mismatch');
  const scopes=monitor.query.match(/\{[^{}]*\}/g) || [];
  const serviceCheck=/^"[A-Za-z0-9_.-]+"\.over\(("[^"\\\r\n]*"(?:\s*,\s*"[^"\\\r\n]*")*)\)\.by\("host"\)\.last\([1-9][0-9]*\)\.count_by_status\(\)$/.exec(monitor.query);
  let serviceHost=false;
  if(serviceCheck) {
    const terms=JSON.parse(`[${serviceCheck[1]}]`);
    serviceHost=terms.length===new Set(terms).size && terms.every(t=>/^[a-z_]+:[A-Za-z0-9_.-]+$/.test(t)) && terms.filter(t=>t.startsWith('host:')).length===1 && terms.includes('host:deskdrop-mmani-local') && ['service:deskdrop','env:local-demo','demo_id:mmani-shopping-cart-local'].every(t=>terms.includes(t));
  }
  if (!serviceHost && (monitor.query.includes('.over(') || !scopes.some(scope => !/\bOR\b/i.test(scope) && /(?:^|,|\bAND\s+)\s*host:deskdrop-mmani-local\s*(?=$|,|\s+AND\b)/i.test(scope.slice(1,-1))))) throw new Error('monitor host query mismatch');
  return true;
}

export async function readMonitor(id, expected, credentials, fetcher=fetch) {
  if (!MONITORS.includes(id) || !credentials || typeof credentials.apiKey !== 'string' || typeof credentials.appKey !== 'string') throw new Error('monitor preflight unavailable');
  const response=await fetcher(`https://api.us3.datadoghq.com/api/v1/monitor/${id}`,{method:'GET',redirect:'error',headers:{'DD-API-KEY':credentials.apiKey,'DD-APPLICATION-KEY':credentials.appKey},signal:AbortSignal.timeout(5000)});
  if (!response.ok || !response.body) throw new Error('monitor preflight unavailable');
  const reader=response.body.getReader(); let size=0; const chunks=[];
  try { for (;;) { const {value,done}=await reader.read(); if(done) break; size+=value.length; if(size>262144) throw new Error('monitor response too large'); chunks.push(value); } } finally { await reader.cancel().catch(()=>{}); }
  let monitor; try { monitor=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('invalid monitor response'); }
  validateMonitor(monitor,expected,{monitor:id});
  return true;
}
