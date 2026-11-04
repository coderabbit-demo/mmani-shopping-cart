import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const script = readFileSync(new URL('../deploy/bootstrap.sh', import.meta.url), 'utf8');
const python = script.split("<<'PYCODE'\n")[1]?.split('\nPYCODE\n')[0];
assert.ok(python, 'embedded host authentication source must exist');
function fixture(code) {
  const wrapped = `import tempfile, os, json, base64, contextlib, types\ng={}\nexec(compile(${JSON.stringify(python)}, 'host-auth', 'exec'), g)\n${code}`;
  const result = spawnSync('python3', ['-c', wrapped], { encoding: 'utf8', timeout: 5000, maxBuffer: 32768 });
  assert.equal(result.status, 0, result.stderr);
}

test('fixed metadata identity and secret API fetch succeed and reject mismatched targets', () => {
  fixture(`
class Response:
 def __init__(self, body, meta=True): self.data=body; self.headers={'Metadata-Flavor':'Google'} if meta else {}; self.status=200
 def __enter__(self): return self
 def __exit__(self,*a): pass
 def read(self,n): return self.data
class Opener:
 def __init__(self, wrong=False): self.calls=[]; self.wrong=wrong
 def open(self,req,timeout):
  assert timeout == 5
  url=req.full_url; self.calls.append(url)
  values={'project/project-id':'wrong' if self.wrong else 'se-demos-project','instance/name':'deskdrop-demo','instance/zone':'projects/123/zones/us-central1-a','instance/service-accounts/default/email':'deskdrop-demo-runtime@se-demos-project.iam.gserviceaccount.com','instance/service-accounts/default/token':json.dumps({'access_token':'synthetic-token'})}
  if url.startswith(g['META']): return Response(values[url[len(g['META']):]].encode())
  assert url == g['SECRET'] and req.get_header('Authorization') == 'Bearer synthetic-token'
  return Response(json.dumps({'payload':{'data':base64.b64encode(b'A'*32).decode()}}).encode())
a=Opener(); token, secret=g['acquire'](a)
assert token=='synthetic-token' and secret==b'A'*32 and len(a.calls)==6
b=Opener(True)
try: g['acquire'](b); raise AssertionError('wrong target accepted')
except ValueError: assert len(b.calls)==1
`);
});

test('auth rejects redirects, oversized responses and malformed secret data', () => {
  fixture(`
try: g['NoRedirect']().redirect_request(None,None,302,'',{},'https://evil.test'); raise AssertionError()
except ValueError: pass
class R:
 status=200; headers={'Metadata-Flavor':'Google'}
 def __enter__(self): return self
 def __exit__(self,*a): pass
 def read(self,n): return b'x'*(g['LIMIT']+1)
class O:
 def open(self,*a,**k): return R()
try: g['fetch'](O(),g['META']+'project/project-id',{}); raise AssertionError()
except ValueError: pass
`);
});

test('restricted secret file checks permissions and avoids symlink targets', () => {
  fixture(`
with tempfile.TemporaryDirectory() as d:
 os.chmod(d,0o700); p=d+'/intake'
 g['save_secret'](p,b'A'*32,os.getuid())
 assert open(p,'rb').read()==b'A'*32 and (os.stat(p).st_mode & 0o777)==0o600
 os.unlink(p); os.symlink(d+'/other',p)
 try: g['save_secret'](p,b'A'*32,os.getuid()); raise AssertionError()
 except (OSError, ValueError): pass
 os.unlink(p); os.chmod(d,0o755)
 try: g['save_secret'](p,b'A'*32,os.getuid()); raise AssertionError()
 except ValueError: pass
`);
});

test('registry credentials travel on stdin only and bad images never invoke docker', () => {
  fixture(`
app='us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:'+'a'*64
checker='us-central1-docker.pkg.dev/se-demos-project/deskdrop/checker@sha256:'+'b'*64
calls=[]
with tempfile.TemporaryDirectory() as d:
 original=g['tempfile'].TemporaryDirectory
 g['tempfile'].TemporaryDirectory=lambda **kw: contextlib.nullcontext(d)
 def runner(args,**kw):
  calls.append((args,kw))
  if args[1:3] == ['image','inspect']: kw['stdout'].write(('amd64|'+'a'*40+'\\n').encode())
 g['pull_images']('synthetic-token',[app,checker],'a'*40,runner)
 assert len(calls)==5 and calls[0][1]['input']==b'synthetic-token'
 for args, kw in calls:
  assert 'synthetic-token' not in str(args) and 'synthetic-token' not in str(kw['env'])
  assert kw['stderr']==g['subprocess'].DEVNULL and kw['timeout'] in (15,120)
 try: g['pull_images']('synthetic-token',[app,'evil:latest'],'a'*40,runner); raise AssertionError()
 except ValueError: assert len(calls)==5
 g['tempfile'].TemporaryDirectory=original
`);
});

import { action, command } from '../scripts/demo/baseline.mjs';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const commit = 'a'.repeat(40);
const sha = data => `sha256:${createHash('sha256').update(data).digest('hex')}`;
function oci(name) {
  const config = Buffer.from(JSON.stringify({ architecture: 'amd64', os: 'linux', config: { Labels: { 'org.opencontainers.image.revision': commit }, name } }));
  const manifest = Buffer.from(JSON.stringify({ config: { digest: sha(config) }, layers: [] }));
  return { config, manifest, digest: sha(manifest) };
}
const appOci = oci('app'), checkerOci = oci('checker'), appDigest = appOci.digest, checkerDigest = checkerOci.digest;
async function withArtifacts(fn) {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'deskdrop-fixture-')));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const put = (dir, name, obj) => writeFile(path.join(dir, name), JSON.stringify(obj));
const release = { commit, appDigest, checkerDigest, imageIds: { app: appDigest, checker: checkerDigest } };
const planHash = 'd'.repeat(64);
async function allowPublish(dir) {
  await put(dir, 'terraform-applied.json', { commit, planHash });
  await put(dir, 'publication-approval.json', { commit, appDigest, checkerDigest, approved: true, owner: 'operator' });
}
async function allowDeploy(dir) {
  await put(dir, 'terraform-applied.json', { commit, planHash });
  await put(dir, 'deploy-approval.json', { commit, appDigest, checkerDigest, planHash, owner: 'operator', secretProvisioned: true, vmReady: true, iapAuthorized: true, costApproved: true });
}

function fakeRun(calls) {
  return async (file, args, options) => {
    calls.push({ file, args, options });
    if (file === 'git') return args[0] === 'rev-parse' ? commit : args[0] === 'archive' ? Buffer.from('synthetic archive') : '';
    if (file === 'tar') {
      const image = args[1].endsWith('app.oci.tar') ? appOci : checkerOci;
      if (args[2] === 'index.json') return JSON.stringify({ manifests: [{ digest: image.digest }] });
      if (args[2].endsWith(image.digest.slice(7))) return image.manifest;
      if (args[2].endsWith(sha(image.config).slice(7))) return image.config;
      throw new Error('unexpected OCI path');
    }
    if (file === 'docker' && args[0] === 'image') return args.at(-1).includes('-app:') ? appDigest : checkerDigest;
    if (file === 'docker' && args[0] === 'push') return `digest: ${args[1].includes('/deskdrop:') ? appDigest : checkerDigest} size: 1`;
    if (file === 'terraform' && args.includes('plan')) await writeFile(args.find(a => a.startsWith('-out=')).slice(5), 'synthetic-plan');
    return '';
  };
}

test('help and invalid actions invoke no subprocesses', async () => {
  const calls = [], run = fakeRun(calls);
  assert.ok((await action('help', [], run)).commands.includes('apply'));
  await assert.rejects(action('deploy;echo', [], run));
  await assert.rejects(action('build', ['extra'], run));
  assert.equal(calls.length, 0);
});

test('build records amd64 source and image IDs; publish binds pushed digests to them', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls), ctx = { artifacts: dir };
  const built = await action('build', [], run, ctx);
  assert.equal(built.commit, commit);
  assert.equal(calls.filter(x => x.file === 'docker' && x.args[0] === 'buildx').length, 2);
  assert.ok(calls.filter(x => x.args[0] === 'buildx').every(x => x.args.includes('--platform=linux/amd64') && x.args.includes(`SOURCE_COMMIT=${commit}`) && x.args.includes('--load') && x.args.at(-1) === '-' && Buffer.isBuffer(x.options.input)));
  await allowPublish(dir);
  const published = await action('publish', [], run, ctx);
  assert.equal(published.appDigest, appDigest); assert.equal(published.checkerDigest, checkerDigest);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'release.json'))).imageIds, { app: appDigest, checker: checkerDigest });
}));

test('dirty tree and substituted image fail before build or publication', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls);
  await assert.rejects(action('build', [], async (f, a, o) => a[0] === 'status' ? ' M app/page.tsx' : run(f, a, o), { artifacts: dir }));
  assert.equal(calls.filter(x => x.file === 'docker').length, 0);
  await put(dir, 'build.json', { commit, ids: { app: checkerDigest, checker: checkerDigest }, manifests: { app: appDigest, checker: checkerDigest } });
  await allowPublish(dir);
  await assert.rejects(action('publish', [], run, { artifacts: dir }));
  assert.equal(calls.filter(x => x.args[0] === 'push').length, 0);
}));

test('bootstrap plan uses external state and apply rejects unapproved or changed plans', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls), ctx = { artifacts: dir };
  const statePath = path.join(dir, 'bootstrap.tfstate');
  await put(dir, 'bootstrap-state.json', { statePath });
  await put(dir, 'bootstrap.tfvars.json', { project_id: 'se-demos-project', bucket_name: 'se-demos-project-deskdrop-tfstate', state_operator: 'user:operator@example.test' });
  const plan = await action('plan', ['bootstrap'], run, ctx);
  assert.ok(calls.find(x => x.args.includes('plan')).args.includes(`-state=${statePath}`));
  await put(dir, 'bootstrap-approval.json', { planHash: plan.planHash, permissionsChecked: true, stateCustodyConfirmed: true, costApproved: false, owner: 'operator', teardown: 'agreed' });
  await assert.rejects(action('apply', ['bootstrap'], run, ctx));
  assert.equal(calls.filter(x => x.args.includes('apply')).length, 0);
  await put(dir, 'bootstrap-approval.json', { planHash: plan.planHash, permissionsChecked: true, stateCustodyConfirmed: true, costApproved: true, owner: 'operator', teardown: 'agreed' });
  await writeFile(path.join(dir, 'bootstrap.tfplan'), 'changed');
  await assert.rejects(action('apply', ['bootstrap'], run, ctx));
  assert.equal(calls.filter(x => x.args.includes('apply')).length, 0);
  await writeFile(path.join(dir, 'bootstrap.tfplan'), 'synthetic-plan');
  assert.equal((await action('apply', ['bootstrap'], run, ctx)).status, 'applied');
  assert.ok(calls.find(x => x.args.includes('apply')).args.includes(`-state=${statePath}`));
}));

test('demo plan refuses wrong project or mismatched image before Terraform is called', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls), ctx = { artifacts: dir };
  await put(dir, 'release.json', release);
  await put(dir, 'build.json', { commit, ids: release.imageIds, manifests: { app: appDigest, checker: checkerDigest } });
  await put(dir, 'bootstrap-applied.json', { commit, planHash });
  await put(dir, 'terraform.tfvars.json', { project_id: 'wrong', region: 'us-central1', zone: 'us-central1-a', environment: 'demo', image_digest: 'latest' });
  await assert.rejects(action('plan', ['terraform'], run, ctx));
  assert.equal(calls.filter(x => x.file === 'terraform').length, 0);
}));

test('remote operations use fixed IAP target and validated digest; checker result must match', async () => withArtifacts(async dir => {
  const calls = [], base = fakeRun(calls), ctx = { artifacts: dir };
  await put(dir, 'release.json', release);
  await allowDeploy(dir);
  await action('host-install', [], base, ctx);
  await action('deploy', [], base, ctx);
  const remoteCalls = calls.filter(x => x.file === 'gcloud');
  assert.equal(remoteCalls.length, 3);
  assert.ok(remoteCalls.every(x => x.args.includes('--project=se-demos-project') && x.args.includes('--zone=us-central1-a') && x.args.includes('--tunnel-through-iap')));
  assert.ok(remoteCalls[2].args.some(x => x.includes(`deskdrop@${appDigest}`)));
  const result = { status: 'pass', source: commit, image: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@${appDigest}`, journey: 'cart-receipt-history' };
  const smokeRun = async (f, a, o) => f === 'gcloud' ? JSON.stringify(result) : base(f, a, o);
  assert.deepEqual(await action('smoke', [], smokeRun, ctx), result);
  await assert.rejects(action('smoke', [], async (f, a, o) => f === 'gcloud' ? JSON.stringify({ ...result, image: 'wrong' }) : base(f, a, o), ctx));
  await put(dir, 'release.json', { ...release, appDigest: `sha256:${'b'.repeat(63)};` });
  await assert.rejects(action('deploy', [], base, ctx));
}));

test('tunnel is foreground, fixed and bounded; subprocess errors are sanitized', async () => {
  const calls = [], run = fakeRun(calls);
  await action('tunnel', [], run);
  assert.equal(calls[0].options.timeout, 600000);
  assert.ok(calls[0].args.includes('127.0.0.1:3100:127.0.0.1:3000'));
  await assert.rejects(command('sh', ['-c', 'echo synthetic-secret']), /Operation failed/);
  await assert.rejects(command('git', ['not-a-command', 'synthetic-secret']), e => !String(e).includes('synthetic-secret'));
});

test('firewall installs IPv4 and IPv6 bridge isolation and fails closed on rule failure', () => {
  const start = script.indexOf('firewall() {'), end = script.indexOf('\ninstall_packages() {', start);
  const body = script.slice(start, end);
  assert.ok(start >= 0 && end > start);
  const harness = `set -e\nlog=()\nchecks=0\niptables() {\n case "$1" in -nL) return 1;; -C) checks=$((checks+1)); [ "$checks" -gt 3 ];; -I|-N) log+=("iptables $*");; esac\n}\nip6tables() {\n case "$1" in -C) checks=$((checks+1)); [ "$checks" -gt 3 ];; -I) log+=("ip6tables $*");; esac\n}\n${body}\nfirewall\nprintf '%s\\n' "\${log[@]}"`;
  const ok = spawnSync('bash', ['-c', harness], { encoding: 'utf8', timeout: 5000 });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /DOCKER-USER.*br-deskdrop.*172\.30\.243\.0\/24.*DROP/);
  assert.match(ok.stdout, /INPUT.*br-deskdrop.*DROP/);
  const broken = spawnSync('bash', ['-c', harness.replace('-I|-N) log+=("iptables $*");;', '-I) return 1;; -N) log+=("iptables $*");;')], { encoding: 'utf8', timeout: 5000 });
  assert.notEqual(broken.status, 0);
});

test('demo state backend must match the approved bucket and contain no credentials', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls), backend = path.join(dir, 'backend.json'), ctx = { artifacts: dir, backendFile: backend };
  await put(dir, 'release.json', release);
  await put(dir, 'build.json', { commit, ids: release.imageIds, manifests: { app: appDigest, checker: checkerDigest } });
  await put(dir, 'bootstrap-applied.json', { commit, planHash });
  await put(dir, 'terraform.tfvars.json', { project_id: 'se-demos-project', region: 'us-central1', zone: 'us-central1-a', environment: 'demo', image_digest: `us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@${appDigest}` });
  await put(dir, 'backend.json', { backend: { type: 'gcs', config: { bucket: 'wrong', prefix: 'deskdrop/demo' } } });
  await assert.rejects(action('plan', ['terraform'], run, ctx));
  await put(dir, 'backend.json', { backend: { type: 'gcs', config: { bucket: 'se-demos-project-deskdrop-tfstate', prefix: 'deskdrop/demo', credentials: 'synthetic-secret' } } });
  await assert.rejects(action('plan', ['terraform'], run, ctx));
  assert.equal(calls.filter(x => x.file === 'terraform').length, 0);
  await put(dir, 'backend.json', { backend: { type: 'gcs', config: { bucket: 'se-demos-project-deskdrop-tfstate', prefix: 'deskdrop/demo', credentials: null } } });
  assert.equal((await action('plan', ['terraform'], run, ctx)).status, 'planned');
}));

test('publish rejects a registry digest that differs from the reviewed OCI build', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls), ctx = { artifacts: dir };
  await action('build', [], run, ctx);
  await allowPublish(dir);
  await assert.rejects(action('publish', [], async (file, args, options) => {
    if (file === 'docker' && args[0] === 'push') return `digest: sha256:${'f'.repeat(64)} size: 1`;
    return run(file, args, options);
  }, ctx));
  await assert.rejects(readFile(path.join(dir, 'release.json')));
}));

test('command timeout kills a hanging process and does not expose its arguments', async () => {
  await assert.rejects(command('git', ['-c', 'alias.wait=!sleep 5', 'wait'], { timeout: 50 }), e => !String(e).includes('sleep'));
});

test('malformed secret response and metadata timeout fail without producing a secret', () => {
  fixture(`
class Response:
 status=200; headers={'Metadata-Flavor':'Google'}
 def __init__(self,data): self.data=data
 def __enter__(self): return self
 def __exit__(self,*a): pass
 def read(self,n): return self.data
class Opener:
 def __init__(self,fail=False): self.fail=fail
 def open(self,request,timeout):
  if self.fail: raise TimeoutError('synthetic-secret')
  url=request.full_url
  values={'project/project-id':'se-demos-project','instance/name':'deskdrop-demo','instance/zone':'projects/123/zones/us-central1-a','instance/service-accounts/default/email':'deskdrop-demo-runtime@se-demos-project.iam.gserviceaccount.com','instance/service-accounts/default/token':json.dumps({'access_token':'synthetic-token'})}
  if url.startswith(g['META']): return Response(values[url[len(g['META']):]].encode())
  return Response(b'{"payload":{"data":"not-base64!"}}')
for opener in [Opener(True),Opener()]:
 try: g['acquire'](opener); raise AssertionError('bad response accepted')
 except (TimeoutError,ValueError): pass
`);
});

test('publication and deployment require explicit matching approvals before commands', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls), ctx = { artifacts: dir };
  await put(dir, 'build.json', { commit, ids: release.imageIds, manifests: { app: appDigest, checker: checkerDigest } });
  await assert.rejects(action('publish', [], run, ctx));
  assert.equal(calls.filter(x => x.file === 'docker').length, 0);
  await put(dir, 'release.json', release);
  await put(dir, 'terraform-applied.json', { commit, planHash });
  await put(dir, 'deploy-approval.json', { commit, appDigest, checkerDigest, planHash, owner: 'operator', secretProvisioned: false, vmReady: true, iapAuthorized: true, costApproved: true });
  await assert.rejects(action('host-install', [], run, ctx));
  await assert.rejects(action('deploy', [], run, ctx));
  assert.equal(calls.filter(x => x.file === 'gcloud').length, 0);
}));
