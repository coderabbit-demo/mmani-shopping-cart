import { sendDatadog } from '../lib/datadog.mjs';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../lib/auth.mjs';
import { sourceIdentity, emitEvent } from '../lib/telemetry.mjs';

const messages = { 400: 'Invalid request', 401: 'Unauthorized', 405: 'Method not allowed',
  413: 'Request body not allowed', 431: 'Request headers too large', 500: 'Internal error', 503: 'Unavailable' };
function response(status, data, headers = {}) {
  return Response.json(data ?? { error: messages[status] }, { status, headers: {
    'Cache-Control': 'no-store, max-age=0', 'Vercel-CDN-Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}

export function createHandler({ environment = () => process.env, write = line => console.log(line),
  fetch: fetchImpl = globalThis.fetch, clock } = {}) {
  return async function health(request) {
    let actor, env;
    try {
      let bytes = 0, count = 0;
      for (const [name, value] of request.headers) {
        bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
        if (++count > 32 || bytes > 8192) return response(431);
      }
      env = environment();
      actor = authenticate(request.headers, env.WORKFLOW_API_AUTH_JSON);
    } catch { return response(401); }
    if (!actor) return response(401);
    let requestId, source;
    try {
      if (Buffer.byteLength(request.url) > 2048) return response(400);
      let url;
      try { url = new URL(request.url); } catch { return response(400); }
      if (url.pathname !== '/api/health' || url.search || url.hash || url.username || url.password) return response(400);
      if (request.method !== 'GET') return response(405, undefined, { Allow: 'GET' });
      const length = request.headers.get('content-length');
      if ((length !== null && length !== '0') || request.headers.has('transfer-encoding') || request.body !== null) {
        try { if (request.body) void request.body.cancel().catch(() => {}); } catch {}
        return response(413);
      }
      source = sourceIdentity(env);
      if (!source) return response(503);
      requestId = randomUUID();
      const event = emitEvent(write, { requestId, actor, source });
      let accepted = false;
      try { accepted = await sendDatadog(event, { apiKey: env.WORKFLOW_DD_API_KEY, fetch: fetchImpl, clock }); } catch {}
      if (!accepted) return response(503);
      return response(200, { status: 'ok', requestId, source });
    } catch {
      requestId ??= randomUUID();
      try { emitEvent(write, { requestId, actor, source, failed: true }); } catch {}
      return response(500);
    }
  };
}

export default { fetch: createHandler() };
