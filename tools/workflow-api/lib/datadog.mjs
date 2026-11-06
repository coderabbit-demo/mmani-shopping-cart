import { PROJECT, PROJECT_ID } from './telemetry.mjs';

const ENDPOINT = 'https://http-intake.logs.us3.datadoghq.com/api/v2/logs';
const DEADLINE_MS = 2000;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === expected.split(',').sort().join(',');
const text = (value, pattern) => typeof value === 'string' && pattern.test(value);

function payload(event) {
  if (!keys(event, 'schemaVersion,timestamp,service,project,level,event,status,requestId,actor,source') ||
      event.schemaVersion !== 1 || event.service !== 'workflow-api' || event.project !== PROJECT ||
      event.level !== 'info' || event.event !== 'health_checked' || event.status !== 200 ||
      !text(event.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/) ||
      !Number.isFinite(Date.parse(event.timestamp)) ||
      !text(event.requestId, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/) ||
      !text(event.actor, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)) return null;
  const source = event.source;
  if (!keys(source, 'project,projectId,environment,deploymentId,commit') || source.project !== PROJECT ||
      source.projectId !== PROJECT_ID || source.environment !== 'preview' ||
      !text(source.deploymentId, /^dpl_[a-zA-Z0-9]{1,100}$/) || !text(source.commit, /^[a-f0-9]{40}$/)) return null;
  const body = JSON.stringify([{ schemaVersion: 1, timestamp: event.timestamp,
    service: 'workflow-api', site: 'us3', message: 'health_checked', status: 'info',
    event: 'health_checked', http: { status_code: 200 }, requestId: event.requestId, actor: event.actor,
    source: { project: PROJECT, projectId: PROJECT_ID, environment: 'preview',
      deploymentId: source.deploymentId, commit: source.commit } }]);
  return Buffer.byteLength(body) <= 2048 ? body : null;
}

export async function sendDatadog(event, { apiKey, fetch: fetchImpl = globalThis.fetch,
  clock = { setTimeout, clearTimeout } } = {}) {
  let body;
  try {
    if (!text(apiKey, /^[a-fA-F0-9]{32}$/) || !(body = payload(event))) return false;
  } catch { return false; }
  const controller = new AbortController();
  let expired = false, timer;
  const timeout = new Promise(resolve => {
    timer = clock.setTimeout(() => { expired = true; controller.abort(); resolve(false); }, DEADLINE_MS);
  });
  const attempt = (async () => {
    try {
      const result = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'DD-API-KEY': apiKey }, body, signal: controller.signal });
      const accepted = result.status === 200 || result.status === 202;
      if (result.body) await result.body.cancel();
      return !expired && accepted;
    } catch { return false; }
  })();
  try { return await Promise.race([attempt, timeout]); }
  finally { clock.clearTimeout(timer); controller.abort(); }
}
