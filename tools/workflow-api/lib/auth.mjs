import { createHash, timingSafeEqual } from 'node:crypto';

export const AUTH_LIMITS = Object.freeze({ configBytes: 32768, entries: 128, tokenBytes: 512 });
const actorPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export function authenticate(headers, configuration, now = Date.now()) {
  try {
    if (typeof configuration !== 'string' || Buffer.byteLength(configuration) > AUTH_LIMITS.configBytes || !Number.isFinite(now)) return null;
    const entries = JSON.parse(configuration);
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > AUTH_LIMITS.entries) return null;
    const actors = new Set(), digests = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).sort().join(',') !== 'actor,expiresAt,sha256') return null;
      if (typeof entry.actor !== 'string' || !actorPattern.test(entry.actor) || actors.has(entry.actor)) return null;
      if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || digests.has(entry.sha256)) return null;
      if (typeof entry.expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(entry.expiresAt)) return null;
      const expiry = Date.parse(entry.expiresAt);
      if (!Number.isFinite(expiry) || new Date(expiry).toISOString() !== entry.expiresAt) return null;
      actors.add(entry.actor); digests.add(entry.sha256);
    }
    const authorization = headers.get('authorization');
    if (typeof authorization !== 'string' || authorization.length > AUTH_LIMITS.tokenBytes + 7) return null;
    const match = /^Bearer ([A-Za-z0-9_-]{43,512})$/.exec(authorization);
    if (!match) return null;
    const token = match[1];
    const decoded = Buffer.from(token, 'base64url');
    if (decoded.length < 32 || decoded.toString('base64url') !== token) return null;
    const digest = createHash('sha256').update(token).digest();
    let actor = null;
    for (const entry of entries) {
      const matches = timingSafeEqual(digest, Buffer.from(entry.sha256, 'hex'));
      if (matches && Date.parse(entry.expiresAt) > now) actor = entry.actor;
    }
    return actor;
  } catch {
    return null;
  }
}
