import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { authenticate, AUTH_LIMITS } from '../tools/workflow-api/lib/auth.mjs';

const now = Date.parse('2026-11-06T12:00:00.000Z');
const token = randomBytes(32).toString('base64url');
const other = randomBytes(32).toString('base64url');
const entry = (value = token, actor = 'presenter-1') => ({ actor,
  sha256: createHash('sha256').update(value).digest('hex'), expiresAt: '2026-11-07T12:00:00.000Z' });
const headers = value => new Headers(value === null ? {} : { authorization: value });
const auth = (value = `Bearer ${token}`, entries = [entry()]) => authenticate(headers(value), JSON.stringify(entries), now);

test('authenticates only canonical 256-bit-or-longer bearer values and configured actors', () => {
  assert.equal(auth(), 'presenter-1');
  for (const value of [null, '', `bearer ${token}`, `Bearer  ${token}`, `Bearer ${token}, Bearer ${other}`, `Bearer ${other}`, `Bearer ${token}=`, 'Bearer short', `Bearer ${'a'.repeat(513)}`]) assert.equal(auth(value), null);
  const long = randomBytes(384).toString('base64url');
  assert.equal(long.length, AUTH_LIMITS.tokenBytes);
  assert.equal(auth(`Bearer ${long}`, [entry(long)]), 'presenter-1');
  const duplicateHeader = new Headers(); duplicateHeader.append('authorization', `Bearer ${token}`); duplicateHeader.append('authorization', `Bearer ${token}`);
  assert.equal(authenticate(duplicateHeader, JSON.stringify([entry()]), now), null);
});

test('strict bounded configuration rejects malformed shapes, duplicate actors/digests and dates', () => {
  for (const config of [undefined, '', '{', '{}', 'null', '[]', ' '.repeat(32769)]) assert.equal(authenticate(headers(`Bearer ${token}`), config, now), null);
  for (const entries of [[null], [entry(), entry(other)], [entry(), entry(token, 'presenter-2')],
    [{ ...entry(), actor: 'private@example.test' }], [{ ...entry(), actor: 'a'.repeat(65) }],
    [{ ...entry(), sha256: 'x'.repeat(64) }], [{ ...entry(), sha256: 'a'.repeat(63) }],
    [{ ...entry(), expiresAt: '2026-02-30T00:00:00.000Z' }], [{ ...entry(), expiresAt: '2026-11-07' }],
    [{ ...entry(), expiresAt: '2026-11-07T12:00:00+00:00' }], [{ ...entry(), extra: 'no' }],
    Array.from({ length: 129 }, (_, i) => entry(randomBytes(32).toString('base64url'), `actor-${i}`))]) assert.equal(auth(undefined, entries), null);
  const config = JSON.stringify([entry()]);
  assert.equal(authenticate(headers(`Bearer ${token}`), config.padEnd(32768), now), 'presenter-1');
  assert.equal(authenticate(headers(`Bearer ${token}`), config.padEnd(32769), now), null);
  assert.equal(authenticate(headers(`Bearer ${token}`), config, NaN), null);
});

test('expiry boundary and independent revocation preserve other authorized actors', () => {
  assert.equal(auth(undefined, [{ ...entry(), expiresAt: new Date(now).toISOString() }]), null);
  assert.equal(auth(undefined, [{ ...entry(), expiresAt: new Date(now - 1).toISOString() }]), null);
  assert.equal(auth(undefined, [{ ...entry(), expiresAt: new Date(now + 1).toISOString() }]), 'presenter-1');
  const entries = [entry(), entry(other, 'presenter-2')];
  assert.equal(auth(`Bearer ${other}`, entries), 'presenter-2');
  assert.equal(auth(undefined, entries.slice(1)), null);
  assert.equal(auth(`Bearer ${other}`, entries.slice(1)), 'presenter-2');
  const capacity = Array.from({ length: 127 }, (_, i) => entry(randomBytes(32).toString('base64url'), `actor-${i}`)).concat(entry(token, 'a'.repeat(64)));
  assert.equal(auth(undefined, capacity), 'a'.repeat(64));
});
