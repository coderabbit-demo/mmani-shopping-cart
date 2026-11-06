export const limits = Object.freeze({ alert: 180000, recovery: 360000, operation: 10000 });

export async function attempt(operation, milliseconds) {
  if (milliseconds <= 0) return { confirmed: false };
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)).then(value => ({ confirmed: value === true })).catch(() => ({ confirmed: false })),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ confirmed: false }); }, milliseconds); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}

// The caller holds the installation execution lock until adapter cleanup is confirmed.
export async function recover(adapter, store, { now = Date.now } = {}) {
  const record = await store.load();
  if (!record || !/^[a-f0-9-]{36}$/.test(record.run ?? '') || !['admitted', 'recovering', 'uncertain'].includes(record.phase)) throw new Error('Recovery receipt invalid');
  const started = now();
  const deadline = started + limits.recovery;
  const result = { run: record.run, started, deadline, suppression: false, app: false, health: false, released: false, fenced: false };
  const save = async () => store.save({ ...record, phase: 'recovering', recovery: { ...result } });
  const call = async (name, operation, cap = limits.operation) => {
    await store.intent({ run: record.run, operation: name, deadline });
    return (await attempt(operation, Math.min(cap, Math.max(0, deadline - now())))).confirmed;
  };
  await save();
  result.suppression = await call('restore-suppression', signal => adapter.protect(record, signal));
  await save();
  // The adapter validates exact owned app/source on every restoration, independently of provider health.
  result.app = await call('restore-app', signal => adapter.restoreApp(record, signal), 30000);
  await save();
  result.fenced = await call('fence-outstanding', signal => adapter.fence(record, signal));
  if (result.fenced) {
    result.health = await call('verify-health-source', signal => adapter.verify(record, signal));
    result.suppression = await call('verify-suppression', signal => adapter.suppressed(record, signal));
    if (result.app && result.health && result.suppression) result.released = await call('release-reservation', signal => adapter.release(record, signal));
  }
  const complete = result.app && result.health && result.suppression && result.fenced && result.released;
  await store.save({ ...record, phase: complete ? 'complete' : 'uncertain', recovery: { ...result } });
  return { ...result, outcome: complete ? 'restored' : 'reconciliation-required' };
}
