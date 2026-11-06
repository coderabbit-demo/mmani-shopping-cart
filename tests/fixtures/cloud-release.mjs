import { mkdtemp, mkdir, readFile, writeFile, rm, chmod, realpath, lstat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { compress, hash, verifyOci, identities, prepareRequest, cloudAction, registry } from '../../scripts/demo/cloud-release.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));
export const commit = 'a'.repeat(40), previous = 'b'.repeat(40), id = '11111111-2222-3333-4444-555555555555';
export const toolchain = JSON.parse(await readFile(path.join(repository, 'deploy/cloudbuild/toolchain.json')));
const clone = value => structuredClone(value);
const configuration = ['deploy/cloudbuild/build.yaml', 'deploy/cloudbuild/publish.yaml', 'deploy/cloudbuild/toolchain.json', 'scripts/demo/cloud-release.mjs'];
const target = ['--project=se-demos-project', '--zone=us-central1-a', '--tunnel-through-iap'];
const kinds = ['git.head', 'git.status', 'git.archive', 'storage.cat', 'registry.describe', 'terraform.plan', 'terraform.apply', 'compute.scp', 'compute.ssh'];
const blocked = () => { throw new Error('Unsupported offline fixture operation or custody path'); };
export async function checkoutSha(checkout = repository) {
  const validSha = value => /^[a-f0-9]{40}$/.test(value) && !/^0{40}$/.test(value);
  let git = path.join(checkout, '.git');
  const entry = await lstat(git);
  if (entry.isFile()) {
    const pointer = (await readFile(git, 'utf8')).trim().match(/^gitdir: ([^\r\n\0]+)$/)?.[1];
    if (!pointer) blocked();
    git = path.resolve(checkout, pointer);
  } else if (!entry.isDirectory()) blocked();
  const head = (await readFile(path.join(git, 'HEAD'), 'utf8')).trim();
  if (validSha(head)) return head;
  const ref = head.match(/^ref: (refs\/[A-Za-z0-9/_.-]+)$/)?.[1];
  if (!ref || ref.includes('..') || ref.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock'))) blocked();
  let common = git, directory;
  try { directory = (await readFile(path.join(git, 'commondir'), 'utf8')).trim(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (directory !== undefined) {
    if (!directory || /[\r\n\0]/.test(directory)) blocked();
    common = await realpath(path.resolve(git, directory));
  }
  try {
    const value = (await readFile(path.join(common, ref), 'utf8')).trim();
    if (!validSha(value)) blocked();
    return value;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const packed = await readFile(path.join(common, 'packed-refs'), 'utf8');
  const matches = packed.split(/\r?\n/).filter(line => line.endsWith(` ${ref}`));
  if (matches.length !== 1) blocked();
  const value = matches[0].match(/^([a-f0-9]{40}) [^ ]+$/)?.[1];
  if (!validSha(value ?? '')) blocked();
  return value;
}
export function tar(entries) {
  const blocks = [];
  for (const [name, bytes] of Object.entries(entries)) {
    const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(JSON.stringify(bytes));
    const header = Buffer.alloc(512);
    header.write(name); header.write('0000600\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(b.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
    header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, b, Buffer.alloc((512 - b.length % 512) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
export function oci(arch = 'amd64', source = commit) {
  const layer = Buffer.from('synthetic layer'), config = Buffer.from(JSON.stringify({ architecture: arch, os: 'linux', config: { Labels: { 'org.opencontainers.image.revision': source } } }));
  const descriptor = b => ({ digest: `sha256:${hash(b)}`, size: b.length });
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, config: descriptor(config), layers: [descriptor(layer)] }));
  const entries = { 'oci-layout': { imageLayoutVersion: '1.0.0' }, 'index.json': { schemaVersion: 2, manifests: [descriptor(manifest)] }, [`blobs/sha256/${hash(manifest)}`]: manifest, [`blobs/sha256/${hash(config)}`]: config, [`blobs/sha256/${hash(layer)}`]: layer };
  return { bytes: tar(entries), entries };
}
export function execution(request, phase = 'build') { return { ...clone(request), id, status: 'SUCCESS', projectId: 'se-demos-project', serviceAccount: identities[phase], sourceProvenance: { resolvedStorageSource: request.source.storageSource } }; }

export async function withCloudReleaseFixture(fn, { mode = 'seeded' } = {}) {
  if (!['seeded', 'empty'].includes(mode)) blocked();
  const owned = await realpath(await mkdtemp(path.join(os.tmpdir(), 'deskdrop-cloud-')));
  let active = true;
  try {
    await chmod(owned, 0o700);
    const root = path.join(owned, 'checkout'), dir = path.join(owned, 'receipts');
    const stateDir = path.join(owned, 'bootstrap-state');
    for (const folder of [dir, stateDir]) await mkdir(folder, { mode: 0o700 });
    for (const folder of ['deploy/cloudbuild', 'scripts/demo', 'infra/terraform/.terraform']) await mkdir(path.join(root, folder), { recursive: true });
    for (const file of configuration) await writeFile(path.join(root, file), await readFile(path.join(repository, file)));
    const backend = Buffer.from(JSON.stringify({ backend: { type: 'gcs', config: { bucket: 'se-demos-project-deskdrop-tfstate', prefix: 'deskdrop/demo' } } }));
    const backendFile = path.join(root, 'infra/terraform/.terraform/terraform.tfstate');
    await writeFile(backendFile, backend, { mode: 0o600 });
    const lock = mode === 'seeded' ? Buffer.from('pinned lock') : await readFile(path.join(repository, 'infra/terraform/.terraform.lock.hcl'));
    await writeFile(path.join(root, 'infra/terraform/.terraform.lock.hcl'), lock, { mode: 0o600 });
    const actualCheckoutSha = await checkoutSha();
    const sourceRaw = Buffer.from('synthetic committed archive'), sourceBytes = compress(sourceRaw);
    const source = { repository: 'https://github.com/coderabbit-demo/mmani-shopping-cart.git', commit, archive: { bucket: 'se-demos-project-deskdrop-source', name: `${commit}/source.tar.gz`, generation: '3', sha256: hash(sourceBytes) } };
    const input = Buffer.from(JSON.stringify({ project_id: 'se-demos-project', region: 'us-central1', zone: 'us-central1-a', environment: 'demo', phase: 'foundation' }));
    const planBytes = Buffer.from('approved saved plan');
    const foundation = { phase: 'foundation', commit, planHash: hash(planBytes), inputHash: hash(input), backendDigest: hash(backend), lockHash: hash(lock) };
    const image = oci(), observed = verifyOci(image.bytes, commit);
    const images = Object.fromEntries(['app', 'checker'].map(name => [name, { ...observed, artifact: { bucket: 'se-demos-project-deskdrop-artifacts', name: `${commit}/${id}/${name}.oci.tar`, generation: '5', sha256: hash(image.bytes) } }]));
    const calls = [], objects = new Map(), inventory = new Map(), faults = new Map(), remote = new Map();
    let gitHead = commit, dirty = '', archiveBytes = sourceRaw;
    async function custody(file) {
      if (!active || !path.isAbsolute(file) || path.normalize(file) !== file || !file.startsWith(owned + path.sep)) blocked();
      const relative = path.relative(owned, file).split(path.sep);
      let parent = owned;
      const st = await lstat(owned);
      if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || st.mode & 0o077 || await realpath(owned) !== owned) blocked();
      for (const segment of relative) {
        parent = path.join(parent, segment);
        try { const item = await lstat(parent); if (item.isSymbolicLink() || (item.isFile() && item.nlink !== 1)) blocked(); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return file;
    }
    async function write(name, value) {
      if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) blocked();
      const file = await custody(path.join(dir, name));
      await writeFile(file, Buffer.isBuffer(value) ? value : JSON.stringify(value), { mode: 0o600 });
    }
    function objectKey(uri) {
      if (typeof uri !== 'string' || !new RegExp(`^gs://se-demos-project-deskdrop-(?:source|artifacts)/${commit}/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+#[1-9][0-9]*$`).test(uri) || uri.split('/').some(p => p === '..' || p === '.')) blocked();
      return uri;
    }
    function imageKey(ref) {
      if (typeof ref !== 'string' || !ref.startsWith(`${registry}/`) || !/^(?:deskdrop|checker)(?:@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$/.test(ref.slice(registry.length + 1))) blocked();
      return ref;
    }
    const provider = {
      putObject(uri, bytes) { if (!active || !Buffer.isBuffer(bytes)) blocked(); objects.set(objectKey(uri), Buffer.from(bytes)); },
      removeObject(uri) { if (!active) blocked(); objects.delete(objectKey(uri)); },
      setImage(ref, summary) { if (!active) blocked(); inventory.set(imageKey(ref), clone(summary)); },
      removeImage(ref) { if (!active) blocked(); inventory.delete(imageKey(ref)); },
      setGit({ head = commit, status = '', archive = sourceRaw } = {}) {
        if (!active || typeof head !== 'string' || typeof status !== 'string' || !Buffer.isBuffer(archive)) blocked();
        gitHead = head; dirty = status; archiveBytes = Buffer.from(archive);
      },
      failNext(kind, message = 'Synthetic provider fault') { if (!active || !kinds.includes(kind) || typeof message !== 'string') blocked(); faults.set(kind, message); },
      setRemote(command, timeout, output = '') {
        if (!active || typeof command !== 'string' || !command || command.includes('\0') || ![600000, 1800000].includes(timeout) || typeof output !== 'string') blocked();
        remote.set(JSON.stringify([command, timeout]), output);
      }
    };
    async function run(file, args, options) {
      const call = { file, args: clone(args), options: clone(options), outcome: 'rejected' };
      calls.push(call);
      if (!active || !Array.isArray(args) || args.some(a => typeof a !== 'string' || a.includes('\0'))) blocked();
      const equal = (a, b) => isDeepStrictEqual(a, b);
      let kind, effect;
      if (file === 'git' && equal(args, ['rev-parse', 'HEAD']) && options === undefined) { kind = 'git.head'; effect = () => gitHead; }
      if (file === 'git' && equal(args, ['status', '--porcelain', '--untracked-files=normal']) && options === undefined) { kind = 'git.status'; effect = () => dirty; }
      if (file === 'git' && equal(args, ['archive', '--format=tar', commit]) && equal(options, { binary: true, maxOutput: 50000000 })) { kind = 'git.archive'; effect = () => Buffer.from(archiveBytes); }
      if (file === 'gcloud' && args.length === 3 && equal(args.slice(0, 2), ['storage', 'cat'])) {
        const key = objectKey(args[2]);
        const ceiling = limit => limit + Math.ceil(limit / 16384) * 5 + 65536;
        const limit = key.includes('/source.tar.gz#') && key.startsWith('gs://se-demos-project-deskdrop-source/') ? ceiling(50000000) : key.includes('/publication/') ? ceiling(4 * 1024 ** 3) : 2 * 1024 ** 3;
        if (!equal(options, { binary: true, timeout: 120000, maxOutput: limit })) blocked();
        kind = 'storage.cat'; effect = () => { if (!objects.has(key)) throw new Error('Synthetic object absent'); return Buffer.from(objects.get(key)); };
      }
      if (file === 'gcloud' && args.length === 7 && equal(args.slice(0, 4), ['artifacts', 'docker', 'images', 'describe']) && equal(args.slice(5), ['--project=se-demos-project', '--format=json']) && equal(options, { timeout: 15000, maxOutput: 16384 })) {
        const key = imageKey(args[4]); kind = 'registry.describe'; effect = () => { if (!inventory.has(key)) throw new Error('Synthetic registry image absent'); return JSON.stringify({ image_summary: inventory.get(key) }); };
      }
      if (file === 'terraform') {
        for (const which of ['bootstrap', 'foundation', 'release']) {
          const phaseRoot = `-chdir=infra/${which === 'bootstrap' ? which : 'terraform'}`;
          const planPath = path.join(dir, `${which}.tfplan`), inputPath = path.join(dir, `${which}.tfvars.json`);
          const statePath = path.join(stateDir, 'terraform.tfstate'), state = which === 'bootstrap' ? [`-state=${statePath}`] : [];
          if (equal(args, [phaseRoot, 'plan', '-input=false', `-var-file=${inputPath}`, `-out=${planPath}`, ...state]) && equal(options, { timeout: 600000 })) {
            await custody(inputPath); await custody(planPath); if (state.length) await custody(statePath);
            kind = 'terraform.plan'; effect = async () => { await writeFile(planPath, `${which} saved plan`, { mode: 0o600, flag: 'wx' }); return ''; };
          }
          if (equal(args, [phaseRoot, 'apply', '-input=false', ...state, planPath]) && equal(options, { timeout: 1800000 })) {
            await custody(planPath); if (state.length) await custody(statePath);
            kind = 'terraform.apply'; effect = async () => { await readFile(planPath); if (state.length) await writeFile(statePath, '{"fixture":"synthetic state"}', { mode: 0o600 }); return ''; };
          }
        }
      }
      if (file === 'gcloud' && equal(args, ['compute', 'scp', 'deploy/bootstrap.sh', 'deploy/compose.yaml', 'deskdrop-demo:/tmp/', ...target]) && options === undefined) { kind = 'compute.scp'; effect = () => ''; }
      if (file === 'gcloud' && args.length === 7 && equal(args.slice(0, 6), ['compute', 'ssh', 'deskdrop-demo', ...target]) && args[6].startsWith('--command=') && options && equal(Object.keys(options), ['timeout'])) {
        const key = JSON.stringify([args[6].slice(10), options.timeout]);
        if (!remote.has(key)) blocked();
        kind = 'compute.ssh'; effect = () => remote.get(key);
      }
      if (!kind) blocked();
      if (['storage.cat', 'registry.describe'].includes(kind)) {
        assert.equal(file, 'gcloud'); assert.equal(options.timeout, args[0] === 'storage' ? 120000 : 15000);
        if (kind === 'registry.describe') {
          assert.deepEqual(args.slice(0, 4), ['artifacts', 'docker', 'images', 'describe']);
          assert.equal(args[5], '--project=se-demos-project'); assert.equal(args[6], '--format=json');
          if (args[4].includes('@')) assert.match(args[4], /^us-central1-docker\.pkg\.dev\/se-demos-project\/deskdrop\/(deskdrop|checker)@sha256:[a-f0-9]{64}$/);
        }
      }
      call.kind = kind;
      if (faults.has(kind)) { const message = faults.get(kind); faults.delete(kind); call.outcome = 'fault'; throw new Error(message); }
      try { const result = await effect(); call.outcome = 'returned'; return result; }
      catch (error) { call.outcome = 'fault'; throw error; }
    }
    async function seedCapabilities() {
      for (const phase of ['build', 'publish']) await write(`${phase}-capability.json`, { schema: 1, phase, toolchainHash: hash(Buffer.from(JSON.stringify(toolchain))), configHash: hash(await readFile(path.join(root, `deploy/cloudbuild/${phase}.yaml`))), executionId: id, serviceAccount: identities[phase], architecture: 'linux/amd64', builder: toolchain.builder, passed: true, observed: toolchain.requiredCapabilities[phase] });
    }
    async function stageBuildArtifacts() {
      for (const name of ['app', 'checker']) {
        await write(`${name}.oci.tar`, image.bytes); await write(`${name}-object.json`, images[name].artifact);
        const a = images[name].artifact; provider.putObject(`gs://${a.bucket}/${a.name}#${a.generation}`, image.bytes);
        const ref = `${registry}/${name === 'app' ? 'deskdrop' : name}@${observed.manifest}`;
        provider.setImage(ref, { digest: observed.manifest, fully_qualified_digest: ref });
      }
      await write('worker-receipt.json', { commit, architecture: 'linux/amd64', images: { app: observed, checker: observed } });
    }
    async function build() {
      const request = await prepareRequest('build', dir, root);
      await write('build-request.json', request); await write('build-execution.json', execution(request));
      return cloudAction('record-build', dir, run, root);
    }
    async function publish() {
      const b = await build();
      const approval = { phase: 'publication', approved: true, owner: 'pilot', buildHash: hash(Buffer.from(JSON.stringify(b))), images: Object.fromEntries(['app', 'checker'].map(n => [n, `${registry}/${n === 'app' ? 'deskdrop' : n}@${observed.manifest}`])), initialRelease: true, noPriorReleaseConfirmed: true };
      await write('cloud-publication-approval.json', approval);
      const bundle = compress(tar({ 'scripts/demo/cloud-release.mjs': await readFile(path.join(root, 'scripts/demo/cloud-release.mjs')), 'app.oci.tar': image.bytes, 'checker.oci.tar': image.bytes, 'publication-input.json': { commit, images: { app: observed, checker: observed } } }));
      const object = { bucket: 'se-demos-project-deskdrop-artifacts', name: `${commit}/publication/bundle.tar.gz`, generation: '9', sha256: hash(bundle) };
      await write('publication-source.tar.gz', bundle); await write('publication-source.json', object); await write('publication-source-verified.json', object);
      provider.putObject(`gs://${object.bucket}/${object.name}#${object.generation}`, bundle);
      const request = await prepareRequest('publish', dir, root);
      await write('publish-request.json', request); await write('publish-execution.json', execution(request, 'publish'));
      return { b, approval, request };
    }
    if (mode === 'seeded') {
      await write('source.json', source); await write('source.tar.gz', sourceBytes);
      await write('source-verified.json', { source, files: Object.fromEntries(await Promise.all(configuration.map(async name => [name, hash(await readFile(path.join(root, name)))]))) });
      await write('foundation-applied.json', foundation); await write('foundation-plan.json', { ...foundation, which: 'foundation' }); await write('foundation.tfplan', planBytes); await write('foundation.tfvars.json', input);
      await seedCapabilities(); await stageBuildArtifacts();
    }
    provider.putObject(`gs://${source.archive.bucket}/${source.archive.name}#${source.archive.generation}`, sourceBytes);
    return await fn({ dir, root, artifacts: dir, cloudRoot: root, baselineContext: { artifacts: dir, cloudRoot: root, backendFile }, statePath: path.join(stateDir, 'terraform.tfstate'), actualCheckoutSha, synthetic: { commit, executionId: id, mode }, source, foundation, image, observed, images, run, provider, calls, write, seedCapabilities, stageBuildArtifacts, build, publish });
  } finally {
    active = false;
    await rm(owned, { recursive: true, force: true });
  }
}
