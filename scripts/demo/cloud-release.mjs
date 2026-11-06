import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, realpath, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const command = async (...args) => (await import('./baseline.mjs')).command(...args);

export const project = 'se-demos-project';
export const region = 'us-central1';
export const registry = `${region}-docker.pkg.dev/${project}/deskdrop`;
export const identities = Object.freeze({ build: `projects/${project}/serviceAccounts/deskdrop-build@${project}.iam.gserviceaccount.com`, publish: `projects/${project}/serviceAccounts/deskdrop-publisher@${project}.iam.gserviceaccount.com` });
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw new Error('Cloud release prerequisite invalid; reconcile protected receipts'); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && !/^0{64}$/.test(value);
const commitOk = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0{40}$/.test(value);
const digest = value => typeof value === 'string' && value.startsWith('sha256:') && sha(value.slice(7));
const execution = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value ?? '');
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const equal = (a, b) => canonical(a) === canonical(b);
export function objectIdentity(value, bucket, prefix) {
  if (!value || value.bucket !== bucket || typeof value.name !== 'string' || !value.name.startsWith(prefix) || !/^[a-zA-Z0-9/_.-]+$/.test(value.name) || value.name.includes('..') || (typeof value.generation !== 'string' || !/^[1-9][0-9]*$/.test(value.generation)) || !sha(value.sha256)) fail();
  return value;
}
export function sourceIdentity(value) {
  if (!value || value.repository !== 'https://github.com/coderabbit-demo/mmani-shopping-cart.git' || !commitOk(value.commit)) fail();
  objectIdentity(value.archive, `${project}-deskdrop-source`, `${value.commit}/`);
  return value;
}
export function capability(value, toolchain, configurationHash, phase) {
  if (!value || value.schema !== 1 || value.phase !== phase || value.toolchainHash !== hash(Buffer.from(JSON.stringify(toolchain))) || value.configHash !== configurationHash || !execution(value.executionId) || value.serviceAccount !== identities[phase] || value.architecture !== 'linux/amd64' || value.builder !== toolchain.builder || value.passed !== true || !toolchain.requiredCapabilities[phase].every(x => value.observed?.includes(x))) fail();
  return value;
}
function tarMembers(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 4 * 1024 ** 3) fail();
  const entries = new Map(); let at = 0, ended = false;
  while (at + 512 <= bytes.length) {
    const h = bytes.subarray(at, at + 512); at += 512;
    if (h.every(x => x === 0)) { ended = true; if (bytes.subarray(at).some(x => x !== 0)) fail(); break; }
    const text = (start, len) => h.subarray(start, start + len).toString().replace(/\0.*$/s, '');
    const name = `${text(345, 155) ? text(345, 155) + '/' : ''}${text(0, 100)}`.replace(/^\.\//, '');
    const type = h[156];
    const sizeText = text(124, 12).trim();
    if (!/^[0-7]+$/.test(sizeText)) fail();
    const size = parseInt(sizeText, 8);
    const checksum = text(148, 8).trim();
    if (!/^[0-7]+$/.test(checksum) || [...h].reduce((n, x, i) => n + (i >= 148 && i < 156 ? 32 : x), 0) !== parseInt(checksum, 8)) fail();
    if (!name || name.startsWith('/') || name.split('/').includes('..') || entries.has(name) || ![0, 48, 53].includes(type) || at + size > bytes.length) fail();
    if (type !== 53) entries.set(name, bytes.subarray(at, at + size));
    at += Math.ceil(size / 512) * 512;
  }
  if (!ended || !entries.size) fail();
  return entries;
}
export function archive(entries) {
  const blocks = [];
  for (const [name, bytes] of Object.entries(entries)) {
    if (!Buffer.isBuffer(bytes) || name.length > 99 || !/^[a-zA-Z0-9/_.-]+$/.test(name) || name.startsWith('/') || name.split('/').includes('..') || bytes.length > 2 * 1024 ** 3) fail();
    const header = Buffer.alloc(512);
    header.write(name); header.write('0000600\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
    header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  const size = blocks.reduce((n, b) => n + b.length, 1024);
  if (size > 4 * 1024 ** 3) fail();
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
export function verifyOci(bytes, source) {
  if (!commitOk(source)) fail();
  const entries = tarMembers(bytes);
  const index = JSON.parse(entries.get('index.json')?.toString() ?? 'null');
  if (JSON.parse(entries.get('oci-layout')?.toString() ?? 'null')?.imageLayoutVersion !== '1.0.0') fail();
  if (index?.schemaVersion !== 2 || index.manifests?.length !== 1) fail();
  const get = descriptor => {
    const d = descriptor?.digest;
    if (!digest(d)) fail();
    const b = entries.get(`blobs/sha256/${d.slice(7)}`);
    if (!b || descriptor.size !== b.length || `sha256:${hash(b)}` !== d) fail();
    return b;
  };
  const manifestDigest = index.manifests[0].digest;
  const manifest = JSON.parse(get(index.manifests[0]));
  const config = JSON.parse(get(manifest.config));
  if (config.architecture !== 'amd64' || config.os !== 'linux' || config.config?.Labels?.['org.opencontainers.image.revision'] !== source || !Array.isArray(manifest.layers)) fail();
  for (const layer of manifest.layers) { const b = get(layer); if (layer.size !== b.length) fail(); }
  return { manifest: manifestDigest, config: manifest.config.digest, archiveHash: hash(bytes) };
}
export function validateFoundation(r, source) {
  if (!r || r.phase !== 'foundation' || r.commit !== source || !['planHash', 'inputHash', 'backendDigest', 'lockHash'].every(k => sha(r[k]))) fail();
  return r;
}
export function validateBuild(r, { source, foundation, toolchain, configHash, artifacts }) {
  sourceIdentity(source); validateFoundation(foundation, source.commit);
  if (!r || r.phase !== 'build' || r.commit !== source.commit || !equal(r.source, source) || r.foundationHash !== hash(Buffer.from(JSON.stringify(foundation))) || r.configHash !== configHash || r.toolchainHash !== hash(Buffer.from(JSON.stringify(toolchain))) || r.serviceAccount !== identities.build || !execution(r.executionId) || r.architecture !== 'linux/amd64') fail();
  for (const name of ['app', 'checker']) {
    const entry = r.images?.[name]; objectIdentity(entry?.artifact, `${project}-deskdrop-artifacts`, `${source.commit}/${r.executionId}/`);
    const observed = verifyOci(artifacts[name], source.commit);
    if (entry.artifact.sha256 !== observed.archiveHash || entry.manifest !== observed.manifest || entry.config !== observed.config) fail();
  }
  return r;
}
export function validatePublication(r, build, approval) {
  const expected = publicationApproval(build, approval);
  if (!r || !execution(r.executionId) || ['phase', 'commit', 'buildHash', 'serviceAccount', 'images', 'rollback'].some(key => !equal(r[key], expected[key]))) fail();
  return r;
}
async function protectedRead(dir, name, binary = false) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) fail();
  const st = await lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || st.mode & 0o077 || await realpath(dir) !== dir) fail();
  const fh = await open(path.join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const f = await fh.stat();
    if (!f.isFile() || f.uid !== process.getuid() || f.nlink !== 1 || f.mode & 0o077 || f.size > (binary ? 4 * 1024 ** 3 : 1048576)) fail();
    const b = await fh.readFile(); return binary ? b : JSON.parse(b);
  } finally { await fh.close(); }
}
async function sourceConfiguration(root) {
  const files = {};
  for (const name of ['deploy/cloudbuild/build.yaml', 'deploy/cloudbuild/publish.yaml', 'deploy/cloudbuild/toolchain.json', 'scripts/demo/cloud-release.mjs']) files[name] = hash(await readFile(path.join(root, name)));
  return files;
}
export async function foundationEvidence(dir, root, commit) {
  const applied = validateFoundation(await protectedRead(dir, 'foundation-applied.json'), commit);
  const plan = await protectedRead(dir, 'foundation-plan.json');
  if (plan.phase !== 'foundation' || plan.which !== 'foundation' || plan.commit !== commit) fail();
  for (const key of ['planHash', 'inputHash', 'backendDigest', 'lockHash']) if (plan[key] !== applied[key]) fail();
  if (hash(await protectedRead(dir, 'foundation.tfplan', true)) !== applied.planHash || hash(await protectedRead(dir, 'foundation.tfvars.json', true)) !== applied.inputHash || hash(await readFile(path.join(root, 'infra/terraform/.terraform.lock.hcl'))) !== applied.lockHash) fail();
  const backendBytes = await readFile(path.join(root, 'infra/terraform/.terraform/terraform.tfstate'));
  const backend = JSON.parse(backendBytes).backend;
  if (hash(backendBytes) !== applied.backendDigest || backend?.type !== 'gcs' || backend.config?.bucket !== `${project}-deskdrop-tfstate` || backend.config?.prefix !== 'deskdrop/demo') fail();
  return applied;
}
export async function buildEvidence(dir, root) {
  const source = sourceIdentity(await protectedRead(dir, 'source.json'));
  const sourceBytes = await protectedRead(dir, 'source.tar', true);
  if (hash(sourceBytes) !== source.archive.sha256) fail();
  const foundation = await foundationEvidence(dir, root, source.commit);
  const toolchain = JSON.parse(await readFile(path.join(root, 'deploy/cloudbuild/toolchain.json')));
  const configHash = hash(await readFile(path.join(root, 'deploy/cloudbuild/build.yaml')));
  const artifacts = {};
  for (const name of ['app', 'checker']) artifacts[name] = await protectedRead(dir, `${name}.oci.tar`, true);
  const build = validateBuild(await protectedRead(dir, 'cloud-build.json'), { source, foundation, toolchain, configHash, artifacts });
  const request = await protectedRead(dir, 'build-request.json');
  if (!equal(request, await prepareRequest('build', dir, root)) || build.requestHash !== hash(Buffer.from(JSON.stringify(request)))) fail();
  const executed = await protectedRead(dir, 'build-execution.json');
  validateExecution(executed, request, 'build');
  if (build.executionId !== executed.id || build.executionHash !== hash(Buffer.from(JSON.stringify(executed))) || !equal(await protectedRead(dir, 'artifacts-verified.json'), Object.fromEntries(['app', 'checker'].map(n => [n, build.images[n].artifact])))) fail();
  return { source, build, artifacts };
}
export async function releaseEvidence(dir, root) {
  const { source, build } = await buildEvidence(dir, root);
  const publication = validatePublication(await protectedRead(dir, 'publication.json'), build, await protectedRead(dir, 'cloud-publication-approval.json'));
  const request = await protectedRead(dir, 'publish-request.json');
  const executed = await protectedRead(dir, 'publish-execution.json');
  if (!equal(request, await prepareRequest('publish', dir, root))) fail();
  validateExecution(executed, request, 'publish');
  if (publication.executionId !== executed.id || publication.executionHash !== hash(Buffer.from(JSON.stringify(executed))) || publication.requestHash !== hash(Buffer.from(JSON.stringify(request)))) fail();
  if (publication.configHash !== hash(await readFile(path.join(root, 'deploy/cloudbuild/publish.yaml')))) fail();
  return { source, build, publication };
}
export function publicationApproval(build, approval) {
  const buildHash = hash(Buffer.from(JSON.stringify(build)));
  if (approval?.phase !== 'publication' || approval.approved !== true || typeof approval.owner !== 'string' || !approval.owner.trim() || approval.buildHash !== buildHash) fail();
  const images = Object.fromEntries(['app', 'checker'].map(name => [name, `${registry}/${name === 'app' ? 'deskdrop' : name}@${build.images[name].manifest}`]));
  if (!equal(approval.images, images)) fail();
  const rollback = approval.rollback ?? null;
  if (rollback === null) {
    if (approval.initialRelease !== true || approval.noPriorReleaseConfirmed !== true) fail();
  } else if (!commitOk(rollback.commit) || rollback.commit === build.commit || !['app', 'checker'].every(name => rollback.images?.[name]?.startsWith(`${registry}/${name === 'app' ? 'deskdrop' : name}@sha256:`) && digest(rollback.images[name].split('@')[1]))) fail();
  return { phase: 'publication', commit: build.commit, buildHash, serviceAccount: identities.publish, images, rollback };
}
export async function readback(build, run) {
  const observed = {};
  for (const name of ['app', 'checker']) {
    const uri = `${registry}/${name === 'app' ? 'deskdrop' : name}@${build.images[name].manifest}`;
    const raw = await run('gcloud', ['artifacts', 'docker', 'images', 'describe', uri, `--project=${project}`, '--format=json'], { timeout: 15000, maxOutput: 16384 });
    const response = JSON.parse(raw);
    if (response.image_summary?.digest !== build.images[name].manifest || response.image_summary?.fully_qualified_digest !== uri) fail();
    observed[name] = uri;
  }
  return observed;
}
export async function cloudAction(action, dir, run = command, root = process.cwd()) {
  if (!['verify', 'publication-status', 'record-build', 'record-publication', 'verify-source', 'verify-publication-source', 'release', 'bundle', 'verify-rollback'].includes(action)) fail();
  if (action === 'verify-rollback') {
    const { build } = await buildEvidence(dir, root);
    const approval = await protectedRead(dir, 'cloud-publication-approval.json');
    publicationApproval(build, approval);
    if (!approval.rollback) fail();
    for (const name of ['app', 'checker']) {
      const base = `${registry}/${name === 'app' ? 'deskdrop' : name}`;
      const raw = await run('gcloud', ['artifacts', 'docker', 'images', 'describe', `${base}:${approval.rollback.commit}`, `--project=${project}`, '--format=json'], { timeout: 15000, maxOutput: 16384 });
      const observed = JSON.parse(raw).image_summary;
      if (observed?.fully_qualified_digest !== approval.rollback.images[name] || observed.digest !== approval.rollback.images[name].split('@')[1]) fail();
    }
    await writeReceipt(dir, 'rollback-verified.json', approval.rollback);
    return { status: 'rollback-verified' };
  }
  if (action === 'verify-publication-source') {
    const source = sourceIdentity(await protectedRead(dir, 'source.json'));
    const object = objectIdentity(await protectedRead(dir, 'publication-source.json'), `${project}-deskdrop-artifacts`, `${source.commit}/publication/`);
    const bytes = await protectedRead(dir, 'publication-source.tar', true);
    const remote = await run('gcloud', ['storage', 'cat', `gs://${object.bucket}/${object.name}#${object.generation}`], { binary: true, timeout: 120000, maxOutput: 4 * 1024 ** 3 });
    if (!Buffer.isBuffer(remote) || hash(bytes) !== object.sha256 || hash(remote) !== object.sha256) fail();
    await writeReceipt(dir, 'publication-source-verified.json', object);
    return { status: 'publication-source-verified' };
  }
  if (action === 'verify-source') {
    const source = sourceIdentity(await protectedRead(dir, 'source.json'));
    const bytes = await protectedRead(dir, 'source.tar', true);
    if ((await run('git', ['rev-parse', 'HEAD'])).trim() !== source.commit || (await run('git', ['status', '--porcelain', '--untracked-files=normal'])).trim()) fail();
    const archive = await run('git', ['archive', '--format=tar', source.commit], { binary: true, maxOutput: 50000000 });
    const remote = await run('gcloud', ['storage', 'cat', `gs://${source.archive.bucket}/${source.archive.name}#${source.archive.generation}`], { binary: true, timeout: 120000, maxOutput: 50000000 });
    if (!Buffer.isBuffer(archive) || !Buffer.isBuffer(remote) || hash(bytes) !== source.archive.sha256 || hash(archive) !== source.archive.sha256 || hash(remote) !== source.archive.sha256) fail();
    await writeReceipt(dir, 'source-verified.json', { source, files: await sourceConfiguration(root) });
    return { status: 'source-verified', commit: source.commit };
  }
  if (action === 'bundle') {
    const { source, build, artifacts } = await buildEvidence(dir, root);
    publicationApproval(build, await protectedRead(dir, 'cloud-publication-approval.json'));
    const entries = { 'scripts/demo/cloud-release.mjs': await readFile(path.join(root, 'scripts/demo/cloud-release.mjs')), 'publication-input.json': Buffer.from(JSON.stringify({ commit: source.commit, images: Object.fromEntries(['app', 'checker'].map(n => [n, verifyOci(artifacts[n], source.commit)])) })) };
    for (const name of ['app', 'checker']) entries[`${name}.oci.tar`] = artifacts[name];
    const bytes = archive(entries);
    await writeFile(path.join(dir, 'publication-source.tar'), bytes, { mode: 0o600, flag: 'wx' });
    return { sha256: hash(bytes), bytes: bytes.length };
  }
  if (action === 'record-build') return recordBuild(dir, root, run);
  if (action === 'record-publication') {
    const { source, build } = await buildEvidence(dir, root);
    const approval = await protectedRead(dir, 'cloud-publication-approval.json');
    const candidate = publicationApproval(build, approval);
    const request = await protectedRead(dir, 'publish-request.json');
    if (!equal(request, await prepareRequest('publish', dir, root))) fail();
    const result = validateExecution(await protectedRead(dir, 'publish-execution.json'), request, 'publish');
    const images = await readback(build, run);
    const receipt = { ...candidate, executionId: result.id, images, configHash: hash(await readFile(path.join(root, 'deploy/cloudbuild/publish.yaml'))), requestHash: hash(Buffer.from(JSON.stringify(request))), executionHash: hash(Buffer.from(JSON.stringify(result))), source };
    await writeReceipt(dir, 'publication.json', receipt);
    return receipt;
  }
  if (action === 'publication-status') {
    const { build } = await buildEvidence(dir, root);
    publicationApproval(build, await protectedRead(dir, 'cloud-publication-approval.json'));
    return { status: 'confirmed', images: await readback(build, run) };
  }
  const evidence = await releaseEvidence(dir, root);
  const release = { phase: 'release', commit: evidence.source.commit, appDigest: evidence.build.images.app.manifest, checkerDigest: evidence.build.images.checker.manifest, evidenceHash: hash(Buffer.from(JSON.stringify(evidence))) };
  if (action === 'release') {
    await readback(evidence.build, run);
    await writeReceipt(dir, 'release.json', release);
  }
  return release;
}
async function writeReceipt(dir, name, value) {
  await protectedRead(dir, 'source.json');
  await writeFile(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
export function validateExecution(result, request, phase) {
  const expand = value => JSON.parse(JSON.stringify(value).replace(/\$\$|\$\{(_SOURCE_COMMIT|BUILD_ID|PROJECT_ID)\}|\$(BUILD_ID|PROJECT_ID)/g, (m, a, b) => m === '$$' ? '$' : ({ _SOURCE_COMMIT: request.substitutions._SOURCE_COMMIT, BUILD_ID: result.id, PROJECT_ID: project }[a ?? b])));
  const matches = (value, expected) => equal(value, expected) || equal(value, expand(expected));
  if (!result || result.status !== 'SUCCESS' || result.projectId !== project || !execution(result.id) || result.serviceAccount !== identities[phase]) fail();
  for (const key of ['steps', 'artifacts', 'substitutions', 'options', 'timeout']) {
    // API may add per-step timing/status fields; compare the submitted fields only.
    if (key === 'steps') {
      if (result.steps?.length !== request.steps?.length) fail();
      for (let i = 0; i < request.steps.length; i++) for (const [field, value] of Object.entries(request.steps[i])) if (!matches(result.steps[i][field], value)) fail();
    } else if (!matches(result[key], request[key])) fail();
  }
  if (!equal(result.sourceProvenance?.resolvedStorageSource, request.source.storageSource)) fail();
  return result;
}
async function recordBuild(dir, root, run) {
  const source = sourceIdentity(await protectedRead(dir, 'source.json'));
  const foundation = await foundationEvidence(dir, root, source.commit);
  const request = await protectedRead(dir, 'build-request.json');
  const expected = await prepareRequest('build', dir, root);
  if (!equal(request, expected)) fail();
  const result = validateExecution(await protectedRead(dir, 'build-execution.json'), request, 'build');
  const worker = await protectedRead(dir, 'worker-receipt.json');
  if (worker.commit !== source.commit || worker.architecture !== 'linux/amd64') fail();
  const images = {}, artifacts = {};
  for (const name of ['app', 'checker']) {
    const artifact = objectIdentity(await protectedRead(dir, `${name}-object.json`), `${project}-deskdrop-artifacts`, `${source.commit}/${result.id}/`);
    if (artifact.name !== `${source.commit}/${result.id}/${name}.oci.tar`) fail();
    artifacts[name] = await protectedRead(dir, `${name}.oci.tar`, true);
    const remote = await run('gcloud', ['storage', 'cat', `gs://${artifact.bucket}/${artifact.name}#${artifact.generation}`], { binary: true, timeout: 120000, maxOutput: 2 * 1024 ** 3 });
    if (!Buffer.isBuffer(remote) || hash(remote) !== hash(artifacts[name])) fail();
    const observed = verifyOci(artifacts[name], source.commit);
    if (!equal(observed, worker.images?.[name])) fail();
    images[name] = { ...observed, artifact };
  }
  const toolchain = JSON.parse(await readFile(path.join(root, 'deploy/cloudbuild/toolchain.json')));
  const receipt = { phase: 'build', commit: source.commit, source, foundationHash: hash(Buffer.from(JSON.stringify(foundation))), configHash: hash(await readFile(path.join(root, 'deploy/cloudbuild/build.yaml'))), toolchainHash: hash(Buffer.from(JSON.stringify(toolchain))), serviceAccount: result.serviceAccount, executionId: result.id, architecture: 'linux/amd64', requestHash: hash(Buffer.from(JSON.stringify(request))), executionHash: hash(Buffer.from(JSON.stringify(result))), images };
  validateBuild(receipt, { source, foundation, toolchain, configHash: receipt.configHash, artifacts });
  await writeReceipt(dir, 'artifacts-verified.json', Object.fromEntries(['app', 'checker'].map(n => [n, images[n].artifact])));
  await writeReceipt(dir, 'cloud-build.json', receipt);
  return receipt;
}
export async function worker(action, commit, root = process.cwd()) {
  if (!['worker-verify', 'worker-stage'].includes(action) || !commitOk(commit)) fail();
  const images = {};
  for (const name of ['app', 'checker']) {
    const bytes = await readFile(path.join(root, `${name}.oci.tar`));
    images[name] = verifyOci(bytes, commit);
    if (action === 'worker-stage') {
      const approved = JSON.parse(await readFile(path.join(root, 'publication-input.json')));
      if (approved.commit !== commit || !equal(approved.images?.[name], images[name])) fail();
    }
    if (action === 'worker-stage') {
      const entries = tarMembers(bytes);
      for (const [member, value] of entries) {
        if (!['index.json', 'oci-layout'].includes(member) && !/^blobs\/sha256\/[a-f0-9]{64}$/.test(member)) fail();
        const target = path.join(root, 'oci', name, member);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, value, { flag: 'wx' });
      }
    }
  }
  if (action === 'worker-verify') await writeFile(path.join(root, 'worker-receipt.json'), JSON.stringify({ commit, architecture: 'linux/amd64', images }), { flag: 'wx' });
  return images;
}
export async function prepareRequest(phase, dir, root = process.cwd()) {
  if (!['build', 'publish'].includes(phase)) fail();
  const read = name => protectedRead(dir, name);
  const source = sourceIdentity(await read('source.json'));
  await foundationEvidence(dir, root, source.commit);
  if (!equal(await read('source-verified.json'), { source, files: await sourceConfiguration(root) }) || hash(await protectedRead(dir, 'source.tar', true)) !== source.archive.sha256) fail();
  const bytes = await readFile(path.join(root, `deploy/cloudbuild/${phase}.yaml`));
  const toolchain = JSON.parse(await readFile(path.join(root, 'deploy/cloudbuild/toolchain.json')));
  capability(await read(`${phase}-capability.json`), toolchain, hash(bytes), phase);
  let object = source.archive;
  if (phase === 'publish') {
    const { build } = await buildEvidence(dir, root);
    const approval = await read('cloud-publication-approval.json');
    const approved = publicationApproval(build, approval);
    if (approved.rollback && !equal(await read('rollback-verified.json'), approved.rollback)) fail();
    object = objectIdentity(await read('publication-source.json'), `${project}-deskdrop-artifacts`, `${source.commit}/publication/`);
    const bundle = await protectedRead(dir, 'publication-source.tar', true);
    if (!equal(await read('publication-source-verified.json'), object) || hash(bundle) !== object.sha256) fail();
    const entries = tarMembers(bundle);
    if (entries.size !== 4 || !equal(JSON.parse(entries.get('publication-input.json') ?? 'null'), { commit: source.commit, images: Object.fromEntries(['app', 'checker'].map(n => [n, verifyOci(entries.get(`${n}.oci.tar`), source.commit)])) })) fail();
    if (!entries.get('scripts/demo/cloud-release.mjs')?.equals(await readFile(path.join(root, 'scripts/demo/cloud-release.mjs')))) fail();
    for (const name of ['app', 'checker']) if (hash(entries.get(`${name}.oci.tar`)) !== build.images[name].artifact.sha256 || approved.images[name].split('@')[1] !== build.images[name].manifest) fail();
  }
  const config = JSON.parse(bytes);
  if (config.serviceAccount !== identities[phase] || config.steps.some(s => ![toolchain.builder, toolchain.node].includes(s.name))) fail();
  return { ...config, source: { storageSource: { bucket: object.bucket, object: object.name, generation: object.generation } }, substitutions: { _SOURCE_COMMIT: source.commit }, tags: [`deskdrop-${phase}`] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const [action, argument] = process.argv.slice(2);
  const result = action?.startsWith('worker-') ? worker(action, argument) : action?.startsWith('prepare-') ? prepareRequest(action.slice(8), argument) : cloudAction(action, argument);
  result.then(value => console.log(JSON.stringify(value)), () => { console.error('Cloud release blocked; inspect protected evidence'); process.exitCode = 1; });
}
