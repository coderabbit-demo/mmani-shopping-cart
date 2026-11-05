import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { bounds, target, directory, readState, writeState, exclusive, supervisorLease, validateReceipt, bounded } from './trigger-alert.mjs';
import { loadCredentials, controlRequest, inspectTriggerRuntime, ownedAvailability, runCommand, recoverTriggerApp } from './local.mjs';
import { makeApi, monitorDefinitions, ownedMonitor, idDowntime, verifyDowntime, fixedTags, ownerPattern } from './datadog-monitors.mjs';
import { readFile } from 'node:fs/promises';

export function routeIdentity(rule, owner) {
  const a = rule?.data?.attributes;
  const tags = [...fixedTags, owner];
  return rule?.data?.id === target.rule && a?.name === 'DeskDrop local demo to CodeRabbit MMANI' && JSON.stringify(a.recipients) === JSON.stringify([target.recipient]) && Object.keys(a.filter ?? {}).join(',') === 'tags' && Array.isArray(a.filter.tags) && a.filter.tags.length === tags.length && tags.every(t => a.filter.tags.includes(t));
}
export function healthyController(s, now = Date.now()) {
  return s?.triggerProtocol === 1 && s.journeyBlocked === false && s.checks?.telemetry === 'sent' && ['availability', 'checkout'].every(n => s.checks[n]?.status === 0 && Number.isSafeInteger(s.checks[n].time) && now >= s.checks[n].time && now - s.checks[n].time <= 60000);
}
export function groupState(m) {
  const groups = m?.state?.groups;
  if (!groups || Object.keys(groups).length !== 1 || !groups['host:deskdrop-mmani-local']) throw new Error('Monitor group unknown');
  return groups['host:deskdrop-mmani-local'];
}
export async function production(recover = false) {
  if (process.platform !== 'darwin') throw new Error('Mac required');
  const api = makeApi(await loadCredentials());
  const definitions = JSON.parse(await readFile(new URL('../../deploy/datadog/local-monitors.json', import.meta.url), 'utf8'));
  const state = await readState(directory, 'monitors.json');
  if (!ownerPattern.test(state.owner ?? '') || state.pending || state.transition || state.tagDowntime || state.monitors?.length !== 3) throw new Error('Monitor reconciliation required');
  const wanted = monitorDefinitions(definitions, state.owner);
  let snapshot = JSON.stringify(state);
  async function verify(recovery = false, replacement) {
    const current = await readState(directory, 'monitors.json');
    if (JSON.stringify(current) !== snapshot) throw new Error('Monitor journal changed');
    for (let i = 0; i < wanted.length; i++) {
      const entry = state.monitors.find(e => e.name === wanted[i].name);
      if (entry?.id !== [target.availability, target.checkout, target.heartbeat][i]) throw new Error('Monitor target changed');
      ownedMonitor(await api.getMonitor(entry.id), wanted[i]);
      if (recovery && entry.id === target.checkout) {
        const matches = await api.matches(entry.id);
        if (matches.some(id => id !== entry.downtime && id !== replacement)) throw new Error('Unexpected suppression');
      }
      if (!recovery || entry.id !== target.checkout) {
        if (verifyDowntime(await api.getDowntime(entry.downtime), idDowntime(entry.id)) !== entry.downtime) throw new Error('Suppression changed');
        const matches = await api.matches(entry.id);
        if (matches.length !== 1 || matches[0] !== entry.downtime) throw new Error('Unexpected suppression');
      }
    }
    if (!routeIdentity(await api.getNotificationRule(), state.owner)) throw new Error('Routing identity changed');
  }
  let status;
  try { status = await controlRequest('status', directory, bounds.control); } catch (e) { if (!recover) throw e; const receipt = validateReceipt(await readState(directory, 'trigger.json')); status = { commit: receipt.identity.commit }; }
  const { ctx, owned } = await inspectTriggerRuntime(status.commit);
  const app = owned.find(x => x.Config.Labels['com.docker.compose.service'] === 'app');
  const identity = { checkout: target.checkout, commit: status.commit, appImageId: ctx.ids.app, appContainer: app?.Id, owner: state.owner, toolingCommit: (await runCommand('git', ['rev-parse', 'HEAD'])).toString().trim() };
  const entry = state.monitors.find(e => e.id === target.checkout);
  return {
    identity, oldDowntime: entry?.downtime,
    async baseline() {
      await verify();
      if (!healthyController(status) || status.appImageId !== ctx.ids.app || !owned.every(x => x.State.Running) || !owned.some(x => x.Config.Labels['com.docker.compose.service'] === 'agent' && x.State.Health?.Status === 'healthy') || !await ownedAvailability(ctx)) throw new Error('Runtime unhealthy');
      const m = await api.getMonitor(target.checkout);
      if (m.overall_state !== 'OK' || groupState(m).status !== 'OK') throw new Error('Fresh healthy group required');
      // The reviewed tag-only rule exposes no transition restriction.
      throw new Error('Effective Alert-only delivery unverified');
    },
    verify,
    reserve: run => controlRequest(`trigger:reserve:${run}`, directory, bounds.control),
    cancel: id => api.cancelDowntime(id),
    canceled: async id => { const d = await api.getDowntime(id); return d?.data?.id === id && d.data.attributes.status === 'canceled'; },
    stop: run => controlRequest(`trigger:stop:${run}`, directory, bounds.control),
    restart: run => controlRequest(`trigger:restart:${run}`, directory, bounds.control),
    fallback: () => recoverTriggerApp(identity),
    release: run => controlRequest(`trigger:release:${run}`, directory, bounds.control),
    async monitor() { const m = await api.getMonitor(target.checkout); ownedMonitor(m, wanted[1]); return groupState(m); },
    async create(run) { const spec = idDowntime(target.checkout); spec.data.attributes.message = `DeskDrop checkout recovery ${run}`; return (await api.createDowntime(spec))?.data?.id; },
    async protection(id) {
      const record = await api.getDowntime(id);
      if (record?.data?.id === id && record.data.attributes?.monitor_identifier?.monitor_id === target.checkout && record.data.attributes?.status === 'canceled') return false;
      return verifyDowntime(record, idDowntime(target.checkout)) === id && (await api.matches(target.checkout)).includes(id);
    },
    async reconcileCreate(run) {
      const found = [];
      for (const id of await api.matches(target.checkout)) {
        const d = await api.getDowntime(id);
        if (d?.data?.attributes?.message === `DeskDrop checkout recovery ${run}`) { verifyDowntime(d, idDowntime(target.checkout)); found.push(id); }
      }
      if (found.length !== 1) throw new Error('Create reconciliation ambiguous');
      return found[0];
    },
    async replace(id) { await verify(true, id); const next = structuredClone(state); next.monitors.find(e => e.id === target.checkout).downtime = id; await writeState(directory, 'monitors.json', next); Object.assign(state, next); snapshot = JSON.stringify(state); },
    async localHealthy() { return healthyController(await controlRequest('status', directory, bounds.control)) && await ownedAvailability(ctx); }
  };
}
export async function inspectProduction() {
  const blockers = [];
  try { const a = await bounded(() => production(), bounds.prepare); await bounded(() => a.baseline(), bounds.prepare); }
  catch { blockers.push('Runtime, ownership or suppression readiness not confirmed'); }
  blockers.push('Effective Alert-only delivery unverified; separate routing verification required');
  return { status: 'blocked', target, bounds, blockers, events: 'unavailable' };
}

export async function rehearse(a, store, { now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), interrupted = () => false, accepted = () => {}, recover = false } = {}) {
  let r;
  const save = async phase => { r.phase = phase; await store.save(r); };
  let phaseEnd = Infinity;
  const call = (fn, limit = bounds.request) => bounded(fn, Math.min(limit, Math.max(1, Math.min(r.deadline, phaseEnd) - now())));
  if (recover) {
    r = validateReceipt(await store.load());
    if (JSON.stringify(r.identity) !== JSON.stringify(a.identity)) throw new Error('Recovery identity changed');
    accepted(r.run);
    if (r.phase === 'complete') return r;
  } else {
    try { const prior = await store.load(); if (validateReceipt(prior).phase !== 'complete') throw new Error('Previous rehearsal unresolved'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    await bounded(() => a.baseline(), bounds.prepare);
    const started = now();
    r = { version: 1, run: randomUUID(), identity: a.identity, oldDowntime: a.oldDowntime, phase: 'armed', started, deadline: started + bounds.recovery };
    await store.save(r);
    await call(() => a.reserve(r.run), bounds.control);
    accepted(r.run);
    try {
      await call(() => a.verify());
      if (interrupted()) throw new Error('Recovery requested');
      await save('cancel');
      r.cancelIntent = true; await store.save(r);
      await call(() => a.cancel(r.oldDowntime));
      if (!await call(() => a.canceled(r.oldDowntime))) throw new Error('Cancellation unknown');
      r.canceled = true;
      if (interrupted()) throw new Error('Recovery requested');
      await save('stop');
      r.stopIntent = true; await store.save(r);
      await call(() => a.stop(r.run), bounds.control);
      await save('observe');
      while (!interrupted() && now() < started + bounds.alert) {
        await call(() => a.verify(true));
        const group = await call(() => a.monitor());
        if (group.status === 'Alert' && Number.isFinite(group.last_triggered_ts) && group.last_triggered_ts * 1000 >= started) { r.alertObserved = true; break; }
        await sleep(Math.min(bounds.poll, Math.max(0, started + bounds.alert - now())));
      }
    } catch { r.failure = 'Fault outcome requires reconciliation'; }
  }
  let protectedOk = false, appOk = false;
  const protectionEnd = Math.min(r.deadline, now() + bounds.protection);
  phaseEnd = protectionEnd;
  try {
    await save('protect');
    if (!r.cancelIntent || await call(() => a.protection(r.oldDowntime))) protectedOk = true;
    else {
      await call(() => a.verify(true));
      if (!r.canceled) {
        if (!await call(() => a.canceled(r.oldDowntime))) throw new Error('Cancellation still unknown');
        r.canceled = true; await store.save(r);
      }
      if (!r.createIntent) {
        r.createIntent = true; await store.save(r);
        r.newDowntime = await call(() => a.create(r.run));
        if (typeof r.newDowntime !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(r.newDowntime) || r.newDowntime === r.oldDowntime) throw new Error('Create unknown');
        await store.save(r);
      }
      if (!r.newDowntime && a.reconcileCreate) { r.newDowntime = await call(() => a.reconcileCreate(r.run)); await store.save(r); }
      if (!r.newDowntime) throw new Error('Create outcome unknown; do not retry');
      while (now() < protectionEnd) {
        if (await call(() => a.protection(r.newDowntime))) { await call(() => a.replace(r.newDowntime)); protectedOk = true; break; }
        await sleep(Math.min(1000, Math.max(0, protectionEnd - now())));
      }
    }
  } catch { r.failure = 'Suppression unconfirmed'; }
  phaseEnd = Math.min(r.deadline, now() + bounds.restart);
  try {
    await save('restart');
    if (r.stopIntent) {
      if (!r.restartIntent) { r.restartIntent = true; await store.save(r); try { await call(() => a.restart(r.run), bounds.control); } catch { await call(() => a.fallback(), bounds.control); } }
      else await call(() => a.fallback(), bounds.control);
    }
    phaseEnd = r.deadline;
    await save('verify');
    while (now() < r.deadline) {
      if (await call(() => a.localHealthy()) && (await call(() => a.monitor())).status === 'OK') { await call(() => a.verify()); appOk = true; break; }
      await sleep(Math.min(bounds.poll, Math.max(0, r.deadline - now())));
    }
  } catch { r.failure = 'App recovery unconfirmed'; }
  r.protected = protectedOk; r.recovered = appOk;
  await save(protectedOk && appOk ? 'complete' : 'uncertain');
  if (r.phase === 'complete') { try { await call(() => a.release(r.run), bounds.control); } catch { await save('uncertain'); } }
  return r;
}
export async function supervisorSession(action, channel = process) {
  let stop = false;
  const interrupt = () => { stop = true; };
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP', 'disconnect']) channel.on(name, interrupt);
  try { return await action({ interrupted: () => stop, accepted: run => channel.send?.({ status: 'accepted', run }) }); }
  finally { for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP', 'disconnect']) channel.removeListener(name, interrupt); }
}
export async function supervise(command) {
  if (!['run', 'recover'].includes(command)) throw new Error('Invalid supervisor command');
  return supervisorSession(options => supervisorLease(directory, command === 'recover', async () => {
    const a = await production(command === 'recover');
    return rehearse(a, { load: () => readState(directory, 'trigger.json'), save: r => writeState(directory, 'trigger.json', r) }, { ...options, recover: command === 'recover' });
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) supervise(process.argv[2]).then(r => { process.send?.({ status: r.phase, run: r.run }); if (process.connected) process.disconnect(); }, () => { process.send?.({ status: 'blocked' }); if (process.connected) process.disconnect(); process.exitCode = 1; });
