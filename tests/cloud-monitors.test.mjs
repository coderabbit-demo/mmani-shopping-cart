import test from 'node:test';
import os from 'node:os';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, chmod, link, unlink, writeFile, rm } from 'node:fs/promises';
import { ownerTag, selector, definitions, owned, inventory, Journal, reconcile } from '../scripts/demo/cloud-monitors.mjs';

const owner = `cloud_owner:${'a'.repeat(32)}`;
const state = () => ({ schema: 1, owner, monitors: [], pending: null });
const row = (id = 123) => ({ ...definitions(owner)[0], id });
test('cloud selectors cannot target the local installation', () => {
  assert.match(ownerTag(), /^cloud_owner:[a-f0-9]{32}$/);
  assert.throws(() => selector(`local_owner:${'a'.repeat(32)}`));
  assert.equal(new Set(selector(owner)).size, 6);
  for (const m of definitions(owner)) {
    assert.match(m.query, /deskdrop.cloud/); assert.ok(m.query.includes(owner));
    assert.ok(m.tags.includes('host:deskdrop-demo'));
    assert.throws(() => owned({ ...m, id: 29524290 }, m));
    assert.throws(() => owned({ ...m, id: 123, tags: selector(ownerTag()) }, m));
    assert.equal(owned({ ...m, id: 123 }, m), 123);
  }
});
test('inventory rejects repeated IDs and changed pagination', async () => {
  await assert.rejects(inventory(async () => [row(), row()]));
  let count = 0;
  await assert.rejects(inventory(async () => [row(++count)]));
  assert.deepEqual(await inventory(async () => [row()]), [row()]);
});
test('unknown create is reconciled without creating again; ambiguous matches block', async () => {
  const s = state(); s.pending = { kind: 'create', name: row().name };
  let saves = 0;
  await assert.rejects(reconcile(s, { list: async () => [], get: async () => row() }, async () => saves++));
  assert.equal(s.pending.kind, 'create'); assert.equal(saves, 0);
  await assert.rejects(reconcile(s, { list: async () => [row(), row(124)], get: async id => row(id) }, async () => saves++));
  await reconcile(s, { list: async () => [row()], get: async () => row() }, async () => saves++);
  assert.equal(saves, 1); assert.deepEqual(s.monitors, [{ id: 123, name: row().name }]); assert.equal(s.pending, null);
});
test('unknown delete retains intent until absence is confirmed', async () => {
  const s = state(); s.monitors = [{ id: 123, name: row().name }]; s.pending = { kind: 'delete', id: 123, name: row().name };
  await assert.rejects(reconcile(s, { list: async () => [row()], get: async () => row() }, async () => {}));
  await reconcile(s, { list: async () => [], get: async () => assert.fail('missing monitor must not be fetched') }, async () => {});
  assert.deepEqual(s.monitors, []); assert.equal(s.pending, null);
});
test('protected journal rejects links, permissions, corruption and concurrent lock', async () => {
  const dir = await mkdtemp(`${os.homedir()}/deskdrop-journal-`); const journal = new Journal(dir, process.getuid());
  try {
    await journal.save(state()); assert.deepEqual(await journal.read(), state());
    const file = `${dir}/installation.json`;
    await link(file, `${dir}/alias`); await assert.rejects(journal.read()); await unlink(`${dir}/alias`);
    await chmod(file, 0o644); await assert.rejects(journal.read()); await chmod(file, 0o600);
    await writeFile(file, '{bad'); await assert.rejects(journal.read()); await assert.rejects(journal.save(state())); await unlink(file); await journal.save(state());
    await journal.locked(async () => { await assert.rejects(journal.locked(async () => assert.fail('second lock acquired'))); });
    await chmod(dir, 0o755); await assert.rejects(journal.read());
  } finally { await rm(dir, { recursive: true, force: true }); }
});
