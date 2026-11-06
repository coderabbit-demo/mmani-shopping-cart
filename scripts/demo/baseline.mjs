import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultArtifacts = path.join(root, 'artifacts', 'gcp-baseline');
const registry = 'us-central1-docker.pkg.dev/se-demos-project/deskdrop';
const hash = value => createHash('sha256').update(value).digest('hex');
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^sha256:(?!0{64}$)[a-f0-9]{64}$/;
const image = (name, digest) => `${registry}/${name}@${digest}`;
const fail = () => { throw new Error('Operation failed or prerequisite invalid'); };

export async function command(file, args, { timeout = 120000, input, binary = false, maxOutput = 1048576 } = {}) {
  const allowed = new Set(['git', 'docker', 'terraform', 'gcloud', 'tar']);
  if (!allowed.has(file) || !Array.isArray(args) || args.some(x => typeof x !== 'string' || x.includes('\0'))) fail();
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DD_|DATADOG_)/i.test(key)) delete env[key];
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: root, env, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const chunks = [];
    let outputSize = 0, done = false, interrupted, escalation;
    const send = signal => {
      if (!child.pid) return;
      try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); } catch {}
    };
    const onInterrupt = signal => {
      if (done || interrupted) return;
      interrupted = signal;
      send(signal);
      // The group can outlive its leader. Escalate before settling even if it closes.
      escalation = setTimeout(() => { send('SIGKILL'); end(true); }, 1000);
    };
    const onInt = () => onInterrupt('SIGINT'), onTerm = () => onInterrupt('SIGTERM');
    const end = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer); clearTimeout(escalation);
      process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
      if (error) { const failure = new Error('Command failed'); failure.signal = interrupted; reject(failure); }
      else resolve(value);
    };
    const timer = setTimeout(() => { send('SIGKILL'); end(true); }, timeout);
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    child.on('error', () => end(true));
    child.stdout.on('data', chunk => { if (done) return; outputSize += chunk.length; if (outputSize > maxOutput) { send('SIGKILL'); end(true); } else chunks.push(chunk); });
    child.stderr.on('data', () => {});
    if (input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(input); }
    child.on('close', code => { if (!interrupted && !done) { const output = Buffer.concat(chunks, outputSize); end(code !== 0, binary ? output : output.toString('utf8')); } });
  });
}
async function safeArtifacts(artifacts) {
  const st = await lstat(artifacts);
  if (!st.isDirectory() || st.isSymbolicLink() || await realpath(artifacts) !== artifacts || (st.mode & 0o077) !== 0 || st.uid !== process.getuid()) fail();
}
async function json(name, artifacts) {
  await safeArtifacts(artifacts);
  const p = path.join(artifacts, name);
  const st = await lstat(p); if (!st.isFile() || st.isSymbolicLink() || st.size > 16384) fail();
  return JSON.parse(await readFile(p, 'utf8'));
}
async function save(name, value, artifacts) {
  await mkdir(artifacts, { recursive: true, mode: 0o700 });
  await safeArtifacts(artifacts);
  await writeFile(path.join(artifacts, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
async function absent(p) { try { await lstat(p); fail(); } catch (err) { if (err.code !== 'ENOENT') throw err; } }
async function fileHash(p) { const st = await lstat(p); if (!st.isFile() || st.isSymbolicLink() || st.size > 100000000) fail(); return hash(await readFile(p)); }
async function backendHash(file) {
  const st = await lstat(file);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 65536) fail();
  const bytes = await readFile(file);
  const backend = JSON.parse(bytes).backend;
  if (backend?.type !== 'gcs' || backend.config?.bucket !== 'se-demos-project-deskdrop-tfstate' || backend.config?.prefix !== 'deskdrop/demo') fail();
  for (const [key, value] of Object.entries(backend.config)) {
    if (['bucket', 'prefix'].includes(key)) continue;
    if (key === 'billing_project' && (value === null || value === '' || value === 'se-demos-project')) continue;
    if (value !== null && value !== '' && value !== false && !(Array.isArray(value) && value.length === 0)) fail();
  }
  return hash(bytes);
}
async function ociManifest(run, archive, commit) {
  const rawIndex = await run('tar', ['-xOf', archive, 'index.json'], { maxOutput: 1048576 });
  const index = JSON.parse(rawIndex);
  if (!Array.isArray(index.manifests) || index.manifests.length !== 1) fail();
  const manifestDigest = index.manifests[0].digest;
  if (!digestPattern.test(manifestDigest ?? '')) fail();
  const manifestBytes = await run('tar', ['-xOf', archive, `blobs/sha256/${manifestDigest.slice(7)}`], { binary: true, maxOutput: 1048576 });
  if (!Buffer.isBuffer(manifestBytes) || `sha256:${hash(manifestBytes)}` !== manifestDigest) fail();
  const manifest = JSON.parse(manifestBytes);
  const configDigest = manifest.config?.digest;
  if (!digestPattern.test(configDigest ?? '')) fail();
  const configBytes = await run('tar', ['-xOf', archive, `blobs/sha256/${configDigest.slice(7)}`], { binary: true, maxOutput: 1048576 });
  if (!Buffer.isBuffer(configBytes) || `sha256:${hash(configBytes)}` !== configDigest) fail();
  const config = JSON.parse(configBytes);
  if (config.architecture !== 'amd64' || config.os !== 'linux' || config.config?.Labels?.['org.opencontainers.image.revision'] !== commit) fail();
  return manifestDigest;
}
async function head(run) {
  const commit = (await run('git', ['rev-parse', 'HEAD'])).trim();
  if (!shaPattern.test(commit) || (await run('git', ['status', '--porcelain', '--untracked-files=normal'])).trim()) fail();
  return commit;
}
const digestFromPush = text => {
  const matches = [...text.matchAll(/\bdigest:\s*(sha256:[a-f0-9]{64})\b/g)].map(m => m[1]);
  if (matches.length !== 1 || !digestPattern.test(matches[0])) fail();
  return matches[0];
};
function validateRelease(r) {
  if (!r || (r.phase !== undefined && r.phase !== 'release') || !shaPattern.test(r.commit ?? '') || !digestPattern.test(r.appDigest ?? '') || !digestPattern.test(r.checkerDigest ?? '')) fail();
  return r;
}
async function remote(run, commandText, timeout = 120000) {
  return run('gcloud', ['compute', 'ssh', 'deskdrop-demo', '--project=se-demos-project', '--zone=us-central1-a', '--tunnel-through-iap', `--command=${commandText}`], { timeout });
}
async function exists(name, artifacts) {
  try { await lstat(path.join(artifacts, name)); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function cloudRelease(artifacts, cloudRoot = root) {
  return (await import('./cloud-release.mjs')).cloudAction('verify', artifacts, command, cloudRoot);
}
async function deployPrerequisites(artifacts, rel, cloudRoot = root, backendFile) {
  if (rel.phase === 'foundation' || (rel.phase !== 'release' && await exists('foundation-applied.json', artifacts))) fail();
  if (rel.phase === 'release') { const evidence = await cloudRelease(artifacts, cloudRoot); if (['phase', 'commit', 'appDigest', 'checkerDigest', 'evidenceHash'].some(k => evidence[k] !== rel[k])) fail(); }
  const applied = await json(rel.phase === 'release' ? 'release-applied.json' : 'terraform-applied.json', artifacts);
  if (rel.phase === 'release') {
    const p = await json('release-plan.json', artifacts);
    if (applied.phase !== 'release' || p.phase !== 'release' || p.which !== 'release' || p.commit !== rel.commit || p.evidenceHash !== rel.evidenceHash || applied.evidenceHash !== rel.evidenceHash || ['planHash', 'inputHash', 'backendDigest', 'lockHash'].some(k => p[k] !== applied[k]) || p.planHash !== await fileHash(path.join(artifacts, 'release.tfplan')) || p.inputHash !== await fileHash(path.join(artifacts, 'release.tfvars.json')) || p.lockHash !== await fileHash(path.join(root, 'infra/terraform/.terraform.lock.hcl')) || p.backendDigest !== await backendHash(backendFile ?? path.join(root, 'infra/terraform/.terraform/terraform.tfstate'))) fail();
  }
  const approval = await json('deploy-approval.json', artifacts);
  if ((applied.phase !== undefined && applied.phase !== 'release') || applied.commit !== rel.commit || !/^[a-f0-9]{64}$/.test(applied.planHash ?? '') || approval.commit !== rel.commit || approval.appDigest !== rel.appDigest || approval.checkerDigest !== rel.checkerDigest || approval.planHash !== applied.planHash || approval.secretProvisioned !== true || approval.vmReady !== true || approval.iapAuthorized !== true || approval.costApproved !== true || typeof approval.owner !== 'string' || !approval.owner.trim()) fail();
}
export async function monitoringBundle(rel) {
  validateRelease(rel);
  const { archive, compress } = await import('./cloud-release.mjs');
  const paths = { 'cloud-runtime.mjs': 'scripts/demo/cloud-runtime.mjs', 'cloud-monitors.mjs': 'scripts/demo/cloud-monitors.mjs', 'deskdrop-monitoring.service': 'deploy/systemd/deskdrop-monitoring.service' };
  const files = {}, hashes = {};
  for (const [name, source] of Object.entries(paths)) { files[name] = await readFile(path.join(root, source)); hashes[name] = hash(files[name]); }
  files['manifest.json'] = Buffer.from(JSON.stringify({ commit: rel.commit, files: hashes }));
  files['runtime.json'] = Buffer.from(JSON.stringify({ project: 'se-demos-project', zone: 'us-central1-a', architecture: 'linux/amd64', source: rel.commit, app: image('deskdrop', rel.appDigest), checker: image('checker', rel.checkerDigest), bundleHash: hash(files['manifest.json']) }));
  const bundle = compress(archive(files)), digest = hash(bundle);
  return { files, hashes, bundle, digest };
}
export async function action(name, args = [], run = command, context = {}) {
  const artifacts = context.artifacts ?? defaultArtifacts;
  if (name === 'help') return { commands: ['help', 'build', 'publish', 'plan', 'apply', 'host-install', 'deploy', 'monitoring-install', 'tunnel', 'smoke'] };
  if (name === 'build' && args.length === 0) {
    const commit = await head(run);
    const archive = await run('git', ['archive', '--format=tar', commit], { binary: true, maxOutput: 50000000 });
    if (!Buffer.isBuffer(archive) || archive.length === 0) fail();
    await mkdir(artifacts, { recursive: true, mode: 0o700 });
    await safeArtifacts(artifacts);
    await absent(path.join(artifacts, 'build.json'));
    await absent(path.join(artifacts, 'app.oci.tar'));
    await absent(path.join(artifacts, 'checker.oci.tar'));
    const ids = {}, manifests = {};
    for (const item of [{ name: 'app', dockerfile: 'Dockerfile' }, { name: 'checker', dockerfile: 'deploy/checker.Dockerfile' }]) {
      const tag = `deskdrop-${item.name}:${commit}`;
      const oci = path.join(artifacts, `${item.name}.oci.tar`);
      await run('docker', ['buildx', 'build', '--platform=linux/amd64', '--provenance=false', '--load', '--output', `type=oci,oci-mediatypes=false,dest=${oci}`, '--build-arg', `SOURCE_COMMIT=${commit}`, '-t', tag, '-f', item.dockerfile, '-'], { timeout: 1800000, input: archive });
      ids[item.name] = (await run('docker', ['image', 'inspect', '--format={{.Id}}', tag])).trim();
      if (!digestPattern.test(ids[item.name])) fail();
      manifests[item.name] = await ociManifest(run, oci, commit);
    }
    await save('build.json', { commit, ids, manifests }, artifacts);
    return { status: 'built', commit, ids, manifests };
  }
  if (name === 'publish' && args.length === 0) {
    const b = await json('build.json', artifacts);
    const applied = await json('terraform-applied.json', artifacts);
    const approval = await json('publication-approval.json', artifacts);
    if (!shaPattern.test(b.commit ?? '') || await head(run) !== b.commit || (applied.phase !== undefined && applied.phase !== 'release') || applied.commit !== b.commit || approval.commit !== b.commit || approval.appDigest !== b.manifests?.app || approval.checkerDigest !== b.manifests?.checker || approval.approved !== true || typeof approval.owner !== 'string' || !approval.owner.trim()) fail();
    await absent(path.join(artifacts, 'release.json'));
    const digests = {};
    for (const item of ['app', 'checker']) {
      const local = `deskdrop-${item}:${b.commit}`, destination = `${registry}/${item === 'app' ? 'deskdrop' : 'checker'}:${b.commit}`;
      if (!digestPattern.test(b.ids?.[item] ?? '') || (await run('docker', ['image', 'inspect', '--format={{.Id}}', local])).trim() !== b.ids[item]) fail();
      await run('docker', ['tag', local, destination]);
      digests[item] = digestFromPush(await run('docker', ['push', destination], { timeout: 1800000 }));
      if (digests[item] !== b.manifests?.[item]) fail();
    }
    const release = { commit: b.commit, appDigest: digests.app, checkerDigest: digests.checker, imageIds: b.ids };
    await save('release.json', release, artifacts);
    return { status: 'published', ...release };
  }
  if (name === 'plan' && args.length === 1 && ['bootstrap', 'terraform', 'foundation', 'release'].includes(args[0])) {
    const commit = await head(run), which = args[0], input = await json(`${which}.tfvars.json`, artifacts);
    if (which === 'foundation') {
      const bootstrap = await json('bootstrap-applied.json', artifacts);
      if (bootstrap.commit !== commit || !/^[a-f0-9]{64}$/.test(bootstrap.planHash ?? '') || Object.keys(input).sort().join(',') !== 'environment,phase,project_id,region,zone' || input.phase !== 'foundation' || input.project_id !== 'se-demos-project' || input.region !== 'us-central1' || input.zone !== 'us-central1-a' || input.environment !== 'demo') fail();
    } else if (which === 'release') {
      const release = validateRelease(await json('release.json', artifacts));
      const evidence = await cloudRelease(artifacts, context.cloudRoot);
      if (release.phase !== 'release' || ['phase', 'commit', 'appDigest', 'checkerDigest', 'evidenceHash'].some(k => evidence[k] !== release[k]) || release.commit !== commit || Object.keys(input).sort().join(',') !== 'cloud_release,environment,image_digest,phase,project_id,region,zone' || input.phase !== 'release' || input.cloud_release !== true || input.project_id !== 'se-demos-project' || input.region !== 'us-central1' || input.zone !== 'us-central1-a' || input.environment !== 'demo' || input.image_digest !== image('deskdrop', release.appDigest)) fail();
    } else if (which === 'terraform') {
      if (await exists('foundation-applied.json', artifacts)) fail();
      const bootstrap = await json('bootstrap-applied.json', artifacts);
      const build = await json('build.json', artifacts);
      if (bootstrap.commit !== commit || !/^[a-f0-9]{64}$/.test(bootstrap.planHash ?? '')) fail();
      if (build.commit !== commit || !digestPattern.test(build.manifests?.app ?? '') || Object.keys(input).length !== 5 || input.project_id !== 'se-demos-project' || input.region !== 'us-central1' || input.zone !== 'us-central1-a' || input.environment !== 'demo' || input.image_digest !== image('deskdrop', build.manifests.app)) fail();
    } else if (input.project_id !== 'se-demos-project' || input.bucket_name !== 'se-demos-project-deskdrop-tfstate' || !/^(user|serviceAccount|group):[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(input.state_operator ?? '') || Object.keys(input).length !== 3) fail();
    const planPath = path.join(artifacts, `${which}.tfplan`), inputPath = path.join(artifacts, `${which}.tfvars.json`);
    await absent(planPath);
    await absent(path.join(artifacts, `${which}-plan.json`));
    let statePath;
    const backendFile = context.backendFile ?? path.join(root, 'infra/terraform/.terraform/terraform.tfstate');
    const backendDigest = which !== 'bootstrap' ? await backendHash(backendFile) : undefined;
    if (which === 'bootstrap') {
      const config = await json('bootstrap-state.json', artifacts);
      if (Object.keys(config).length !== 1 || typeof config.statePath !== 'string' || !path.isAbsolute(config.statePath)) fail();
      statePath = path.resolve(config.statePath);
      if (statePath === root || statePath.startsWith(root + path.sep) || await realpath(path.dirname(statePath)) !== path.dirname(statePath)) fail();
      const stateDir = await lstat(path.dirname(statePath));
      if (!stateDir.isDirectory() || stateDir.isSymbolicLink() || stateDir.uid !== process.getuid() || (stateDir.mode & 0o077) !== 0) fail();
      try { const st = await lstat(statePath); if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) !== 0) fail(); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
    const commandArgs = [`-chdir=infra/${['foundation', 'release'].includes(which) ? 'terraform' : which}`, 'plan', '-input=false', `-var-file=${inputPath}`, `-out=${planPath}`];
    if (statePath) commandArgs.push(`-state=${statePath}`);
    await run('terraform', commandArgs, { timeout: 600000 });
    const receipt = { commit, which, ...(['foundation', 'release'].includes(which) ? { phase: which } : {}), ...(which === 'release' ? { evidenceHash: (await cloudRelease(artifacts, context.cloudRoot)).evidenceHash } : {}), statePath, backendDigest, planHash: await fileHash(planPath), inputHash: await fileHash(inputPath), lockHash: await fileHash(path.join(root, 'infra', ['foundation', 'release'].includes(which) ? 'terraform' : which, '.terraform.lock.hcl')) };
    await save(`${which}-plan.json`, receipt, artifacts);
    return { status: 'planned', ...receipt };
  }
  if (name === 'apply' && args.length === 1 && ['bootstrap', 'terraform', 'foundation', 'release'].includes(args[0])) {
    const which = args[0], p = await json(`${which}-plan.json`, artifacts), a = await json(`${which}-approval.json`, artifacts);
    if ((which === 'foundation' ? p.phase !== 'foundation' : p.phase !== undefined && p.phase !== 'release') || p.which !== which || p.commit !== await head(run) || p.planHash !== await fileHash(path.join(artifacts, `${which}.tfplan`)) || p.inputHash !== await fileHash(path.join(artifacts, `${which}.tfvars.json`)) || p.lockHash !== await fileHash(path.join(root, 'infra', ['foundation', 'release'].includes(which) ? 'terraform' : which, '.terraform.lock.hcl'))) fail();
    if (which === 'release' && (p.phase !== 'release' || p.evidenceHash !== (await cloudRelease(artifacts, context.cloudRoot)).evidenceHash)) fail();
    if (a.planHash !== p.planHash || a.permissionsChecked !== true || a.stateCustodyConfirmed !== true || a.costApproved !== true || typeof a.owner !== 'string' || !a.owner.trim() || typeof a.teardown !== 'string' || !a.teardown.trim()) fail();
    if (which !== 'bootstrap' && p.backendDigest !== await backendHash(context.backendFile ?? path.join(root, 'infra/terraform/.terraform/terraform.tfstate'))) fail();
    const commandArgs = [`-chdir=infra/${['foundation', 'release'].includes(which) ? 'terraform' : which}`, 'apply', '-input=false'];
    if (which === 'bootstrap') {
      const config = await json('bootstrap-state.json', artifacts);
      if (p.statePath !== config.statePath || !path.isAbsolute(p.statePath) || p.statePath.startsWith(root + path.sep) || await realpath(path.dirname(p.statePath)) !== path.dirname(p.statePath)) fail();
      const stateDir = await lstat(path.dirname(p.statePath));
      if (!stateDir.isDirectory() || stateDir.isSymbolicLink() || stateDir.uid !== process.getuid() || (stateDir.mode & 0o077) !== 0) fail();
      try { const st = await lstat(p.statePath); if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) !== 0) fail(); } catch (err) { if (err.code !== 'ENOENT') throw err; }
      commandArgs.push(`-state=${p.statePath}`);
    }
    commandArgs.push(path.join(artifacts, `${which}.tfplan`));
    await absent(path.join(artifacts, `${which}-applied.json`));
    await run('terraform', commandArgs, { timeout: 1800000 });
    await save(`${which}-applied.json`, { commit: p.commit, planHash: p.planHash, ...(['foundation', 'release'].includes(which) ? { phase: which, inputHash: p.inputHash, backendDigest: p.backendDigest, lockHash: p.lockHash, ...(which === 'release' ? { evidenceHash: p.evidenceHash } : {}) } : {}) }, artifacts);
    return { status: 'applied', planHash: p.planHash };
  }
  if (name === 'host-install' && args.length === 0) {
    const release = validateRelease(await json('release.json', artifacts)); if (await head(run) !== release.commit) fail();
    await deployPrerequisites(artifacts, release, context.cloudRoot, context.backendFile);
    const bootstrap = await fileHash(path.join(root, 'deploy/bootstrap.sh')), compose = await fileHash(path.join(root, 'deploy/compose.yaml'));
    await absent(path.join(artifacts, 'host-install.json'));
    await run('gcloud', ['compute', 'scp', 'deploy/bootstrap.sh', 'deploy/compose.yaml', 'deskdrop-demo:/tmp/', '--project=se-demos-project', '--zone=us-central1-a', '--tunnel-through-iap']);
    const fixed = `sudo /usr/bin/timeout --kill-after=10s 1800s /bin/bash -c 'set -eu; install -d -m 700 /opt/deskdrop; d=$(mktemp -d /opt/deskdrop/stage.XXXXXXXX); trap "rm -rf -- \$d" EXIT; install -m 700 /tmp/bootstrap.sh "$d/bootstrap.sh"; install -m 600 /tmp/compose.yaml "$d/compose.yaml"; echo "${bootstrap}  $d/bootstrap.sh" | sha256sum -c -; echo "${compose}  $d/compose.yaml" | sha256sum -c -; "$d/bootstrap.sh" verify; mv "$d/bootstrap.sh" /opt/deskdrop/bootstrap.sh; mv "$d/compose.yaml" /opt/deskdrop/compose.yaml; /opt/deskdrop/bootstrap.sh install'`;
    await remote(run, fixed, 1800000);
    await save('host-install.json', { commit: release.commit, bootstrap, compose }, artifacts);
    return { status: 'host-installed', commit: release.commit };
  }
  if (name === 'deploy' && args.length === 0) {
    const rel = validateRelease(await json('release.json', artifacts)); if (await head(run) !== rel.commit) fail();
    await deployPrerequisites(artifacts, rel, context.cloudRoot, context.backendFile);
    const bootstrap = await fileHash(path.join(root, 'deploy/bootstrap.sh')), compose = await fileHash(path.join(root, 'deploy/compose.yaml'));
    const installed = await json('host-install.json', artifacts);
    if (installed.commit !== rel.commit || installed.bootstrap !== bootstrap || installed.compose !== compose) fail();
    await absent(path.join(artifacts, 'deployment.json'));
    const fixed = `sudo /usr/bin/timeout --kill-after=10s 600s /bin/bash -c 'set -eu; echo "${bootstrap}  /opt/deskdrop/bootstrap.sh" | sha256sum -c -; echo "${compose}  /opt/deskdrop/compose.yaml" | sha256sum -c -; exec /opt/deskdrop/bootstrap.sh start ${image('deskdrop', rel.appDigest)} ${image('checker', rel.checkerDigest)} ${rel.commit}'`;
    await remote(run, fixed, 600000);
    const result = { status: 'deployed', commit: rel.commit, image: image('deskdrop', rel.appDigest) };
    await save('deployment.json', result, artifacts);
    return result;
  }
  if (name === 'monitoring-install' && args.length === 0) {
    const rel = validateRelease(await json('release.json', artifacts));
    if (rel.phase !== 'release') fail();
    if (await head(run) !== rel.commit) fail();
    await deployPrerequisites(artifacts, rel, context.cloudRoot, context.backendFile);
    const deployment = await json('deployment.json', artifacts);
    if (deployment.commit !== rel.commit || deployment.image !== image('deskdrop', rel.appDigest)) fail();
    const host = await json('host-install.json', artifacts);
    if (host.commit !== rel.commit || host.bootstrap !== await fileHash(path.join(root, 'deploy/bootstrap.sh')) || host.compose !== await fileHash(path.join(root, 'deploy/compose.yaml'))) fail();
    const { files, hashes, bundle, digest } = await monitoringBundle(rel);
    await absent(path.join(artifacts, 'monitoring-install.json'));
    const bundlePath = path.join(artifacts, 'monitoring.tar.gz');
    if (await exists('monitoring.tar.gz', artifacts)) { if (await fileHash(bundlePath) !== digest) fail(); }
    else await writeFile(bundlePath, bundle, { mode: 0o600, flag: 'wx' });
    await run('gcloud', ['compute', 'scp', bundlePath, 'deskdrop-demo:/tmp/monitoring.tar.gz', '--project=se-demos-project', '--zone=us-central1-a', '--tunnel-through-iap']);
    const output = await remote(run, `sudo /usr/bin/timeout --kill-after=10s 180s /opt/deskdrop/bootstrap.sh monitoring-install ${digest}`, 200000);
    const receipt = JSON.parse(output.trim().split('\n').at(-1));
    if (receipt.status !== 'monitoring-bundle-installed' || receipt.source !== rel.commit || receipt.bundleHash !== digest || receipt.manifestHash !== hash(files['manifest.json']) || JSON.stringify(receipt.files) !== JSON.stringify(hashes)) fail();
    await save('monitoring-install.json', { ...receipt, host }, artifacts);
    return { status: 'monitoring-bundle-installed', commit: rel.commit };
  }
  if (name === 'smoke' && args.length === 0) {
    const rel = validateRelease(await json('release.json', artifacts)); if (await head(run) !== rel.commit) fail();
    const result = await remote(run, 'sudo /usr/bin/timeout --kill-after=10s 180s /opt/deskdrop/bootstrap.sh check', 200000);
    const lines = result.trim().split('\n'); const observation = JSON.parse(lines.at(-1));
    if (observation.status !== 'pass' || observation.source !== rel.commit || observation.image !== image('deskdrop', rel.appDigest) || observation.journey !== 'cart-receipt-history') fail();
    return observation;
  }
  if (name === 'tunnel' && args.length === 0) {
    await run('gcloud', ['compute', 'ssh', 'deskdrop-demo', '--project=se-demos-project', '--zone=us-central1-a', '--tunnel-through-iap', '--', '-N', '-L', '127.0.0.1:3100:127.0.0.1:3000'], { timeout: 600000 });
    return { status: 'tunnel-closed' };
  }
  fail();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  action(process.argv[2] ?? 'help', process.argv.slice(3)).then(value => console.log(JSON.stringify(value)), error => { console.error('Operation failed or prerequisite invalid'); process.exitCode = error.signal === 'SIGINT' ? 130 : error.signal === 'SIGTERM' ? 143 : 1; });
}
