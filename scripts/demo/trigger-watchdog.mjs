import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { bounds, target, directory, readState, writeState, supervisorLease, validateReceipt, bounded, evidence, confirmedControl } from './trigger-alert.mjs';
import { loadCredentials, controlRequest, inspectTriggerRuntime, ownedAvailability, runCommand, recoverTriggerApp, runtimeOperation } from './local.mjs';
import { makeApi, monitorDefinitions, ownedMonitor, idDowntime, verifyDowntime, fixedTags, ownerPattern } from './datadog-monitors.mjs';
import { readFile } from 'node:fs/promises';

export function routeIdentity(rule, owner) {
  const a = rule?.data?.attributes;
  const tags = [...fixedTags, owner];
  return rule?.data?.id === target.rule && a?.name === 'DeskDrop local demo to CodeRabbit MMANI' && (JSON.stringify(a.recipients) === JSON.stringify([target.recipient]) || (a.conditional_recipients?.conditions?.length === 1 && JSON.stringify(a.conditional_recipients.conditions[0]?.recipients) === JSON.stringify([target.recipient]))) && Object.keys(a.filter ?? {}).join(',') === 'tags' && Array.isArray(a.filter.tags) && a.filter.tags.length === tags.length && tags.every(t => a.filter.tags.includes(t));
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const emptyOptional = value => value === undefined || (Array.isArray(value) && value.length === 0);
export function alertOnlyRule(rule, owner) {
  return routeIdentity(rule, owner) && alertOnlyDelivery(rule);
}
function alertOnlyDelivery(rule) {
  const a = rule.data.attributes, c = a.conditional_recipients;
  if (rule.data.type !== undefined && rule.data.type !== 'monitor-notification-rule') return false;
  if (Object.keys(a).some(k => !['name', 'filter', 'recipients', 'conditional_recipients', 'created', 'modified', 'created_at', 'modified_at', 'rule_options'].includes(k))) return false;
  if (!emptyOptional(a.recipients) || !object(c) || Object.keys(c).some(k => !['conditions', 'fallback_recipients'].includes(k)) || !emptyOptional(c.fallback_recipients)) return false;
  if (a.rule_options !== undefined && (!object(a.rule_options) || Object.keys(a.rule_options).join(',') !== 'is_threaded' || a.rule_options.is_threaded !== false)) return false;
  if (!Array.isArray(c.conditions) || c.conditions.length !== 1) return false;
  const condition = c.conditions[0];
  return object(condition) && Object.keys(condition).sort().join(',') === 'recipients,scope' && condition.scope === 'transition_type:is_alert' && JSON.stringify(condition.recipients) === JSON.stringify([target.recipient]);
}
const routeError = () => { throw new Error('Notification rule filter unverified'); };
function scopePredicate(scope) {
  if (typeof scope !== 'string' || !scope.trim() || scope.length > 3000) return routeError();
  const tokens = [];
  const lex = /\s+|"[^"\\\x00-\x1f]*"|[():]|[A-Za-z0-9_.*\/-]+/gy;
  let at = 0;
  while (at < scope.length) {
    lex.lastIndex = at;
    const match = lex.exec(scope);
    if (!match) return routeError();
    at = lex.lastIndex;
    if (!/^\s+$/.test(match[0])) tokens.push({text:match[0], start:match.index, end:at});
    if (tokens.length > 512) return routeError();
  }
  let i = 0;
  const peek = () => tokens[i]?.text;
  function atom(key, depth) {
    if (depth > 32) return routeError();
    if (peek() === 'NOT') {i++; const value = atom(key, depth + 1); return tags => !value(tags);}
    if (peek() === '(') {
      i++; const value = expression(key, depth + 1);
      if (peek() !== ')') return routeError();
      i++; return value;
    }
    if (!key) {
      key = peek();
      if (!/^[a-z][a-z0-9_.-]*$/.test(key ?? '') || tokens[i+1]?.text !== ':') return routeError();
      i += 2;
      if (peek() === '(') return atom(key, depth + 1);
    }
    const value = peek();
    if (!value || ['AND','OR','NOT','(',')',':'].includes(value)) return routeError();
    i++;
    const quoted = value.startsWith('"'), literal = quoted ? value.slice(1,-1) : value;
    if (!literal || literal.includes('?') || literal.includes('*') && (quoted || literal !== '*')) return routeError();
    return tags => literal === '*' ? tags.has(key) : tags.get(key)?.has(literal) === true;
  }
  function expression(key, depth) {
    const values = [atom(key, depth)]; let operator;
    while (i < tokens.length && peek() !== ')') {
      let next = peek();
      if (next === 'AND' || next === 'OR') i++;
      else {
        if (tokens[i].start === tokens[i-1]?.end) return routeError();
        next = 'AND';
      }
      if (operator && operator !== next) return routeError();
      operator = next; values.push(atom(key, depth));
    }
    return tags => operator === 'OR' ? values.some(fn => fn(tags)) : values.every(fn => fn(tags));
  }
  const predicate = expression(undefined, 0);
  if (i !== tokens.length) return routeError();
  return predicate;
}
function tagset(tags) {
  if (!Array.isArray(tags) || tags.length > 128) return routeError();
  const result = new Map();
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.length > 3000 || /[\x00-\x1f]/.test(tag)) return routeError();
    const colon = tag.indexOf(':'), key = tag.slice(0,colon), value = tag.slice(colon+1);
    if (colon < 1 || !/^[a-z][a-z0-9_.-]*$/.test(key) || !value) return routeError();
    if (!result.has(key)) result.set(key, new Set());
    result.get(key).add(value);
  }
  return result;
}
export function notificationMatches(filter, candidates) {
  if (!object(filter) || Object.keys(filter).length !== 1 || !Array.isArray(candidates) || candidates.length < 1 || candidates.length > 2) return routeError();
  let predicate;
  if (Object.hasOwn(filter, 'scope')) predicate = scopePredicate(filter.scope);
  else if (Object.hasOwn(filter, 'tags')) {
    const required = tagset(filter.tags);
    if (filter.tags.some(tag => /[*?]/.test(tag))) return routeError();
    predicate = tags => [...required].every(([key, values]) => [...values].every(value => tags.get(key)?.has(value)));
  } else return routeError();
  const sets = candidates.map(tagset);
  return sets.some(predicate);
}
export function effectiveRoutes(rule, rules, monitor, owner) {
  if (!alertOnlyRule(rule, owner)) throw new Error('Effective Alert-only delivery unverified');
  groupState(monitor);
  if (!Array.isArray(rules) || rules.length > 1000 || new Set(rules.map(r => r?.id)).size !== rules.length) throw new Error('Notification rule coverage incomplete');
  const listed = rules.find(r => r?.id === target.rule);
  if (!listed || !isDeepStrictEqual(listed, rule.data)) throw new Error('Notification rule coverage inconsistent');
  const candidates = [monitor.tags, [...monitor.tags, `host:${target.host}`]];
  for (const item of rules) {
    if (!object(item) || typeof item.id !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(item.id) || Object.keys(item).some(k => !['id','type','attributes','relationships'].includes(k)) || (item.type !== undefined && item.type !== 'monitor-notification-rule') || !object(item.attributes)) throw new Error('Notification rule coverage incomplete');
    if (notificationMatches(item.attributes.filter, candidates) && !alertOnlyDelivery({data:item})) throw new Error('Effective Alert-only delivery unverified');
  }
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
  return productionAdapter({
    site: target.site, api: makeApi(await loadCredentials()),
    definitions: JSON.parse(await readFile(new URL('../../deploy/datadog/local-monitors.json', import.meta.url), 'utf8')),
    read: name => readState(directory, name), write: (name, value) => writeState(directory, name, value),
    control: command => controlRequest(command, directory, bounds.control),
    runtime: inspectTriggerRuntime, operation: expected => runtimeOperation(directory, expected),
    availability: ownedAvailability, tooling: async () => (await runCommand('git', ['rev-parse', 'HEAD'])).toString().trim(),
    fallback: recoverTriggerApp
  }, recover);
}
export async function productionAdapter(readers, recover = false) {
  const { api, definitions } = readers;
  if (readers.site !== target.site) throw new Error('Wrong Datadog site');
  const state = await readers.read('monitors.json');
  if (!state || !Array.isArray(state.monitors) || Object.keys(state).some(k => !['owner', 'pending', 'transition', 'tagDowntime', 'monitors'].includes(k)) || state.monitors.some(e => !e || Object.keys(e).some(k => !['id', 'name', 'downtime'].includes(k)))) throw new Error('Invalid monitor journal');
  if (!ownerPattern.test(state.owner ?? '') || state.pending || state.transition || state.tagDowntime || state.monitors?.length !== 3) throw new Error('Monitor reconciliation required');
  const wanted = monitorDefinitions(definitions, state.owner);
  let snapshot = JSON.stringify(state);
  async function inspectOwnership(recovery = false, replacement) {
    await readers.operation(operationIdentity);
    const current = await readers.read('monitors.json');
    if (JSON.stringify(current) !== snapshot) throw new Error('Monitor journal changed');
    let checkout;
    for (let i = 0; i < wanted.length; i++) {
      const entry = state.monitors.find(e => e.name === wanted[i].name);
      if (entry?.id !== [target.availability, target.checkout, target.heartbeat][i]) throw new Error('Monitor target changed');
      const monitor = await api.getMonitor(entry.id);
      if (entry.id === target.checkout) checkout = monitor;
      if (ownedMonitor(monitor, wanted[i]) !== entry.id) throw new Error('Monitor response ID changed');
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
    return checkout;
  }
  async function verifyProtection(replacement) {
    groupState(await inspectOwnership(true, replacement));
  }
  async function inspect(recovery = false, replacement) {
    const checkout = await inspectOwnership(recovery, replacement);
    const rule = await api.getNotificationRule();
    if (!routeIdentity(rule, state.owner)) throw new Error('Routing identity changed');
    return {rule, checkout};
  }
  async function verify(recovery = false, replacement) {
    const {rule, checkout} = await inspect(recovery, replacement);
    effectiveRoutes(rule, await api.notificationRules(), checkout, state.owner);
  }
  let status;
  try { status = await readers.control('status'); } catch (e) { if (!recover) throw e; const receipt = validateReceipt(await readers.read('trigger.json')); status = { commit: receipt.identity.commit }; }
  const { ctx, owned } = await readers.runtime(status.commit);
  const app = owned.find(x => x.Config.Labels['com.docker.compose.service'] === 'app');
  if (!/^[a-f0-9]{40}$/.test(status.commit ?? '') || ctx.commit !== status.commit || !/^sha256:[a-f0-9]{64}$/.test(ctx.ids.app ?? '') || !/^[a-f0-9]{64}$/.test(app?.Id ?? '')) throw new Error('Runtime identity inconsistent');
  const identity = { checkout: target.checkout, commit: status.commit, appImageId: ctx.ids.app, appContainer: app?.Id, owner: state.owner, toolingCommit: await readers.tooling() };
  const operationIdentity = await readers.operation(status.operationIdentity);
  if (!recover && !status.operationIdentity) throw new Error('Controller operation unverified');
  const entry = state.monitors.find(e => e.id === target.checkout);
  return {
    identity, oldDowntime: entry?.downtime,
    async baseline() {
      const {rule} = await inspect();
      if (!healthyController(status) || status.appImageId !== ctx.ids.app || !owned.every(x => x.State.Running) || !owned.some(x => x.Config.Labels['com.docker.compose.service'] === 'agent' && x.State.Health?.Status === 'healthy') || !await readers.availability(ctx)) throw new Error('Runtime unhealthy');
      const m = await api.getMonitor(target.checkout);
      if (m.overall_state !== 'OK' || groupState(m).status !== 'OK') throw new Error('Fresh healthy group required');
      if (ownedMonitor(m, wanted[1]) !== target.checkout) throw new Error('Monitor response ID changed');
      effectiveRoutes(rule, await api.notificationRules(), m, state.owner);
    },
    verify, verifyProtection,
    reserve: run => readers.control(`trigger:reserve:${run}`),
    cancel: id => api.cancelDowntime(id),
    canceled: async id => { const d = await api.getDowntime(id); return d?.data?.id === id && d.data.attributes.status === 'canceled'; },
    stop: run => readers.control(`trigger:stop:${run}`),
    restart: run => readers.control(`trigger:restart:${run}`),
    fallback: async () => {
      const receipt = await readers.read('trigger.json');
      const stop = await readers.read(`trigger-${receipt.run}-stop.json`);
      if (!confirmedControl(stop, receipt.run, 'stop')) throw new Error('Stop outcome unresolved');
      try { await readers.control(`trigger:barrier:${receipt.run}`); } catch {
        const restart = await readers.read(`trigger-${receipt.run}-restart.json`);
        if (!confirmedControl(restart, receipt.run, 'restart')) throw new Error('Recovery control unresolved');
      }
      return readers.fallback(identity);
    },
    release: run => readers.control(`trigger:release:${run}`),
    async monitor() { const m = await api.getMonitor(target.checkout); if (ownedMonitor(m, wanted[1]) !== target.checkout) throw new Error('Monitor response ID changed'); return groupState(m); },
    async create(run) {
      if (!/^[a-f0-9-]{36}$/.test(run ?? '')) throw new Error('Invalid recovery run');
      await verifyProtection();
      const old = await api.getDowntime(entry.downtime);
      if (old?.data?.id !== entry.downtime || old.data.attributes?.status !== 'canceled' || verifyDowntime({data:{...old.data,attributes:{...old.data.attributes,status:'active'}}}, idDowntime(target.checkout)) !== entry.downtime) throw new Error('Cancellation still unknown');
      if ((await api.matches(target.checkout)).length !== 0) throw new Error('Unexpected suppression');
      const spec = idDowntime(target.checkout); spec.data.attributes.message = `DeskDrop checkout recovery ${run}`;
      return (await api.createDowntime(spec))?.data?.id;
    },
    async protection(id) {
      await verifyProtection(id);
      const record = await api.getDowntime(id);
      if (record?.data?.id === id && record.data.attributes?.monitor_identifier?.monitor_id === target.checkout && record.data.attributes?.status === 'canceled') return false;
      return verifyDowntime(record, idDowntime(target.checkout)) === id && (await api.matches(target.checkout)).includes(id);
    },
    async reconcileCreate(run) {
      if (!/^[a-f0-9-]{36}$/.test(run ?? '')) throw new Error('Invalid recovery run');
      const found = [];
      for (const id of await api.matches(target.checkout)) {
        const d = await api.getDowntime(id);
        if (d?.data?.attributes?.message === `DeskDrop checkout recovery ${run}`) { verifyDowntime(d, idDowntime(target.checkout)); found.push(id); }
      }
      if (found.length !== 1) throw new Error('Create reconciliation ambiguous');
      await verifyProtection(found[0]);
      return found[0];
    },
    async restoreProtection(run, id) {
      if (!/^[a-f0-9-]{36}$/.test(run ?? '')) throw new Error('Invalid recovery run');
      await verifyProtection(id);
      const record = await api.getDowntime(id);
      if (record?.data?.id !== id || record.data.attributes?.message !== `DeskDrop checkout recovery ${run}` || verifyDowntime(record, idDowntime(target.checkout)) !== id) throw new Error('Suppression changed');
      const matches = await api.matches(target.checkout);
      if (matches.length !== 1 || matches[0] !== id) throw new Error('Unexpected suppression');
      if (JSON.stringify(await readers.read('monitors.json')) !== snapshot) throw new Error('Monitor journal changed');
      const next = structuredClone(state); next.monitors.find(e => e.id === target.checkout).downtime = id;
      await readers.write('monitors.json', next); Object.assign(state, next); snapshot = JSON.stringify(state);
    },
    async replace(id) { await verify(true, id); const next = structuredClone(state); next.monitors.find(e => e.id === target.checkout).downtime = id; await readers.write('monitors.json', next); Object.assign(state, next); snapshot = JSON.stringify(state); },
    async localHealthy() { return healthyController(await readers.control('status')) && await readers.availability(ctx); }
  };
}
export async function inspectProduction(prepare = production) {
  const blockers = [];
  try { await bounded(async () => { const a = await prepare(); await a.baseline(); }, bounds.prepare); }
  catch (error) {
    const safe = new Set(['Mac required', 'Wrong Datadog site', 'Invalid monitor journal', 'Monitor reconciliation required', 'Monitor journal changed', 'Monitor target changed', 'Monitor response ID changed', 'Monitor ownership or configuration changed', 'Suppression changed', 'Unexpected suppression', 'Routing identity changed', 'Effective Alert-only delivery unverified', 'Runtime unhealthy', 'Runtime identity inconsistent', 'Controller operation unverified', 'Runtime operation unknown', 'Runtime operation changed', 'Fresh healthy group required', 'Monitor group unknown', 'Notification rule filter unverified', 'Notification rule coverage incomplete', 'Notification rule coverage inconsistent', 'Outcome unknown', 'Datadog API access denied', 'Datadog API rate limited', 'Datadog API redirect rejected', 'Datadog API request failed', 'Datadog request outcome unknown', 'Datadog response invalid or outcome unknown']);
    blockers.push(safe.has(error?.message) ? error.message : 'Runtime, ownership or suppression readiness not confirmed');
  }
  return { status: blockers.length ? 'blocked' : 'ready', target, bounds, blockers, events: 'unavailable' };
}

export async function rehearse(a, store, { now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), interrupted = () => false, accepted = () => {}, recover = false, preparationDeadline = Date.now() + bounds.prepare } = {}) {
  let r;
  const save = async phase => { r.phase = phase; await store.save(r); };
  let phaseEnd = Infinity;
  const call = async (fn, limit = bounds.request) => {
    const remaining = Math.min(r.attempt?.deadline ?? r.deadline, phaseEnd) - now();
    if (remaining <= 0) throw new Error('Attempt deadline elapsed');
    return bounded(fn, Math.min(limit, remaining));
  };
  if (recover) {
    r = validateReceipt(await store.load());
    if (['checkout', 'commit', 'appImageId', 'appContainer', 'owner'].some(key => r.identity[key] !== a.identity[key])) throw new Error('Recovery identity changed');
    const started = now();
    r.attempt = { started, deadline: started + bounds.recovery, toolingCommit: a.identity.toolingCommit };
    await store.save(r);
    accepted(r.run);
  } else {
    try { const prior = await store.load(); if (validateReceipt(prior).phase !== 'complete') throw new Error('Previous rehearsal unresolved'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const remaining = preparationDeadline - Date.now();
    if (remaining <= 0) throw new Error('Preparation deadline elapsed');
    await bounded(() => a.baseline(), Math.min(bounds.prepare, remaining));
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
      if (!r.alertObserved) r.failure = 'Alert not observed';
    } catch { r.failure = 'Fault outcome requires reconciliation'; }
  }
  let protectedOk = false, appOk = false;
  const protectionEnd = Math.min(r.attempt?.deadline ?? r.deadline, now() + bounds.protection);
  phaseEnd = protectionEnd;
  try {
    await save('protect');
    if (!r.cancelIntent) protectedOk = await call(() => a.protection(r.oldDowntime));
    else {
      if (!r.canceled) {
        if (!await call(() => a.canceled(r.oldDowntime))) throw new Error('Cancellation still unknown');
        r.canceled = true; await store.save(r);
      }
      if (r.createIntent && !r.newDowntime && a.reconcileCreate) { r.newDowntime = await call(() => a.reconcileCreate(r.run)); await store.save(r); }
      await call(() => a.verifyProtection(r.newDowntime));
      if (!r.createIntent) {
        r.createIntent = true; await store.save(r);
        r.newDowntime = await call(() => a.create(r.run));
        if (typeof r.newDowntime !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(r.newDowntime) || r.newDowntime === r.oldDowntime) throw new Error('Create unknown');
        await store.save(r);
      }
      if (!r.newDowntime) throw new Error('Create outcome unknown; do not retry');
      while (now() < protectionEnd) {
        if (await call(() => a.protection(r.newDowntime))) { await call(() => a.restoreProtection(r.run, r.newDowntime)); protectedOk = true; break; }
        await sleep(Math.min(1000, Math.max(0, protectionEnd - now())));
      }
    }
  } catch { r.failure = 'Suppression unconfirmed'; }
  phaseEnd = Math.min(r.attempt?.deadline ?? r.deadline, now() + bounds.restart);
  try {
    await save('restart');
    if (r.stopIntent) {
      if (!r.restartIntent) { r.restartIntent = true; await store.save(r); try { await call(() => a.restart(r.run), bounds.control); } catch { await call(() => a.fallback(), bounds.control); } }
      else await call(() => a.fallback(), bounds.control);
    }
    phaseEnd = r.attempt?.deadline ?? r.deadline;
    await save('verify');
    while (now() < (r.attempt?.deadline ?? r.deadline)) {
      if (await call(() => a.localHealthy()) && (await call(() => a.monitor())).status === 'OK') { await call(() => a.verify()); appOk = true; break; }
      await sleep(Math.min(bounds.poll, Math.max(0, (r.attempt?.deadline ?? r.deadline) - now())));
    }
  } catch { r.failure = 'App recovery unconfirmed'; }
  r.protected = protectedOk; r.recovered = appOk;
  await save(protectedOk && appOk ? 'complete' : 'uncertain');
  if (r.phase === 'complete') {
    r.releaseIntent = true; r.releaseConfirmed = false; await store.save(r);
    try { await call(() => a.release(r.run), bounds.control); r.releaseConfirmed = true; await store.save(r); } catch { await save('uncertain'); }
  }
  return r;
}
function notify(channel, message) {
  if (channel.connected === false) return;
  try { channel.send?.(message, () => {}); } catch {}
}
export async function supervisorSession(action, channel = process) {
  let stop = false;
  const interrupt = () => { stop = true; };
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP', 'disconnect']) channel.on(name, interrupt);
  try { return await action({ interrupted: () => stop, accepted: run => notify(channel, { status: 'accepted', run }) }); }
  finally { for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP', 'disconnect']) channel.removeListener(name, interrupt); }
}
export async function supervise(command) {
  if (!['run', 'recover'].includes(command)) throw new Error('Invalid supervisor command');
  return supervisorSession(options => supervisorLease(directory, command === 'recover', async () => {
    const preparationDeadline = Date.now() + bounds.prepare;
    const a = await bounded(() => production(command === 'recover'), bounds.prepare);
    return rehearse(a, { load: () => readState(directory, 'trigger.json'), save: r => writeState(directory, 'trigger.json', r) }, { ...options, recover: command === 'recover', preparationDeadline });
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) supervise(process.argv[2]).then(r => { notify(process, { status: r.phase, run: r.run, evidence: evidence(r) }); if (process.connected) process.disconnect(); }, () => { notify(process, { status: 'blocked' }); if (process.connected) process.disconnect(); process.exitCode = 1; });
