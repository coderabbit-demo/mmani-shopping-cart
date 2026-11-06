import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm, chmod, symlink, realpath, readdir, stat, link } from 'node:fs/promises';
import path from 'node:path';
import { compress, decompress, hash, verifyOci, sourceIdentity, objectIdentity, validateBuild, validatePublication, validateFoundation, capability, identities, prepareRequest, worker, cloudAction, registry, validateExecution } from '../scripts/demo/cloud-release.mjs';
import { withCloudReleaseFixture as fixture, tar, oci, execution, commit, previous, id, toolchain } from './fixtures/cloud-release.mjs';
const put = (dir, name, value) => writeFile(path.join(dir, name), Buffer.isBuffer(value) ? value : JSON.stringify(value), { mode: 0o600 });
const clone = value => structuredClone(value);
test('OCI bytes bind manifest/config/layers, source and amd64; reject corrupt blobs, paths and descriptors', () => {
  const { bytes, entries } = oci(); assert.ok(verifyOci(bytes, commit).manifest.startsWith('sha256:'));
  for (const bad of [oci('arm64').bytes, oci('amd64', previous).bytes, tar({ ...entries, '../escape': Buffer.from('bad') }), bytes.subarray(0, 100), tar({ ...entries, [`blobs/sha256/${hash(Buffer.from('synthetic layer'))}`]: Buffer.from('tampered') })]) assert.throws(() => verifyOci(bad, commit));
  const bad = clone(entries['index.json']); bad.manifests[0].size++;
  assert.throws(() => verifyOci(tar({ ...entries, 'index.json': bad }), commit));
});
test('source, object generations, principal, phase and zero digests fail closed', async () => fixture(async ({ source, foundation, images, image, root }) => {
  assert.equal(sourceIdentity(source), source);
  for (const mutation of [{ repository: 'wrong' }, { commit: '0'.repeat(40) }, { commit: [commit] }, { archive: { ...source.archive, generation: '0' } }, { archive: { ...source.archive, name: `${commit}/../evil` } }]) assert.throws(() => sourceIdentity({ ...source, ...mutation }));
  assert.throws(() => objectIdentity({ ...source.archive, generation: 3 }, source.archive.bucket, `${commit}/`));
  for (const phase of ['release', undefined]) assert.throws(() => validateFoundation({ ...foundation, phase }, commit));
  const configHash = hash(await readFile(path.join(root, 'deploy/cloudbuild/build.yaml')));
  const build = { phase: 'build', commit, source, foundationHash: hash(Buffer.from(JSON.stringify(foundation))), configHash, toolchainHash: hash(Buffer.from(JSON.stringify(toolchain))), serviceAccount: identities.build, executionId: id, architecture: 'linux/amd64', images };
  const ctx = { source, foundation, toolchain, configHash, artifacts: { app: image.bytes, checker: image.bytes } };
  assert.equal(validateBuild(build, ctx), build);
  for (const mutation of [{ phase: 'foundation' }, { serviceAccount: identities.publish }, { architecture: 'linux/arm64' }, { configHash: 'c'.repeat(64) }, { toolchainHash: 'c'.repeat(64) }, { executionId: 'not-a-build-id' }]) assert.throws(() => validateBuild({ ...build, ...mutation }, ctx));
  const changed = clone(build); changed.images.app.artifact.generation = '0'; assert.throws(() => validateBuild(changed, ctx));
}));
test('request preparation requires exact capability/source/foundation receipts before any mutation', async () => fixture(async ({ dir, root }) => {
  const request = await prepareRequest('build', dir, root);
  assert.equal(request.serviceAccount, identities.build); assert.equal(request.source.storageSource.generation, '3');
  assert.ok(!('foundationHash' in request));
  assert.ok(request.steps.every(s => s.name.includes('@sha256:')));
  const cap = JSON.parse(await readFile(path.join(dir, 'build-capability.json')));
  for (const patch of [{ passed: false }, { builder: 'latest' }, { observed: [] }, { configHash: 'f'.repeat(64) }, { serviceAccount: identities.publish }]) {
    await put(dir, 'build-capability.json', { ...cap, ...patch }); await assert.rejects(prepareRequest('build', dir, root));
  }
  await put(dir, 'build-capability.json', toolchain.binaryVerification);
  await assert.rejects(prepareRequest('build', dir, root), 'binary probe is not live export capability');
  await put(dir, 'build-capability.json', cap);
  for (const name of ['source.tar.gz', 'foundation.tfplan', 'foundation.tfvars.json']) {
    const bytes = await readFile(path.join(dir, name)); await put(dir, name, Buffer.from('tampered')); await assert.rejects(prepareRequest('build', dir, root)); await put(dir, name, bytes);
  }
  for (const name of ['deploy/cloudbuild/build.yaml', 'deploy/cloudbuild/toolchain.json', 'scripts/demo/cloud-release.mjs']) {
    const bytes = await readFile(path.join(root, name)); await writeFile(path.join(root, name), 'changed'); await assert.rejects(prepareRequest('build', dir, root)); await writeFile(path.join(root, name), bytes);
  }
  await writeFile(path.join(root, 'infra/terraform/.terraform.lock.hcl'), 'changed'); await assert.rejects(prepareRequest('build', dir, root));
}));
test('actual execution principal/config/source generation required; unknown/partial build is not accepted', async () => fixture(async ({ dir, root, calls, run }) => {
  const request = await prepareRequest('build', dir, root), success = execution(request);
  assert.equal(validateExecution(success, request, 'build'), success);
  for (const patch of [{ status: 'WORKING' }, { status: 'FAILURE' }, { projectId: 'other' }, { serviceAccount: identities.publish }, { steps: [] }, { sourceProvenance: { resolvedStorageSource: { ...request.source.storageSource, generation: '4' } } }]) assert.throws(() => validateExecution({ ...success, ...patch }, request, 'build'));
  await put(dir, 'build-request.json', request); await put(dir, 'build-execution.json', { ...success, status: 'WORKING' });
  await assert.rejects(cloudAction('record-build', dir, run, root)); assert.equal(calls.length, 0);
}));
test('build artifacts read back by generation; publisher uses exact same bytes with independent approval', async () => fixture(async ({ dir, root, run, calls, publish, observed }) => {
  await assert.rejects(prepareRequest('publish', dir, root));
  const { request } = await publish();
  assert.equal(request.serviceAccount, identities.publish); assert.equal(request.source.storageSource.generation, '9');
  assert.equal(request.artifacts.oci.length, 2);
  assert.ok(!request.steps.some(s => s.name === toolchain.builder));
  const receipt = await cloudAction('record-publication', dir, run, root);
  assert.equal(receipt.images.app, `${registry}/deskdrop@${observed.manifest}`);
  const rel = await cloudAction('release', dir, run, root); assert.equal(rel.phase, 'release'); assert.equal(rel.appDigest, observed.manifest);
  await assert.rejects(cloudAction('release', dir, run, root), 'write-once release');
  assert.ok(calls.every(c => c.args[0] === 'storage' || c.args.slice(0, 4).join(' ') === 'artifacts docker images describe'));
  const original = await readFile(path.join(dir, 'cloud-build.json')); const tampered = JSON.parse(original); tampered.images.app.manifest = `sha256:${'0'.repeat(64)}`;
  await put(dir, 'cloud-build.json', tampered); await assert.rejects(cloudAction('verify', dir, run, root));
}));
test('partial or unknown publication uses bounded readback and never resubmits or invents success', async () => fixture(async ({ dir, root, publish, run, calls }) => {
  const { request } = await publish(); await put(dir, 'publish-execution.json', { ...execution(request, 'publish'), status: 'WORKING' });
  await assert.rejects(cloudAction('record-publication', dir, run, root));
  assert.equal(calls.filter(c => c.args[0] === 'artifacts').length, 0);
  let readbacks = 0;
  const partial = async (...args) => { readbacks++; if (readbacks === 2) throw new Error('absent or unknown'); return run(...args); };
  await assert.rejects(cloudAction('publication-status', dir, partial, root)); assert.equal(readbacks, 2);
  assert.equal((await cloudAction('publication-status', dir, run, root)).status, 'confirmed');
  await assert.rejects(readFile(path.join(dir, 'publication.json')), { code: 'ENOENT' });
}));
test('approval is exact; first release needs explicit absence and later release preserves approved prior digests', async () => fixture(async ({ publish }) => {
  const { b, approval } = await publish();
  const receipt = { phase: 'publication', commit, buildHash: approval.buildHash, serviceAccount: identities.publish, executionId: id, images: approval.images, rollback: null };
  assert.equal(validatePublication(receipt, b, approval), receipt);
  for (const patch of [{ initialRelease: false }, { approved: false }, { noPriorReleaseConfirmed: false }, { images: { ...approval.images, app: `${registry}/deskdrop:latest` } }, { buildHash: 'f'.repeat(64) }]) assert.throws(() => validatePublication(receipt, b, { ...approval, ...patch }));
  const rollback = { commit: previous, images: { app: `${registry}/deskdrop@sha256:${'b'.repeat(64)}`, checker: `${registry}/checker@sha256:${'c'.repeat(64)}` } };
  assert.equal(validatePublication({ ...receipt, rollback }, b, { ...approval, initialRelease: false, rollback }).rollback, rollback);
  assert.throws(() => validatePublication({ ...receipt, rollback: { ...rollback, commit } }, b, { ...approval, rollback }));
}));
test('publisher stage verifies approval bytes and writes only OCI layouts, without Docker or credentials', async () => fixture(async ({ dir, image, observed }) => {
  await put(dir, 'publication-input.json', { commit, images: { app: observed, checker: observed } });
  await worker('worker-stage', commit, dir);
  assert.ok((await readFile(path.join(dir, 'oci/app/index.json'))).length);
  await assert.rejects(worker('worker-stage', commit, dir), 'cannot overwrite prior staging');
  const bad = clone(observed); bad.manifest = `sha256:${'f'.repeat(64)}`;
  await put(dir, 'publication-input.json', { commit, images: { app: bad, checker: observed } });
  await assert.rejects(worker('worker-stage', commit, dir));
  assert.ok(image.bytes.length);
}));
test('receipts reject unsafe permissions, symlinks and corrupt source before subprocesses', async () => fixture(async ({ dir, root, run, calls }) => {
  await chmod(path.join(dir, 'source.json'), 0o644); await assert.rejects(cloudAction('verify-source', dir, run, root)); assert.equal(calls.length, 0);
  await chmod(path.join(dir, 'source.json'), 0o600); await rm(path.join(dir, 'source.tar.gz')); await symlink(path.join(dir, 'source.json'), path.join(dir, 'source.tar.gz'));
  await assert.rejects(prepareRequest('build', dir, root)); assert.equal(calls.length, 0);
}));

test('bundle creates deterministic approved OCI transfer without rebuilding and refuses overwrite', async () => fixture(async ({ dir, root, publish, run }) => {
  await publish(); await rm(path.join(dir, 'publication-source.tar.gz'));
  const result = await cloudAction('bundle', dir, run, root);
  const bytes = await readFile(path.join(dir, 'publication-source.tar.gz'));
  assert.equal(hash(bytes), result.sha256);
  await rm(path.join(dir, 'publication-source.tar.gz'));
  assert.deepEqual(await cloudAction('bundle', dir, run, root), result);
  assert.ok(bytes.equals(await readFile(path.join(dir, 'publication-source.tar.gz'))));
  await assert.rejects(cloudAction('bundle', dir, run, root));
}));

import { action as baseline } from '../scripts/demo/baseline.mjs';
test('verified cloud release plans, applies and deploys in order, binding evidence and files', async () => fixture(async ({ dir, root, publish, run, calls }) => {
  await publish(); await cloudAction('record-publication', dir, run, root);
  const release = await cloudAction('release', dir, run, root);
  const baselineCalls = [];
  const fake = async (file, args, options) => {
    baselineCalls.push({ file, args, options });
    if (file === 'git') return args[0] === 'rev-parse' ? commit : '';
    if (file === 'terraform' && args.includes('plan')) await writeFile(args.find(a => a.startsWith('-out=')).slice(5), 'release saved plan', { mode: 0o600 });
    return '';
  };
  const ctx = { artifacts: dir, cloudRoot: root, backendFile: path.join(root, 'infra/terraform/.terraform/terraform.tfstate') };
  await put(dir, 'release.tfvars.json', { project_id: 'se-demos-project', region: 'us-central1', zone: 'us-central1-a', environment: 'demo', phase: 'release', cloud_release: true, image_digest: `${registry}/deskdrop@${release.appDigest}` });
  const plan = await baseline('plan', ['release'], fake, ctx);
  assert.equal(plan.phase, 'release'); assert.equal(plan.evidenceHash, release.evidenceHash);
  assert.deepEqual(baselineCalls.find(c => c.file === 'terraform').args.slice(0, 3), ['-chdir=infra/terraform', 'plan', '-input=false']);
  await assert.rejects(baseline('deploy', [], fake, ctx));
  await put(dir, 'release-approval.json', { planHash: plan.planHash, permissionsChecked: true, stateCustodyConfirmed: true, costApproved: true, owner: 'pilot', teardown: 'retain registry and state' });
  assert.equal((await baseline('apply', ['release'], fake, ctx)).status, 'applied');
  const approval = { commit, appDigest: release.appDigest, checkerDigest: release.checkerDigest, planHash: plan.planHash, secretProvisioned: true, vmReady: true, iapAuthorized: true, costApproved: true, owner: 'pilot' };
  await put(dir, 'deploy-approval.json', approval);
  assert.equal((await baseline('host-install', [], fake, ctx)).status, 'host-installed');
  assert.equal((await baseline('deploy', [], fake, ctx)).status, 'deployed');
  const remoteCalls = baselineCalls.filter(c => c.file === 'gcloud');
  assert.equal(remoteCalls.length, 3);
  assert.ok(remoteCalls.every(c => c.args.includes('--tunnel-through-iap') && c.args.includes('--project=se-demos-project') && c.args.includes('--zone=us-central1-a')));
  const before = remoteCalls.length;
  for (const name of ['release.tfplan', 'release.tfvars.json', 'release-plan.json', 'foundation-applied.json', 'build-request.json', 'publish-execution.json']) {
    const original = await readFile(path.join(dir, name));
    await put(dir, name, Buffer.from(name.endsWith('.json') ? '{}' : 'tampered'));
    await assert.rejects(baseline('host-install', [], fake, ctx));
    await put(dir, name, original);
    assert.equal(baselineCalls.filter(c => c.file === 'gcloud').length, before);
  }
  await put(dir, 'release-applied.json', { commit, phase: 'foundation', planHash: plan.planHash, evidenceHash: release.evidenceHash });
  await assert.rejects(baseline('host-install', [], fake, ctx));
  assert.equal(baselineCalls.filter(c => c.file === 'gcloud').length, before);
  assert.ok(calls.every(c => !c.args.includes('submit')));
}));

test('later publication requires actual prior full-commit tags to resolve to the approved rollback', async () => fixture(async ({ dir, root, publish, run, observed }) => {
  const { approval } = await publish();
  const rollback = { commit: previous, images: { app: `${registry}/deskdrop@${observed.manifest}`, checker: `${registry}/checker@${observed.manifest}` } };
  await put(dir, 'cloud-publication-approval.json', { ...approval, initialRelease: false, rollback });
  await assert.rejects(prepareRequest('publish', dir, root));
  let calls = 0;
  const prior = async (file, args, opts) => {
    calls++; assert.equal(file, 'gcloud'); assert.equal(opts.timeout, 15000);
    assert.equal(args[4], `${registry}/${calls === 1 ? 'deskdrop' : 'checker'}:${previous}`);
    return JSON.stringify({ image_summary: { digest: observed.manifest, fully_qualified_digest: rollback.images[calls === 1 ? 'app' : 'checker'] } });
  };
  assert.equal((await cloudAction('verify-rollback', dir, prior, root)).status, 'rollback-verified'); assert.equal(calls, 2);
  assert.equal((await prepareRequest('publish', dir, root)).serviceAccount, identities.publish);
  await rm(path.join(dir, 'rollback-verified.json'));
  await assert.rejects(cloudAction('verify-rollback', dir, async () => JSON.stringify({ image_summary: { digest: 'wrong' } }), root));
  await assert.rejects(prepareRequest('publish', dir, root));
}));

test('source verification compares committed archive and exact remote generation; bad bytes produce no receipt', async () => fixture(async ({ dir, root, source }) => {
  await rm(path.join(dir, 'source-verified.json'));
  const bytes = await readFile(path.join(dir, 'source.tar.gz')); let calls = [];
  const run = async (file, args, opts) => {
    calls.push({ file, args, opts });
    if (file === 'git') {
      if (args[0] === 'rev-parse') { assert.deepEqual(args, ['rev-parse', 'HEAD']); return commit; }
      if (args[0] === 'status') { assert.deepEqual(args, ['status', '--porcelain', '--untracked-files=normal']); return ''; }
      assert.deepEqual(args, ['archive', '--format=tar', commit]); return decompress(bytes);
    }
    assert.equal(file, 'gcloud'); assert.deepEqual(args, ['storage', 'cat', `gs://${source.archive.bucket}/${source.archive.name}#3`]); assert.equal(opts.timeout, 120000); return bytes;
  };
  assert.equal((await cloudAction('verify-source', dir, run, root)).status, 'source-verified'); assert.equal(calls.length, 4);
  await rm(path.join(dir, 'source-verified.json'));
  await assert.rejects(cloudAction('verify-source', dir, async (f, ...rest) => f === 'gcloud' ? Buffer.from('substituted') : run(f, ...rest), root));
  await assert.rejects(readFile(path.join(dir, 'source-verified.json')), { code: 'ENOENT' });
  for (const wrong of ['dirty', 'head']) {
    calls = [];
    await assert.rejects(cloudAction('verify-source', dir, async (f, args, opts) => f === 'git' && args[0] === (wrong === 'dirty' ? 'status' : 'rev-parse') ? (wrong === 'dirty' ? ' M Dockerfile' : previous) : run(f, args, opts), root));
    assert.equal(calls.filter(c => c.file === 'gcloud').length, 0);
  }
}));

import { spawnSync } from 'node:child_process';
test('pinned Cloud Build shell exports with an owned docker-container builder and cleans only that builder', async () => fixture(async ({ dir, root }) => {
  const config = JSON.parse(await readFile(path.join(root, 'deploy/cloudbuild/build.yaml')));
  const step = config.steps[0];
  assert.equal(step.name, 'docker.io/library/docker@sha256:b0d99f37f463c88cae2082083f705210296186c06632d22f6952ed43506ae520');
  assert.equal(toolchain.buildkit, 'docker.io/moby/buildkit@sha256:97719ccb2ac86fb44fd36f330a6d302f63dddd5326f3ada24f9c05ccac0d9098');
  assert.equal(step.entrypoint, 'sh');
  const shell = step.args[1].replaceAll('$$', '$').replaceAll('$BUILD_ID', id).replaceAll('${_SOURCE_COMMIT}', commit);
  const bin = path.join(dir, 'bin'); await mkdir(bin, { mode: 0o700 });
  const log = path.join(dir, 'docker-calls.jsonl');
  await writeFile(path.join(bin, 'docker'), `#!/bin/sh
{ printf '['; sep=''; for arg do printf '%s"%s"' "$sep" "$arg"; sep=,; done; printf ']\\n'; } >> "$FIXTURE_LOG"
if [ "$1" = --version ]; then
  if [ "$FIXTURE_FAIL" = version ]; then printf 'Docker version wrong\\n'; else printf 'Docker version 29.9.3, build 5457199\\n'; fi
elif [ "$2" = version ]; then printf 'github.com/docker/buildx v0.38.2 3c4cbd35852fc1a476923627a780a7836c28b654\\n'
elif [ "$2" = "$FIXTURE_FAIL" ]; then exit 23
fi
`, { mode: 0o700 });
  for (const failure of ['', 'version', 'create', 'inspect', 'build', 'rm']) {
    await put(dir, 'docker-calls.jsonl', Buffer.alloc(0));
    const executable = process.platform === 'darwin' ? '/bin/bash' : 'sh';
    const args = process.platform === 'darwin' ? ['--posix', '-ceu', shell] : ['-ceu', shell];
    const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 10000, env: { PATH: `${bin}:${process.env.PATH}`, FIXTURE_LOG: log, FIXTURE_FAIL: failure } });
    const diagnostic = JSON.stringify({ failure, status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr });
    assert.equal(result.error, undefined, diagnostic);
    assert.equal(result.signal, null, diagnostic);
    assert.equal(result.status === 0, failure === '', diagnostic);
    const calls = (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(x => JSON.parse(x));
    const create = calls.find(c => c[1] === 'create'), cleanup = calls.filter(c => c[1] === 'rm');
    if (failure === 'version') { assert.equal(create, undefined); assert.equal(cleanup.length, 0); continue; }
    assert.deepEqual(create, ['buildx', 'create', '--name', `deskdrop-${id}`, '--driver', 'docker-container', `--driver-opt=image=${toolchain.buildkit}`]);
    if (failure === 'create') { assert.equal(cleanup.length, 0, 'name conflict must not remove existing builder'); assert.ok(!calls.some(c => ['inspect', 'build'].includes(c[1]))); continue; }
    assert.deepEqual(cleanup, [['buildx', 'rm', '--force', `deskdrop-${id}`]]);
    const builds = calls.filter(c => c[1] === 'build');
    assert.equal(builds.length, failure === 'inspect' ? 0 : failure === 'build' ? 1 : 2);
    for (const args of builds) {
      assert.equal(args[args.indexOf('--builder') + 1], `deskdrop-${id}`);
      assert.ok(args.includes('--platform=linux/amd64') && !args.includes('--load'));
      assert.match(args[args.indexOf('--output') + 1], /^type=oci,dest=\/workspace\/(app|checker)\.oci\.tar$/);
    }
  }
}));

test('compressed bundles are deterministic and enforce input/output bounds and corrupt gzip rejection', () => {
  const raw = tar({ 'fixture.json': Buffer.from('synthetic archive') });
  const zipped = compress(raw);
  assert.ok(compress(raw).equals(zipped)); assert.ok(decompress(zipped).equals(raw));
  assert.throws(() => decompress(zipped, 10));
  assert.throws(() => decompress(Buffer.alloc(70000), 10));
  const corrupt = Buffer.from(zipped); corrupt[corrupt.length - 8] ^= 1;
  for (const bad of [raw, corrupt, zipped.subarray(0, zipped.length - 4)]) assert.throws(() => decompress(bad));
});
test('REST output-only metadata is accepted while changed inputs and unknown additions are rejected', async () => fixture(async ({ dir, root }) => {
  for (const phase of ['build']) {
    const request = await prepareRequest(phase, dir, root), result = execution(request, phase);
    result.artifacts.objects.timing = { startTime: '2026-11-06T00:00:00Z', endTime: '2026-11-06T00:00:01Z' };
    result.options.resolvedWorkerRelease = 'resolved-worker'; result.steps[0].status = 'SUCCESS'; result.steps[0].exitCode = 0;
    result.steps[0].timing = result.artifacts.objects.timing; result.steps[0].pullTiming = result.artifacts.objects.timing;
    assert.equal(validateExecution(result, request, phase), result);
    const changes = [r => r.options.logging = 'NONE', r => r.options.workerRelease = 'other', r => r.options.unknown = true, r => r.artifacts.objects.location = 'gs://wrong/', r => r.artifacts.objects.paths.push('extra'), r => r.artifacts.objects.unknown = true, r => r.steps[0].env = ['UNAPPROVED=1'], r => r.steps[0].args.push('extra'), r => r.steps[0].unknown = true, r => r.source.storageSource.generation = '7'];
    for (const change of changes) { const bad = clone(result); change(bad); assert.throws(() => validateExecution(bad, request, phase)); }
  }
}));
test('canonical fixture paths retain production rejection of directory aliases', async () => fixture(async ({ dir, root }) => {
  assert.equal(await realpath(dir), dir);
  const alias = path.join(path.dirname(dir), 'receipt-alias'); await symlink(dir, alias);
  await assert.rejects(prepareRequest('build', alias, root));
  assert.equal((await prepareRequest('build', await realpath(alias), root)).serviceAccount, identities.build);
}));
test('source archive helper writes compressed actual Git bytes once with matching hash', async () => fixture(async ({ dir, root }) => {
  await rm(path.join(dir, 'source.tar.gz'));
  const raw = tar({ 'source.txt': Buffer.from('committed content') });
  const run = async (file, args) => { assert.equal(file, 'git'); return args[0] === 'rev-parse' ? commit : args[0] === 'status' ? '' : raw; };
  const result = await cloudAction('source-archive', dir, run, root);
  const bytes = await readFile(path.join(dir, 'source.tar.gz'));
  assert.equal(result.sha256, hash(bytes)); assert.ok(decompress(bytes).equals(raw));
  await assert.rejects(cloudAction('source-archive', dir, run, root));
}));

test('publication readback binds actual gzip bytes and generation before parsing the approved tar', async () => fixture(async ({ dir, root, publish }) => {
  await publish(); await rm(path.join(dir, 'publication-source-verified.json'));
  const bytes = await readFile(path.join(dir, 'publication-source.tar.gz'));
  const object = JSON.parse(await readFile(path.join(dir, 'publication-source.json')));
  const run = async (file, args, options) => {
    assert.equal(file, 'gcloud'); assert.equal(options.binary, true); assert.equal(options.timeout, 120000);
    assert.deepEqual(args, ['storage', 'cat', `gs://${object.bucket}/${object.name}#${object.generation}`]); return bytes;
  };
  assert.equal((await cloudAction('verify-publication-source', dir, run, root)).status, 'publication-source-verified');
  assert.equal((await prepareRequest('publish', dir, root)).source.storageSource.object, object.name);
  const raw = decompress(bytes); await put(dir, 'publication-source.tar.gz', raw);
  await put(dir, 'publication-source.json', { ...object, sha256: hash(raw) });
  await put(dir, 'publication-source-verified.json', { ...object, sha256: hash(raw) });
  await assert.rejects(prepareRequest('publish', dir, root), 'renamed uncompressed tar must fail even with matching hashes');
}));

import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

test('offline fixture starts empty with separate checkout/source identities and cleans up on success and failure', async () => {
  let owned, stale;
  await fixture(async f => {
    owned = path.dirname(f.dir); stale = f;
    assert.deepEqual(await readdir(f.dir), []);
    assert.equal(await realpath(owned), owned);
    assert.equal((await stat(owned)).mode & 0o777, 0o700);
    assert.equal((await stat(f.dir)).mode & 0o777, 0o700);
    assert.match(f.actualCheckoutSha, /^[a-f0-9]{40}$/);
    assert.notEqual(f.actualCheckoutSha, f.synthetic.commit);
    assert.equal(f.synthetic.executionId, id);
    assert.equal(f.synthetic.mode, 'empty');
    await assert.rejects(prepareRequest('build', f.dir, f.root));
    assert.equal(f.calls.length, 0);
  }, { mode: 'empty' });
  await assert.rejects(stat(owned), { code: 'ENOENT' });
  await assert.rejects(stale.write('late.json', {}));
  await assert.rejects(stale.run('git', ['rev-parse', 'HEAD']));
  assert.throws(() => stale.provider.setGit());
  await assert.rejects(fixture(async f => { owned = path.dirname(f.dir); throw new Error('independent QA failure'); }, { mode: 'empty' }), /independent QA failure/);
  await assert.rejects(stat(owned), { code: 'ENOENT' });
});

test('offline runner rejects unknown commands, altered arguments/options and escaped or linked writes before mutation', async () => fixture(async f => {
  const { run, dir, write, provider, calls, statePath } = f;
  const outside = path.join(path.dirname(dir), 'untouched.json');
  await writeFile(outside, 'original', { mode: 0o600 });
  for (const [file, args, opts] of [
    ['curl', ['https://example.test']], ['docker', ['info']], ['gcloud', ['compute', 'instances', 'delete', 'deskdrop-demo']],
    ['git', ['rev-parse', 'HEAD', '--extra']], ['git', ['rev-parse', 'HEAD'], { timeout: 1 }],
    ['terraform', ['-chdir=infra/terraform', 'plan', '-input=false', `-var-file=${dir}/foundation.tfvars.json`, `-out=${outside}`], { timeout: 600000 }],
    ['terraform', ['-chdir=infra/bootstrap', 'apply', '-input=false', `-state=${outside}`, `${dir}/bootstrap.tfplan`], { timeout: 1800000 }],
    ['gcloud', ['storage', 'cat', `gs://se-demos-project-deskdrop-source/${commit}/../escape#3`], { binary: true, timeout: 120000, maxOutput: 50080796 }],
    ['gcloud', ['artifacts', 'docker', 'images', 'describe', `${registry.replace('docker.pkg', 'dockerXpkg')}/deskdrop@${f.observed.manifest}`, '--project=se-demos-project', '--format=json'], { timeout: 15000, maxOutput: 16384 }],
    ['gcloud', ['compute', 'ssh', 'deskdrop-demo', '--project=other', '--zone=us-central1-a', '--tunnel-through-iap', '--command=anything'], { timeout: 600000 }]
  ]) await assert.rejects(run(file, args, opts));
  assert.ok(calls.every(c => c.outcome === 'rejected'));
  for (const name of ['../untouched.json', outside, 'sub/file', '..']) await assert.rejects(write(name, {}));
  await symlink(outside, path.join(dir, 'linked.json'));
  await assert.rejects(write('linked.json', { changed: true }));
  await link(outside, path.join(dir, 'hardlinked.json'));
  await assert.rejects(write('hardlinked.json', { changed: true }));
  await symlink(outside, path.join(dir, 'foundation.tfplan'));
  await assert.rejects(run('terraform', ['-chdir=infra/terraform', 'plan', '-input=false', `-var-file=${dir}/foundation.tfvars.json`, `-out=${dir}/foundation.tfplan`], { timeout: 600000 }));
  assert.equal(await readFile(outside, 'utf8'), 'original');
  await assert.rejects(readFile(statePath), { code: 'ENOENT' });
  assert.throws(() => provider.failNext('unrestricted'));
  assert.throws(() => provider.putObject(`gs://other/${commit}/source.tar.gz#3`, Buffer.from('x')));
  assert.throws(() => provider.setImage('other:latest', {}));
  provider.failNext('git.head', 'one bounded fault');
  await assert.rejects(run('git', ['rev-parse', 'HEAD', 'extra']));
  await assert.rejects(run('git', ['rev-parse', 'HEAD']), /one bounded fault/);
  assert.equal(await run('git', ['rev-parse', 'HEAD']), commit);
}, { mode: 'empty' }));

test('offline inventory and faults affect actual production readback without inventing publication receipts', async () => fixture(async f => {
  const { dir, root, publish, run, provider, observed, calls } = f;
  await publish();
  provider.failNext('registry.describe', 'synthetic unavailable');
  await assert.rejects(cloudAction('publication-status', dir, run, root), /synthetic unavailable/);
  assert.equal(calls.at(-1).outcome, 'fault');
  assert.equal((await cloudAction('publication-status', dir, run, root)).status, 'confirmed');
  const ref = `${registry}/checker@${observed.manifest}`;
  provider.removeImage(ref);
  await assert.rejects(cloudAction('record-publication', dir, run, root), /Synthetic registry image absent/);
  await assert.rejects(readFile(path.join(dir, 'publication.json')), { code: 'ENOENT' });
  provider.setImage(ref, { digest: `sha256:${'e'.repeat(64)}`, fully_qualified_digest: ref });
  await assert.rejects(cloudAction('record-publication', dir, run, root));
  provider.setImage(ref, { digest: observed.manifest, fully_qualified_digest: ref });
  assert.equal((await cloudAction('record-publication', dir, run, root)).images.checker, ref);
  const a = f.images.app.artifact, key = `gs://${a.bucket}/${a.name}#${a.generation}`;
  provider.putObject(key, Buffer.from('substitution'));
  const before = calls.length;
  assert.equal((await cloudAction('verify', dir, run, root)).phase, 'release');
  assert.equal(calls.length, before, 'filesystem-only verify does not consult changed provider inventory');
  await rm(path.join(dir, 'cloud-build.json'));
  await assert.rejects(cloudAction('record-build', dir, run, root));
  await assert.rejects(readFile(path.join(dir, 'cloud-build.json')), { code: 'ENOENT' });
  provider.removeObject(key);
  await assert.rejects(run('gcloud', ['storage', 'cat', key], { binary: true, timeout: 120000, maxOutput: 2 * 1024 ** 3 }), /Synthetic object absent/);
}));

test('empty offline lifecycle uses production foundation/build/publication/release APIs and never invokes nested default subprocess runner', async t => {
  let defaultCalls = 0;
  const interception = t.mock.method(childProcess, 'spawn', () => { defaultCalls++; throw new Error('Default provider invocation forbidden'); });
  syncBuiltinESMExports();
  try {
    await fixture(async f => {
      const { dir, root, run, provider, calls, write, baselineContext: ctx } = f;
      await write('bootstrap.tfvars.json', { project_id: 'se-demos-project', bucket_name: 'se-demos-project-deskdrop-tfstate', state_operator: 'user:offline@example.invalid' });
      await write('bootstrap-state.json', { statePath: f.statePath });
      for (const which of ['bootstrap', 'foundation']) {
        if (which === 'foundation') await write('foundation.tfvars.json', { project_id: 'se-demos-project', region: 'us-central1', zone: 'us-central1-a', environment: 'demo', phase: 'foundation' });
        const plan = await baseline('plan', [which], run, ctx);
        assert.equal(plan.status, 'planned');
        const before = calls.filter(c => c.kind === 'terraform.apply').length;
        await assert.rejects(baseline('apply', [which], run, ctx));
        assert.equal(calls.filter(c => c.kind === 'terraform.apply').length, before);
        await write(`${which}-approval.json`, { planHash: plan.planHash, permissionsChecked: true, stateCustodyConfirmed: true, costApproved: true, owner: 'offline-fixture-only', teardown: 'discard synthetic fixture' });
        if (which === 'foundation') {
          provider.failNext('terraform.apply');
          await assert.rejects(baseline('apply', [which], run, ctx));
          await assert.rejects(readFile(path.join(dir, 'foundation-applied.json')), { code: 'ENOENT' });
        }
        assert.equal((await baseline('apply', [which], run, ctx)).status, 'applied');
        const receipt = JSON.parse(await readFile(path.join(dir, `${which}-applied.json`)));
        assert.equal(receipt.planHash, hash(await readFile(path.join(dir, `${which}.tfplan`))));
      }
      assert.match(await readFile(f.statePath, 'utf8'), /synthetic state/);
      await assert.rejects(baseline('deploy', [], run, ctx));
      await cloudAction('source-archive', dir, run, root);
      await write('source.json', f.source);
      await cloudAction('verify-source', dir, run, root);
      await assert.rejects(prepareRequest('build', dir, root), 'missing simulated worker capability still blocks');
      await f.seedCapabilities(); await f.stageBuildArtifacts();
      const request = await prepareRequest('build', dir, root);
      await write('build-request.json', request); await write('build-execution.json', execution(request));
      const b = await cloudAction('record-build', dir, run, root);
      await assert.rejects(cloudAction('bundle', dir, run, root), 'publication needs separate synthetic approval');
      const refs = Object.fromEntries(['app', 'checker'].map(n => [n, `${registry}/${n === 'app' ? 'deskdrop' : n}@${f.observed.manifest}`]));
      await write('cloud-publication-approval.json', { phase: 'publication', approved: true, owner: 'offline-fixture-only', buildHash: hash(Buffer.from(JSON.stringify(b))), images: refs, initialRelease: true, noPriorReleaseConfirmed: true });
      const bundle = await cloudAction('bundle', dir, run, root);
      const object = { bucket: 'se-demos-project-deskdrop-artifacts', name: `${commit}/publication/bundle.tar.gz`, generation: '9', sha256: bundle.sha256 };
      await write('publication-source.json', object);
      const uri = `gs://${object.bucket}/${object.name}#${object.generation}`;
      provider.putObject(uri, Buffer.from('corrupt gzip'));
      await assert.rejects(cloudAction('verify-publication-source', dir, run, root));
      provider.putObject(uri, await readFile(path.join(dir, 'publication-source.tar.gz')));
      await cloudAction('verify-publication-source', dir, run, root);
      const publication = await prepareRequest('publish', dir, root);
      await write('publish-request.json', publication); await write('publish-execution.json', execution(publication, 'publish'));
      await cloudAction('record-publication', dir, run, root);
      const release = await cloudAction('release', dir, run, root);
      await write('release.tfvars.json', { project_id: 'se-demos-project', region: 'us-central1', zone: 'us-central1-a', environment: 'demo', phase: 'release', cloud_release: true, image_digest: refs.app });
      const plan = await baseline('plan', ['release'], run, ctx);
      assert.equal(plan.evidenceHash, release.evidenceHash);
      await assert.rejects(baseline('apply', ['release'], run, ctx));
      await write('release-approval.json', { planHash: plan.planHash, permissionsChecked: true, stateCustodyConfirmed: true, costApproved: true, owner: 'offline-fixture-only', teardown: 'discard synthetic fixture' });
      await baseline('apply', ['release'], run, ctx);
      await assert.rejects(baseline('host-install', [], run, ctx));
      await write('deploy-approval.json', { commit, appDigest: release.appDigest, checkerDigest: release.checkerDigest, planHash: plan.planHash, secretProvisioned: true, vmReady: true, iapAuthorized: true, costApproved: true, owner: 'offline-fixture-only' });
      for (const [operation, status] of [['host-install', 'host-installed'], ['deploy', 'deployed']]) {
        await assert.rejects(baseline(operation, [], run, ctx), /Unsupported offline fixture/);
        const pending = calls.at(-1);
        assert.equal(pending.file, 'gcloud');
        assert.deepEqual(pending.args.slice(0, 6), ['compute', 'ssh', 'deskdrop-demo', '--project=se-demos-project', '--zone=us-central1-a', '--tunnel-through-iap']);
        assert.match(pending.args[6], /sha256sum -c -/);
        provider.setRemote(pending.args[6].slice('--command='.length), pending.options.timeout);
        assert.equal((await baseline(operation, [], run, ctx)).status, status);
      }
      assert.equal(JSON.parse(await readFile(path.join(dir, 'deployment.json'))).commit, commit);
      assert.ok(calls.some(c => c.kind === 'terraform.plan') && calls.some(c => c.kind === 'compute.ssh'));
      assert.ok(calls.every(c => ['git', 'terraform', 'gcloud'].includes(c.file)));
      assert.equal(defaultCalls, 0, 'all nested release verification must remain filesystem-only');
      await assert.rejects(baseline('tunnel'), /Default provider invocation forbidden/);
      assert.equal(defaultCalls, 1, 'interception detects an actual default-runner attempt without executing it');
    }, { mode: 'empty' });
  } finally { interception.mock.restore(); syncBuiltinESMExports(); }
});
