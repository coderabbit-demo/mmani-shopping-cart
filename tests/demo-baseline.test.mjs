import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { Parser } from 'commonmark';

const script = readFileSync(new URL('../deploy/bootstrap.sh', import.meta.url), 'utf8');
const python = script.split("<<'PYCODE'\n")[1]?.split('\nPYCODE\n')[0];
assert.ok(python, 'embedded host authentication source must exist');

test('infrastructure checkout does not persist credentials', () => {
  const workflow = readFileSync(new URL('../.github/workflows/infra.yml', import.meta.url), 'utf8');
  const steps = workflow.match(/^jobs:\r?\n  terraform:\r?\n    runs-on: [^\r\n]+\r?\n    timeout-minutes: \d+\r?\n    steps:\r?\n((?:(?: {6,}[^\r\n]*|\s*)\r?\n)*)/m)?.[1];
  assert.ok(steps, 'terraform job steps must have the expected structure');
  const firstStep = steps.split(/^      - /m)[1];
  assert.match(firstStep ?? '', /^uses: actions\/checkout@11d5960a326750d5838078e36cf38b85af677262\r?\n        with:\r?\n          persist-credentials: false\s*$/,
    'the checkout step itself must disable persisted credentials');
});

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

async function until(check, message) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(message);
}
for (const signal of ['SIGINT', 'SIGTERM']) test(`CLI forwards ${signal} to its own child group and reaps descendants`, async () => withArtifacts(async dir => {
  const cli = new URL('../scripts/demo/baseline.mjs', import.meta.url);
  const pidFile = path.join(dir, 'pids'), signals = path.join(dir, 'signals');
  await writeFile(path.join(dir, 'gcloud'), `#!${process.execPath}
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const descendant = spawn(process.execPath, ['-e', "process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {stdio:'ignore'});
fs.writeFileSync(process.env.FIXTURE_PIDS, process.pid+' '+descendant.pid);
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{fs.writeFileSync(process.env.FIXTURE_SIGNALS, signal);process.exit(0)});
setInterval(()=>{},1000);
`, { mode: 0o700 });
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const parent = spawn(process.execPath, [cli.pathname, 'tunnel'], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FIXTURE_PIDS: pidFile, FIXTURE_SIGNALS: signals }, stdio: 'pipe' });
  let pids = [], diagnostics = '';
  parent.stderr.on('data', data => { diagnostics += data; });
  const closed = once(parent, 'close');
  try {
    await until(async () => { try { pids = (await readFile(pidFile, 'utf8')).split(' ').map(Number); return pids.length === 2; } catch { return false; } }, 'fake gcloud never started');
    await new Promise(resolve => setTimeout(resolve, 100));
    parent.kill(signal);
    const [code, terminated] = await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('CLI failed to settle interruption')), 4000).unref())]);
    assert.equal(code, signal === 'SIGINT' ? 130 : 143, 'CLI preserves the termination exit status');
    assert.equal(terminated, null);
    assert.equal(await readFile(signals, 'utf8').catch(() => ''), signal, 'signal must reach fake gcloud');
    await until(async () => {
      for (const pid of pids) {
        try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') continue; throw error; }
        // A killed orphan may await its sandbox init reaper; it cannot execute.
        try { if ((await readFile(`/proc/${pid}/stat`, 'utf8')).split(' ')[2] === 'Z') continue; } catch {}
        return false;
      }
      return true;
    }, 'detached command or descendant survived interruption');
    assert.ok(!diagnostics.includes(pidFile));
    assert.equal(process.kill(unrelated.pid, 0), true, 'unrelated process must survive');
  } finally {
    for (const pid of pids) { try { process.kill(-pid, 'SIGKILL'); } catch {} try { process.kill(pid, 'SIGKILL'); } catch {} }
    parent.kill('SIGKILL');
    unrelated.kill('SIGKILL');
  }
}));

test('command removes signal listeners after success, exit failure, spawn failure and timeout', async () => {
  const counts = () => ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  const before = counts();
  assert.equal(await realpath((await command('git', ['rev-parse', '--show-toplevel'])).trim()), await realpath(new URL('..', import.meta.url)));
  assert.deepEqual(counts(), before);
  await assert.rejects(command('git', ['not-a-command']));
  assert.deepEqual(counts(), before);
  const original = process.env.PATH;
  try { process.env.PATH = '/nonexistent-fixture-bin'; await assert.rejects(command('gcloud', [])); }
  finally { process.env.PATH = original; }
  assert.deepEqual(counts(), before);
  await assert.rejects(command('git', ['-c', 'alias.wait=!sleep 5', 'wait'], { timeout: 30 }));
  assert.deepEqual(counts(), before);
});

test('cost worksheet renders as one uninterrupted table block', async () => {
  const markdown = await readFile(new URL('../docs/demo/gcp-costs.md', import.meta.url), 'utf8');
  const walker = new Parser().parse(markdown).walker();
  const paragraphs = []; let event;
  while ((event = walker.next())) if (event.entering && event.node.type === 'paragraph') {
    const [start, end] = event.node.sourcepos;
    paragraphs.push(markdown.split('\n').slice(start[0] - 1, end[0]).join('\n'));
  }
  const table = paragraphs.find(text => text.startsWith('| Item |'));
  assert.ok(table?.includes('| Compute Engine') && table.includes('| Datadog US3'), 'header and every data row must occupy the same rendered block');
  const rows = table.split('\n');
  assert.match(rows[1], /^\| --- \| --- \| --- \|$/);
  for (const row of rows) assert.equal(row.split('|').length, 5, 'each rendered row has three cells');
});

const imageFixture = `us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:${'a'.repeat(64)}`;
function composeConfig() {
  const result = spawnSync('docker', ['compose', '-f', 'deploy/compose.yaml', '--profile', 'check', 'config', '--format', 'json'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, APP_IMAGE: imageFixture, CHECKER_IMAGE: imageFixture.replace('/deskdrop@', '/checker@'), SOURCE_COMMIT: commit } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('checker namespace policy retains default-deny and Docker capability restrictions', () => {
  const config = composeConfig();
  assert.ok(config.services.checker.security_opt.some(option => option.startsWith('seccomp=')), 'checker requires its reviewed namespace policy');
  assert.ok(config.services.checker.shm_size >= 268435456, 'private shared memory must fit Chromium');
  assert.deepEqual(config.services.checker.cap_drop, ['ALL']);
  assert.ok(config.services.checker.security_opt.includes('no-new-privileges:true'));
  const result = spawnSync('bash', ['deploy/bootstrap.sh', 'seccomp-profile'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  const profile = JSON.parse(result.stdout);
  const upstream = script.split("profile = json.loads(r'''")[1].split("''')")[0];
  assert.equal(createHash('sha256').update(upstream).digest('hex'), '6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6', 'embedded Docker baseline bytes must match the pinned official source');
  const baseline = JSON.parse(upstream);
  assert.deepEqual(profile.syscalls.slice(1), baseline.syscalls, 'all existing Docker rules must survive unchanged');
  assert.deepEqual({ ...profile, syscalls: [] }, { ...baseline, syscalls: [] });
  assert.deepEqual(profile.syscalls[0].names, ['clone', 'setns', 'unshare', 'chroot']);
  assert.equal(createHash('sha256').update(result.stdout).digest('hex'), script.match(/profile_sha=([a-f0-9]{64})/)[1], 'installed policy must be hash-bound to emitted bytes');
  assert.equal(profile.defaultAction, 'SCMP_ACT_ERRNO');
  const effective = name => profile.syscalls.filter(rule => rule.names.includes(name) && !rule.includes?.caps?.length && !rule.includes?.arches?.length && !rule.args?.length);
  for (const name of ['clone', 'setns', 'unshare', 'chroot']) assert.ok(effective(name).some(rule => rule.action === 'SCMP_ACT_ALLOW'));
  for (const name of ['mount', 'bpf', 'kexec_load', 'perf_event_open']) assert.ok(!effective(name).some(rule => rule.action === 'SCMP_ACT_ALLOW'), `${name} must remain restricted`);
  assert.ok(effective('clone3').some(rule => rule.action === 'SCMP_ACT_ERRNO' && rule.errnoRet === 38));
});

test('only the fixed forwarder publishes loopback; app/checker retain the internal network', () => {
  const config = composeConfig(), { app, checker, forwarder } = config.services;
  assert.ok(forwarder, 'internal-only app requires a separate publishing endpoint');
  assert.ok(!app.ports && !checker.ports);
  assert.deepEqual(Object.keys(app.networks), ['isolated']);
  assert.deepEqual(Object.keys(checker.networks), ['isolated']);
  assert.equal(config.networks.isolated.internal, true);
  assert.deepEqual(Object.keys(forwarder.networks).sort(), ['edge', 'isolated']);
  assert.equal(forwarder.ports[0].host_ip, '127.0.0.1');
  assert.equal(forwarder.ports[0].published, '3000');
  assert.equal(forwarder.image, imageFixture);
  assert.equal(forwarder.user, '1000:1000');
  assert.equal(forwarder.read_only, true);
  assert.deepEqual(forwarder.cap_drop, ['ALL']);
  assert.ok(forwarder.security_opt.includes('no-new-privileges:true'));
  assert.ok(!forwarder.volumes && !checker.volumes && !app.volumes);
});

function shellFunctions(source = script) {
  return source.slice(source.indexOf('firewall() {'), source.indexOf('\ninstall_packages() {'));
}
function shellFixture(body, source = script) {
  return spawnSync('bash', ['-c', `set -euo pipefail\n${shellFunctions(source)}\n${body}`], { encoding: 'utf8', timeout: 5000 });
}

test('bridge firewall permits only established host/forward replies before denying new off-subnet attempts', () => {
  // Execute the real rule installer against a stateful iptables adapter, then route packets through its rules.
  const adapter = `
declare -a rules=()
iptables() {
 local operation=$1 chain=$2; shift 2
 if [ "$operation" = -nL ]; then return 0; fi
 if [ "$operation" = -I ]; then shift; rules=("$chain $*" \${rules[@]+"\${rules[@]}"}); return; fi
 if [ "$operation" = -C ]; then
  local candidate
  for candidate in \${rules[@]+"\${rules[@]}"}; do [ "$candidate" != "$chain $*" ] || return 0; done
  return 1
 fi
 return 1
}
ip6tables() { return 0; }
firewall
before=\${#rules[@]}
firewall
[ "\${#rules[@]}" = "$before" ]
printf '%s\\n' "\${rules[@]}"
`;
  const result = shellFixture(adapter);
  assert.equal(result.status, 0, result.stderr);
  const rules = result.stdout.trim().split('\n').map(line => line.split(' '));
  function route(chain, bridge, destination, state) {
    for (const rule of rules) {
      if (rule[0] !== chain || rule[rule.indexOf('-i') + 1] !== bridge) continue;
      if (rule.includes('--ctstate') && state !== rule[rule.indexOf('--ctstate') + 1]) continue;
      if (rule.includes('-d')) {
        const subnet = rule[rule.indexOf('-d') + 1].replace('.0/24', '.');
        if (destination.startsWith(subnet)) continue;
      }
      return rule.at(-1);
    }
    return 'CONTINUE';
  }
  for (const bridge of ['br-deskdrop', 'br-deskdrop-in']) {
    assert.equal(route('INPUT', bridge, '127.0.0.1', 'ESTABLISHED'), 'ACCEPT', 'legitimate host replies must survive');
    assert.equal(route('DOCKER-USER', bridge, '10.90.0.2', 'ESTABLISHED'), 'RETURN');
    for (const destination of ['169.254.169.254', '10.90.0.1', '1.1.1.1']) {
      assert.equal(route('INPUT', bridge, destination, 'NEW'), 'DROP');
      assert.equal(route('DOCKER-USER', bridge, destination, 'NEW'), 'DROP');
    }
  }
  assert.equal(route('DOCKER-USER', 'br-deskdrop', '172.30.243.12', 'NEW'), 'CONTINUE', 'private checker can reach app');
});

test('boot firewall failure blocks Docker but transient telemetry failure is not a firewall dependency', async () => withArtifacts(async dir => {
  // Run the existing dispatcher with only command/filesystem boundaries replaced; never run host operations.
  const dispatcher = script.slice(script.indexOf('case "$mode" in'), script.indexOf("exec python3 -"));
  const release = path.join(dir, 'release');
  await writeFile(release, 'synthetic release');
  const fixturePath = path.join(dir, 'bootstrap.sh');
  await writeFile(fixturePath, `#!/usr/bin/env bash
set -euo pipefail
mode=$1
if [ "$mode" = secret-refresh ]; then printf 'secret-unavailable\\n'; exit 23; fi
firewall() { printf 'firewall\\n'; [ "\${FIXTURE_FIREWALL_FAIL:-0}" = 0 ]; }
runtime_command() { printf '%s\\n' "$1"; [ "$1" != secret-refresh ]; }
${dispatcher.replaceAll('/etc/deskdrop/release', release)}
`, { mode: 0o700 });
  const boot = spawnSync('bash', [fixturePath, 'firewall'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(boot.status, 0, 'an unavailable telemetry secret must not stop docker.service');
  assert.ok(!boot.stdout.includes('secret-unavailable'), 'firewall cannot fetch telemetry credentials');
  const failure = spawnSync('bash', [fixturePath, 'firewall'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, FIXTURE_FIREWALL_FAIL: '1' } });
  assert.notEqual(failure.status, 0, 'isolation failure must block docker.service');
}));

test('boot resumes only verified cached images, reports degraded telemetry, then recovers Agent', () => {
  for (const secretStatus of [1, 0]) {
    const result = shellFixture(`
app_image=app checker_image=checker source_commit=source
runtime_command() { printf 'runtime %s\\n' "$*"; if [ "$1" = secret-refresh ]; then return ${secretStatus}; fi; }
compose() { printf 'compose %s\\n' "$*"; }
resume_services
`);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /verify-images app checker source/);
    assert.match(result.stdout, /up -d --pull never --wait --wait-timeout 60 app forwarder/);
    if (secretStatus) {
      assert.match(result.stdout, /compose stop agent/);
      assert.ok(!result.stdout.includes('--force-recreate agent'));
      assert.match(result.stderr, /Telemetry degraded/);
    } else {
      assert.match(result.stdout, /--force-recreate agent/);
      assert.ok(!result.stdout.includes('stop agent'));
      assert.equal(result.stderr, '');
    }
  }
  const failedIdentity = shellFixture(`app_image=app checker_image=checker source_commit=source
runtime_command() { return 1; }
compose() { printf 'unsafe-start'; }
resume_services`);
  assert.notEqual(failedIdentity.status, 0);
  assert.equal(failedIdentity.stdout, '', 'bad cached image identity must never start app');
});

test('Agent directory bind survives an empty /run reboot and secret recovery without creating a directory at the key path', () => {
  const config = composeConfig();
  const mount = config.services.agent.volumes.find(mount => mount.target.startsWith('/run/deskdrop'));
  assert.ok(mount, 'runtime secret mount must be explicit');
  const mountedName = mount.source.split('/').at(-1);
  fixture(`
with tempfile.TemporaryDirectory() as d:
 os.chmod(d,0o700)
 runtime=d+'/runtime'; os.mkdir(runtime,0o700)
 # Reproduce Docker's directory handling for the actual configured bind source.
 os.mkdir(runtime+${JSON.stringify('/' + mountedName)},0o700)
 isolated={}
 exec(compile(${JSON.stringify(python)}.replace('/run/deskdrop',runtime).replace('owner=0', 'owner=os.getuid()'), 'isolated-auth', 'exec'), isolated)
 isolated['acquire']=lambda opener: ('synthetic-token',b'A'*32)
 isolated['sys'].argv=['auth','secret-refresh']
 outcome=None
 try: isolated['main']()
 except Exception as error: outcome=type(error).__name__
 assert outcome is None, 'refresh after boot must succeed, not fail on a directory created at the key path: '+str(outcome)
 assert os.path.isfile(runtime+'/secrets/intake')
 assert open(runtime+'/secrets/intake','rb').read()==b'A'*32
 isolated['acquire']=lambda opener: (_ for _ in ()).throw(TimeoutError('synthetic-secret'))
 try: isolated['main'](); raise AssertionError('outage accepted')
 except TimeoutError: pass
 assert open(runtime+'/secrets/intake','rb').read()==b'A'*32, 'failed refresh must preserve last restricted file'
 isolated['acquire']=lambda opener: ('synthetic-token',b'B'*32)
 isolated['main']()
 assert open(runtime+'/secrets/intake','rb').read()==b'B'*32
 assert os.stat(runtime+'/secrets/intake').st_mode & 0o777 == 0o600
 assert os.listdir(runtime+'/secrets') == ['intake']
`);
  assert.equal(mount.bind.create_host_path, false, 'Docker must not create missing bind paths');
  assert.equal(mount.read_only, true);
});

test('runtime directories reject symlinks, loose permissions and directories at the secret file path', () => {
  fixture(`
with tempfile.TemporaryDirectory() as d:
 runtime=d+'/runtime'
 g['prepare_runtime'](runtime,os.getuid())
 assert os.stat(runtime+'/secrets').st_mode & 0o777 == 0o700
 os.mkdir(runtime+'/secrets/intake',0o700)
 try: g['save_secret'](runtime+'/secrets/intake',b'A'*32,os.getuid()); raise AssertionError('directory accepted as key')
 except ValueError: pass
 os.rmdir(runtime+'/secrets/intake'); os.rmdir(runtime+'/secrets'); os.symlink(d,runtime+'/secrets')
 try: g['prepare_runtime'](runtime,os.getuid()); raise AssertionError('symlink accepted')
 except ValueError: pass
 os.unlink(runtime+'/secrets'); os.chmod(runtime,0o755)
 try: g['prepare_runtime'](runtime,os.getuid()); raise AssertionError('permissions accepted')
 except ValueError: pass
`);
});

import net from 'node:net';
import http from 'node:http';
import vm from 'node:vm';
test('fixed forwarder serves real loopback HTTP and closes failed backend connections', async () => {
  const config = composeConfig();
  const code = config.services.forwarder.command.at(-1);
  const large = 'x'.repeat(2 * 1024 * 1024);
  const backend = http.createServer((request, response) => { response.setHeader('Connection', 'close'); response.end(request.url === '/large' ? large : 'private app fixture'); });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  let proxy, upstreamPort = backend.address().port;
  const adapter = {
    createConnection(target) { assert.deepEqual(JSON.parse(JSON.stringify(target)), { host: 'app', port: 3000 }); return net.createConnection({ host: '127.0.0.1', port: upstreamPort }); },
    createServer(handler) {
      proxy = net.createServer(handler);
      const listen = proxy.listen.bind(proxy);
      proxy.listen = (port, host) => { assert.equal(port, 3000); assert.equal(host, '0.0.0.0'); return listen(0, '127.0.0.1'); };
      return proxy;
    },
  };
  try {
    vm.runInNewContext(code, { require(name) { assert.equal(name, 'node:net'); return adapter; } });
    await once(proxy, 'listening');
    assert.equal(proxy.maxConnections, 128);
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}`, { signal: AbortSignal.timeout(2000) });
    assert.equal(await response.text(), 'private app fixture');
    const bulk = await fetch(`http://127.0.0.1:${proxy.address().port}/large`, { signal: AbortSignal.timeout(2000) });
    assert.equal(await bulk.text(), large, 'backend close must not truncate buffered HTTP output');
    await new Promise(resolve => backend.close(resolve));
    await assert.rejects(fetch(`http://127.0.0.1:${proxy.address().port}`, { signal: AbortSignal.timeout(2000) }));
  } finally {
    await new Promise(resolve => proxy?.close(resolve) ?? resolve());
    await new Promise(resolve => backend.close(resolve));
  }
});

test('forwarder timeout and connection errors close both sockets without selecting arbitrary targets', () => {
  const code = composeConfig().services.forwarder.command.at(-1);
  for (const failure of ['timeout', 'error']) {
    const sockets = [];
    const socket = () => {
      const callbacks = {};
      const value = { callbacks, destroyed: false, setTimeout(ms) { assert.equal(ms, 30000); }, on(event, fn) { callbacks[event] = fn; }, pipe(target) { return target; }, destroy() { this.destroyed = true; } };
      sockets.push(value); return value;
    };
    let connect;
    vm.runInNewContext(code, { require(name) {
      assert.equal(name, 'node:net');
      return { createServer(handler) { connect = handler; return { listen(port, host) { assert.equal(port, 3000); assert.equal(host, '0.0.0.0'); } }; }, createConnection(target) { assert.equal(target.host, 'app'); assert.equal(target.port, 3000); return socket(); } };
    } });
    connect(socket());
    sockets[0].callbacks[failure](new Error('synthetic-private-error'));
    assert.ok(sockets.every(socket => socket.destroyed));
  }
});

test('bounded command output rejects safely and removes interruption listeners', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  await assert.rejects(command('git', ['-c', 'alias.fixture=!printf synthetic-private-output', 'fixture'], { maxOutput: 4 }), error => !String(error).includes('synthetic-private-output'));
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), before);
});

test('Compose gives the app the reserved browser alias and fixes checker navigation to it', () => {
  const { services } = composeConfig();
  assert.equal(services.checker.environment.CHECKER_URL, 'http://deskdrop.test:3000', 'bare app is an HSTS domain, not a valid private HTTP browser endpoint');
  assert.ok(services.app.networks.isolated.aliases.includes('deskdrop.test'));
});

test('zero release identities cannot authorize host installation or deployment', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls);
  const invalid = { ...release, appDigest: `sha256:${'0'.repeat(64)}` };
  await put(dir, 'release.json', invalid);
  await allowDeploy(dir);
  for (const name of ['host-install', 'deploy']) await assert.rejects(action(name, [], run, { artifacts: dir }));
  assert.equal(calls.filter(x => x.file === 'gcloud').length, 0);
}));

test('foundation plan needs no build but its applied receipt cannot authorize publication', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls), backendFile = path.join(dir, 'backend.json');
  await put(dir, 'bootstrap-applied.json', { commit, planHash });
  await put(dir, 'foundation.tfvars.json', { project_id: 'se-demos-project', region: 'us-central1', zone: 'us-central1-a', environment: 'demo', phase: 'foundation' });
  await put(dir, 'backend.json', { backend: { type: 'gcs', config: { bucket: 'se-demos-project-deskdrop-tfstate', prefix: 'deskdrop/demo' } } });
  const result = await action('plan', ['foundation'], run, { artifacts: dir, backendFile });
  assert.equal(result.phase, 'foundation');
  assert.ok(calls.some(x => x.file === 'terraform' && x.args[0] === '-chdir=infra/terraform'));
  await put(dir, 'terraform-applied.json', { commit, planHash, phase: 'foundation' });
  await put(dir, 'build.json', { commit, ids: { app: appDigest, checker: checkerDigest }, manifests: { app: appDigest, checker: checkerDigest } });
  await put(dir, 'publication-approval.json', { commit, appDigest, checkerDigest, approved: true, owner: 'operator' });
  await assert.rejects(action('publish', [], run, { artifacts: dir }));
  assert.equal(calls.filter(x => x.file === 'docker').length, 0);
}));

test('zero manifest cannot publish even when every approval and inspected image matches', async () => withArtifacts(async dir => {
  const zero = `sha256:${'0'.repeat(64)}`, calls = [], base = fakeRun(calls);
  await put(dir, 'build.json', { commit, ids: { app: zero, checker: zero }, manifests: { app: zero, checker: zero } });
  await put(dir, 'terraform-applied.json', { commit, planHash });
  await put(dir, 'publication-approval.json', { commit, appDigest: zero, checkerDigest: zero, approved: true, owner: 'operator' });
  const run = async (file, args, options) => {
    if (file === 'docker') { calls.push({ file, args, options }); return args[0] === 'image' ? zero : args[0] === 'push' ? `digest: ${zero}` : ''; }
    return base(file, args, options);
  };
  await assert.rejects(action('publish', [], run, { artifacts: dir }));
  assert.equal(calls.filter(x => x.file === 'docker' && x.args[0] === 'push').length, 0);
}));

test('typed cloud release cannot use legacy Terraform plan or deployment bypasses', async () => withArtifacts(async dir => {
  const calls = [], run = fakeRun(calls);
  await put(dir, 'release.json', { ...release, phase: 'release', evidenceHash: 'e'.repeat(64) });
  await allowDeploy(dir);
  for (const name of ['host-install', 'deploy']) await assert.rejects(action(name, [], run, { artifacts: dir }));
  await put(dir, 'release.tfvars.json', { project_id: 'se-demos-project', region: 'us-central1', zone: 'us-central1-a', environment: 'demo', phase: 'release', cloud_release: true, image_digest: imageFixture });
  await assert.rejects(action('plan', ['release'], run, { artifacts: dir }));
  assert.equal(calls.filter(x => ['terraform', 'gcloud'].includes(x.file)).length, 0);
}));
