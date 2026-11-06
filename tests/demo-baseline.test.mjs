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
 if [ "$operation" = -D ]; then
  local candidate found=1
  local -a remaining=()
  for candidate in \${rules[@]+"\${rules[@]}"}; do
   if [ "$candidate" = "$chain $*" ] && [ "$found" = 1 ]; then found=0; else remaining+=("$candidate"); fi
  done
  rules=(\${remaining[@]+"\${remaining[@]}"}); return "$found"
 fi
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

const monitoringPython = script.split("<<'MONITORING'\n")[1]?.split('\nMONITORING\n')[0];
function monitorFixture(code, input='') {
  assert.ok(monitoringPython);
  const wrapper = `import os,json,base64,tempfile,stat\ng={'__name__':'fixture'}\nexec(compile(${JSON.stringify(monitoringPython)},'monitoring-host','exec'),g)\n${code}`;
  const result=spawnSync('python3',['-c',wrapper],{input,encoding:'utf8',timeout:5000,maxBuffer:32768});
  assert.equal(result.status,0,result.stderr);
}
test('compressed monitoring bundle uses foundation tar helpers and verifies exact release/module hashes',async()=>{
  const {monitoringBundle}=await import('../scripts/demo/baseline.mjs');
  const b=await monitoringBundle({commit:'a'.repeat(40),appDigest:`sha256:${'b'.repeat(64)}`,checkerDigest:`sha256:${'c'.repeat(64)}`});
  monitorFixture(`
v=json.load(__import__('sys').stdin);raw=base64.b64decode(v['raw']);c=v['config'];release=[c['app'],c['checker'],c['source']]
files,config,m=g['bundle'](raw,v['hash'],release)
assert set(files)==g['FILES'] and config==c
for data,digest,rel in [(raw+'x'.encode(),v['hash'],release),(raw,v['hash'],['wrong',*release[1:]])]:
 try:g['bundle'](data,digest,rel);raise AssertionError('tamper accepted')
 except ValueError:pass
`,JSON.stringify({raw:b.bundle.toString('base64'),hash:b.digest,config:JSON.parse(b.files['runtime.json'])}));
});
test('monitoring host rejects unsafe links, modes and noncanonical parents',()=>{
  monitorFixture(`
with tempfile.TemporaryDirectory(dir=os.path.expanduser('~')) as d:
 uid=os.getuid();p=d+'/file';open(p,'w').write('hello');os.chmod(p,0o600)
 assert g['read'](p,uid)==b'hello'
 os.link(p,d+'/alias')
 try:g['read'](p,uid);raise AssertionError('hardlink accepted')
 except ValueError:pass
 os.unlink(d+'/alias');os.chmod(p,0o644)
 try:g['read'](p,uid);raise AssertionError('mode accepted')
 except ValueError:pass
 os.unlink(p);os.symlink(d+'/absent',p)
 try:g['read'](p,uid);raise AssertionError('symlink accepted')
 except OSError:pass
 os.mkdir(d+'/actual',0o700);os.symlink(d+'/actual',d+'/link')
 try:g['safe_dir'](d+'/link',uid,True);raise AssertionError('linked parent accepted')
 except ValueError:pass
`);
});
test('host uses distinct pinned control runtime, verifies owner before stop and never mounts management into recurring processes',()=>{
  monitorFixture(`
c={'owner':'cloud_owner:'+'a'*32,'source':'b'*40,'bundleHash':'c'*64}
for kind in ['controller','heartbeat','installer','cleanup']:
 args=g['options'](c,kind)
 assert '--pull' in args and args[args.index('--pull')+1]=='never'
 assert '/run/deskdrop-management:/run/deskdrop-management:ro' in args if kind=='installer' else not any('management' in a for a in args)
 assert '/var/run/docker.sock:/var/run/docker.sock' in args if kind in ('controller','cleanup') else not any('docker.sock' in a for a in args)
 if kind=='heartbeat':assert g['STATE']+':'+g['STATE']+':ro' in args
calls=[];running=True;present=True
r={'Id':'d'*64,'Config':{'Image':g['CONTROL'],'Labels':g['labels'](c,'controller')},'State':{'Running':True}}
r['HostConfig']={'NetworkMode':'host','ReadonlyRootfs':True,'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges']}
args=g['options'](c,'controller');r['Mounts']=[]
for i,v in enumerate(args):
 if v=='-v':
  parts=args[i+1].split(':');r['Mounts'].append({'Type':'bind','Source':parts[0],'Destination':parts[1],'RW':len(parts)==2})
def docker(*args,**kw):
 global present
 calls.append(args)
 if args[:2]==('container','ls'):return 'deskdrop-cloud-controller' if present else ''
 if args[0]=='inspect':return json.dumps([r])
 if args[0]=='stop':raise __import__('subprocess').TimeoutExpired('docker',40)
 if args[0]=='kill':r['State']['Running']=False;return ''
 if args[0]=='rm':present=False;return ''
 raise AssertionError(args)
g['docker']=docker
g['stop_owned'](c,'controller');assert not present and any(x[0]=='kill' for x in calls)
present=True;r['Config']['Labels']['deskdrop.cloud_owner']='foreign';calls.clear()
try:g['stop_owned'](c,'controller');raise AssertionError('foreign accepted')
except ValueError:pass
assert all(x[0] in ('container','inspect') for x in calls)
`);
});
test('source-only foundation receipts cannot authorize a monitoring installation',async()=>{
  const {action}=await import('../scripts/demo/baseline.mjs');const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const os=await import('node:os');
  const artifacts=await mkdtemp(`${os.tmpdir()}/monitor-receipt-`);let calls=0;
  try{
    await writeFile(`${artifacts}/release.json`,JSON.stringify({phase:'foundation',commit:'a'.repeat(40),appDigest:`sha256:${'b'.repeat(64)}`,checkerDigest:`sha256:${'c'.repeat(64)}`}));
    await assert.rejects(action('monitoring-install',[],async()=>{calls++;assert.fail('no command authorized')},{artifacts}));assert.equal(calls,0);
  }finally{await rm(artifacts,{recursive:true,force:true});}
});

test('host-originated IPv4/IPv6 metadata denial is independent of bridge isolation and preserves root bootstrap',()=>{
  const result=shellFixture(`
iptables() { printf 'v4 %s\\n' "$*"; [ "$1 $2" != '-C OUTPUT' ]; }
ip6tables() { printf 'v6 %s\\n' "$*"; [ "$1 $2" != '-C OUTPUT' ]; }
firewall
`);
  assert.equal(result.status,0,result.stderr);
  const rules=result.stdout.split('\n').filter(l=>l.includes('-I OUTPUT')&&l.endsWith('-j REJECT'));
  assert.equal(rules.length,2);
  assert.ok(rules.includes('v4 -I OUTPUT 1 -d 169.254.169.254/32 -m owner ! --uid-owner 0 -j REJECT'));
  assert.ok(rules.includes('v6 -I OUTPUT 1 -d fd20:ce::254/128 -m owner ! --uid-owner 0 -j REJECT'));
  const metadata=(uid,family)=>rules.some(r=>r.startsWith(family)&&r.includes('! --uid-owner 0')&&uid!==0)?'REJECT':'CONTINUE';
  for(const family of ['v4','v6']){assert.equal(metadata(1000,family),'REJECT');assert.equal(metadata(0,family),'CONTINUE');}
});
test('separate management refresh uses protected management path, with no intake overwrite or secret output',()=>{
  fixture(`
calls=[]
g['sys'].argv=['bootstrap','management-refresh']
g['prepare_runtime']=lambda p:calls.append(('directory',p))
g['runtime_identity']=lambda o:'synthetic-token'
def fetch(o,url,headers):
 assert url==g['SECRET'].replace('deskdrop-datadog-intake','deskdrop-datadog-management')
 assert headers=={'Authorization':'Bearer synthetic-token'}
 return json.dumps({'payload':{'data':base64.b64encode(json.dumps({'apiKey':'A'*32,'appKey':'B'*40}).encode()).decode()}}).encode()
g['fetch']=fetch
g['save_secret']=lambda p,s:calls.append(('file',p))
g['main']()
assert calls==[('directory','/run/deskdrop-management'),('file','/run/deskdrop-management/management')]
`);
});

test('supervisor restarts independently owned processes, invalidates stale health and invokes orphan cleanup on shutdown',()=>{
  monitorFixture(`
c={'owner':'cloud_owner:'+'a'*32,'source':'b'*40,'bundleHash':'c'*64}
g['lock']=lambda *a:__import__('contextlib').nullcontext()
g['read']=lambda *a:json.dumps({'owner':c['owner'],'verified':True,'pending':None,'monitors':[1,2,3]}).encode()
created=[];stopped=[];active={};writes=[];handlers={}
g['atomic']=lambda p,v:writes.append(json.loads(v))
g['signal'].signal=lambda sig,handler:handlers.update({sig:handler})
g['time'].sleep=lambda sec:handlers[g['signal'].SIGTERM]()
g['owned_container']=lambda config,kind:active.get(kind)
def stop(config,kind):stopped.append(kind);active.pop(kind,None)
g['stop_owned']=stop
def docker(*args,**kw):
 assert args[0]=='run';kind=args[-1];created.append(kind)
 active[kind]={'State':{'Running':kind!='cleanup'}}
 return 'd'*64
g['docker']=docker
for i in range(2):
 g['supervise'](c)
 assert not active and writes[-1]['healthy'] is False
assert created==['heartbeat','controller','cleanup']*2
assert stopped.count('cleanup')==2
`);
});
test('host flock excludes concurrent management, survives abrupt owner death and preserves durable state',()=>{
  monitorFixture(`
import subprocess,fcntl
with tempfile.TemporaryDirectory(dir=os.path.expanduser('~')) as d:
 g['STATE']=d;uid=os.getuid()
 with g['lock']('management.lock',uid):
  try:
   with g['lock']('management.lock',uid):raise AssertionError('concurrent acquired')
  except BlockingIOError:pass
 p=d+'/management.lock'
 child=subprocess.Popen(['python3','-u','-c','import os,fcntl,time;f=open('+repr(p)+',"r+");fcntl.flock(f,fcntl.LOCK_EX);print("locked",flush=True);time.sleep(30)'],stdout=subprocess.PIPE)
 try:
  assert child.stdout.readline()==b'locked\\n'
  try:
   with g['lock']('management.lock',uid):raise AssertionError('live lease stolen')
  except BlockingIOError:pass
 finally:child.kill();child.wait(timeout=3)
 with g['lock']('management.lock',uid):pass
 assert os.path.isfile(p)
`);
});

test('actual host installation recovers a lost result without replacing durable ownership or accepting another source',async()=>{
  const {monitoringBundle}=await import('../scripts/demo/baseline.mjs');
  const b=await monitoringBundle({commit:'a'.repeat(40),appDigest:`sha256:${'b'.repeat(64)}`,checkerDigest:`sha256:${'c'.repeat(64)}`});
  monitorFixture(`
import shutil,contextlib
v=json.load(__import__('sys').stdin);uid=os.getuid();real_read=g['read'];real_dir=g['safe_dir'];real_lock=g['lock']
g['read']=lambda p,*a,**kw:real_read(p,uid=uid,**kw)
g['safe_dir']=lambda p,*a,**kw:real_dir(p,uid=uid,**kw)
g['lock']=lambda n:real_lock(n,uid)
with tempfile.TemporaryDirectory(dir=os.path.expanduser('~')) as d:
 os.mkdir(d+'/opt',0o700);g['BASE']=d+'/opt/monitoring';g['STATE']=d+'/var/monitoring'
 transfer=d+'/bundle';release=d+'/release';unit=d+'/unit';raw=base64.b64decode(v['raw'])
 open(transfer,'wb').write(raw);open(release,'w').write('\\n'.join([v['config']['app'],v['config']['checker'],v['config']['source']])+'\\n');os.chmod(release,0o600)
 attempts=[]
 def docker(*args,**kw):
  attempts.append(args)
  if len(attempts)==1:raise OSError('lost install response')
  if args[0]=='pull':return ''
  if args[:2]==('image','inspect'):return 'amd64|linux'
  if args[0]=='run':return 'v24.13.0'
  raise AssertionError(args)
 g['docker']=docker
 def run(args,**kw):
  assert args[0] in ('install','systemctl')
  if args[0]=='install':shutil.copyfile(args[-2],args[-1]);os.chmod(args[-1],0o644)
 g['subprocess'].run=run
 try:g['install'](v['hash'],transfer,release,unit);raise AssertionError('unknown reported success')
 except OSError:pass
 state_path=g['STATE']+'/installation.json';before=open(state_path,'rb').read()
 with contextlib.redirect_stdout(__import__('io').StringIO()) as output:g['install'](v['hash'],transfer,release,unit)
 receipt=json.loads(output.getvalue());assert receipt['bundleHash']==v['hash'] and receipt['source']==v['config']['source']
 assert open(state_path,'rb').read()==before and os.stat(state_path).st_mode&0o777==0o600
 assert os.stat(g['BASE']).st_mode&0o777==0o700
 open(release,'w').write('wrong release')
 try:g['install'](v['hash'],transfer,release,unit);raise AssertionError('other release accepted')
 except ValueError:pass
 assert open(state_path,'rb').read()==before
`,JSON.stringify({raw:b.bundle.toString('base64'),hash:b.digest,config:JSON.parse(b.files['runtime.json'])}));
});

test('trigger installer binds all helpers/units to monitoring source and preserves state on repeat or corrupt transfer',async()=>{
  const {triggerBundle,monitoringBundle}=await import('../scripts/demo/baseline.mjs');
  const rel={commit:'a'.repeat(40),appDigest:`sha256:${'b'.repeat(64)}`,checkerDigest:`sha256:${'c'.repeat(64)}`};
  const b=await triggerBundle(rel),parent=await monitoringBundle(rel);
  assert.deepEqual(Object.keys(b.hashes).sort(),['cloud-monitors.mjs','cloud-runtime.mjs','cloud-trigger.mjs','deskdrop-operator','deskdrop-trigger-recovery.service','deskdrop-trigger.service']);
  const manifest=JSON.parse(b.files['manifest.json']);assert.equal(manifest.source,rel.commit);
  assert.equal(manifest.monitoring,createHash('sha256').update(parent.files['manifest.json']).digest('hex'));
  const code=`
import shutil,contextlib,io
v=json.load(__import__('sys').stdin);uid=os.getuid()
with tempfile.TemporaryDirectory(dir=os.path.expanduser('~')) as d:
 source=${JSON.stringify(monitoringPython)}
 for a,b in [('/opt/deskdrop',d+'/opt'),('/var/lib/deskdrop',d+'/var'),('/etc/systemd/system',d+'/units'),('/usr/local/bin',d+'/bin'),('/tmp/trigger.tar.gz',d+'/transfer')]:source=source.replace(a,b)
 g={'__name__':'fixture'};exec(compile(source,'host-trigger-fixture','exec'),g)
 for p in [d+'/opt',d+'/opt/monitoring',d+'/var',d+'/var/monitoring',d+'/units',d+'/bin']:os.mkdir(p,0o700)
 for name,data in v['parent'].items():
  open(d+'/opt/monitoring/'+name,'wb').write(base64.b64decode(data));os.chmod(d+'/opt/monitoring/'+name,0o600)
 for name,data in v['host'].items():
  open(d+'/opt/'+name,'wb').write(base64.b64decode(data));os.chmod(d+'/opt/'+name,0o700 if name=='bootstrap.sh' else 0o600)
 config=json.loads(base64.b64decode(v['parent']['runtime.json']));g['installed']=lambda:config
 real_read,real_dir,real_lock=g['read'],g['safe_dir'],g['lock']
 g['read']=lambda p,*a,**kw:real_read(p,uid=uid,**kw)
 g['safe_dir']=lambda p,*a,**kw:real_dir(p,uid=uid,**kw)
 g['lock']=lambda name:real_lock(name,uid)
 commands=[]
 def run(args,**kw):
  commands.append(args)
  if args[0]=='/usr/bin/install':shutil.copyfile(args[-2],args[-1]);os.chmod(args[-1],int(args[2],8))
  else:assert args==['/usr/bin/systemctl','daemon-reload']
 g['subprocess'].run=run
 raw=base64.b64decode(v['raw']);open(d+'/transfer','wb').write(raw)
 with contextlib.redirect_stdout(io.StringIO()) as output:g['trigger_install'](v['digest'])
 assert json.loads(output.getvalue())['status']=='trigger-bundle-installed'
 state=d+'/var/trigger/lease.json';open(state,'w').write('uncertain-preserved');os.chmod(state,0o600)
 with contextlib.redirect_stdout(io.StringIO()):g['trigger_install'](v['digest'])
 assert open(state).read()=='uncertain-preserved'
 before=len(commands);open(d+'/transfer','wb').write(raw+b'corrupt')
 try:g['trigger_install'](v['digest']);raise AssertionError('corrupt transfer accepted')
 except ValueError:pass
 assert len(commands)==before and open(state).read()=='uncertain-preserved'
`;
  monitorFixture(code,JSON.stringify({raw:b.bundle.toString('base64'),digest:b.digest,parent:Object.fromEntries(Object.entries(parent.files).map(([k,v])=>[k,v.toString('base64')])),host:{'bootstrap.sh':Buffer.from(script).toString('base64'),'compose.yaml':Buffer.from(await readFile(new URL('../deploy/compose.yaml',import.meta.url))).toString('base64')}}));
});

test('management and supervision share a lease; a timed-out live installer blocks startup before state read',()=>{
  monitorFixture(`
import contextlib,subprocess
c={'owner':'cloud_owner:'+'a'*32,'source':'b'*40,'bundleHash':'c'*64}
held=set();entered=[]
@contextlib.contextmanager
def lock(name):
 if name in held:raise BlockingIOError('busy')
 held.add(name);entered.append(name)
 try:yield
 finally:held.remove(name)
g['lock']=lock
g['owned_container']=lambda *a:(_ for _ in ()).throw(AssertionError('competing operation reached Docker before shared lease'))
with lock('lifecycle.lock'):
 for fn,args in [(g['manage'],(c,'install')),(g['supervise'],(c,))]:
  try:fn(*args);raise AssertionError('competing operation acquired')
  except BlockingIOError:pass
active={};reads=[];calls=[]
g['owned_container']=lambda c,kind:active.get(kind)
g['read']=lambda p:reads.append(p) or json.dumps({'verified':True,'owner':c['owner'],'monitors':[1,2,3]}).encode()
g['subprocess'].run=lambda *a,**kw:None
g['os'].path.lexists=lambda p:False
def docker(*args,**kw):
 calls.append(args);active['installer']={'State':{'Running':True}}
 raise subprocess.TimeoutExpired('docker',300)
g['docker']=docker
try:g['manage'](c,'install');raise AssertionError('timeout accepted')
except subprocess.TimeoutExpired:pass
assert not held and active['installer']['State']['Running']
for installer in [active['installer'],{'State':{} }]:
 active['installer']=installer
 try:g['supervise'](c);raise AssertionError('live or uncertain installer accepted')
 except ValueError:pass
assert not reads and len(calls)==1
`);
});

test('real lifecycle flock rejects both entrypoints while another process owns it and recovers after death',()=>{
  monitorFixture(`
import subprocess
with tempfile.TemporaryDirectory(dir=os.path.expanduser('~')) as d:
 uid=os.getuid();g['STATE']=d;real_lock=g['lock'];g['lock']=lambda name:real_lock(name,uid)
 p=d+'/lifecycle.lock';open(p,'w').close();os.chmod(p,0o600)
 child=subprocess.Popen(['python3','-u','-c','import fcntl,time;f=open('+repr(p)+',"r+");fcntl.flock(f,fcntl.LOCK_EX);print("locked",flush=True);time.sleep(30)'],stdout=subprocess.PIPE)
 g['owned_container']=lambda *a:(_ for _ in ()).throw(AssertionError('Docker reached during competing lease'))
 try:
  assert child.stdout.readline()==b'locked\\n'
  for fn,args in [(g['manage'],({},'install')),(g['supervise'],({},))]:
   try:fn(*args);raise AssertionError('concurrent entrypoint accepted')
   except BlockingIOError:pass
 finally:child.kill();child.wait(timeout=3)
 with g['lock']('lifecycle.lock'):pass
`);
});

test('bootstrap generates and enables the firewall unit required by monitoring and trigger services',async()=>{
  const firewall=script.split("cat > /etc/systemd/system/deskdrop-firewall.service <<'UNIT'\n")[1]?.split('\nUNIT')[0];
  assert.ok(firewall);
  assert.match(firewall,/ExecStart=\/opt\/deskdrop\/bootstrap.sh firewall/);
  assert.match(firewall,/Before=docker.service/);
  assert.match(firewall,/RequiredBy=docker.service/);
  assert.match(script,/systemctl enable deskdrop-firewall.service deskdrop.service/);
  for(const name of ['deskdrop-trigger.service','deskdrop-trigger-recovery.service']){
    const unit=await readFile(new URL('../deploy/systemd/'+name,import.meta.url),'utf8');
    if(name.includes('recovery'))assert.match(unit,/Requires=docker.service deskdrop-firewall.service/);
    else assert.match(unit,/Requires=deskdrop-trigger-recovery.service/);
  }
});

test('trigger maintenance gate excludes monitor management without taking the recurring lifecycle lock',()=>{
 monitorFixture(`
import contextlib
held={'trigger-maintenance.lock'}
@contextlib.contextmanager
def lock(name):
 if name in held:raise BlockingIOError('busy')
 held.add(name)
 try:yield
 finally:held.remove(name)
g['lock']=lock
g['owned_container']=lambda *a:(_ for _ in ()).throw(AssertionError('management reached Docker during trigger'))
try:g['manage']({},'install');raise AssertionError('management overlapped trigger')
except BlockingIOError:pass
assert held=={'trigger-maintenance.lock'}
with lock('lifecycle.lock'):assert len(held)==2
`);
});

const firewallPolicyDriver = String.raw`# CodeRabbit generated offline policy driver; never calls host iptables.
import json,os,pathlib,shlex,subprocess,sys,tempfile

def adapter(state_path,family,args):
    state=json.loads(pathlib.Path(state_path).read_text());state['commands'].append([family,*args]);rules=state[family]
    op,chain,*tail=args
    if chain=='OUTPUT':
        body=tail[1:] if op=='-I' else tail
        allowed=[]
        address='169.254.169.254/32' if family=='v4' else 'fd20:ce::254/128'
        reject=['-d',address,'-m','owner','!','--uid-owner','0','-j','REJECT']
        allowed.append(reject)
        for protocol,port in [('udp','53'),('tcp','53'),('udp','123')]:
            allowed.append(['-d',address,'-p',protocol,'--dport',port,'-m','owner','!','--uid-owner','0','-j','ACCEPT'])
        if op not in ['-C','-D','-I'] or body not in allowed or (op=='-I' and tail[0]!='1'):raise AssertionError('Unexpected OUTPUT mutation: '+repr(args))
        if op=='-C':code=0 if body in rules else 1
        elif op=='-D':rules.remove(body);code=0
        else:rules.insert(0,body);code=0
    else:
        # Strict allowlist for the unchanged bridge rules. No unknown mutation is accepted.
        allowed=[]
        if family=='v4' and chain=='DOCKER-USER' and op in ['-nL','-N'] and not tail:
            pass
        else:
            if family=='v4' and chain=='FORWARD':allowed.append(['-j','DOCKER-USER'])
            for bridge,subnet in [('br-deskdrop','172.30.243.0/24'),('br-deskdrop-in','172.30.244.0/24')]:
                if family=='v4' and chain=='DOCKER-USER':
                    allowed.extend([['-i',bridge,'!','-d',subnet,'-j','DROP'],['-i',bridge,'-m','conntrack','--ctstate','ESTABLISHED','-j','RETURN']])
                if family=='v4' and chain=='INPUT':
                    allowed.extend([['-i',bridge,'-j','DROP'],['-i',bridge,'-m','conntrack','--ctstate','ESTABLISHED','-j','ACCEPT']])
                if family=='v6' and chain in ['FORWARD','INPUT']:allowed.append(['-i',bridge,'-j','DROP'])
            body=tail[1:] if op=='-I' else tail
            if op not in ['-C','-I'] or body not in allowed or (op=='-I' and tail[0]!='1'):raise AssertionError('Unexpected bridge mutation: '+repr(args))
        code=0
    pathlib.Path(state_path).write_text(json.dumps(state));return code

def packet(rules,uid,destination,protocol,port):
    for rule in rules:
        target=rule[rule.index('-d')+1].split('/')[0]
        if target!=destination:continue
        if '--uid-owner' in rule and uid==int(rule[rule.index('--uid-owner')+1]):continue
        if '-p' in rule and rule[rule.index('-p')+1]!=protocol:continue
        if '--dport' in rule and int(rule[rule.index('--dport')+1])!=port:continue
        return rule[rule.index('-j')+1]
    return 'CONTINUE'

def run(bootstrap):
    source=pathlib.Path(bootstrap).read_text();function=source[source.index('firewall() {'):source.index('\ninstall_profile() {')]
    results=[]
    with tempfile.TemporaryDirectory(prefix='deskdrop-policy-') as directory:
        state_path=pathlib.Path(directory)/'state.json'
        unrelated={family:['-d',address,'-p','tcp','--dport','443','-j','REJECT'] for family,address in [('v4','203.0.113.1/32'),('v6','2001:db8::1/128')]}
        for legacy in [False,True]:
            state={'commands':[],'v4':[unrelated['v4'].copy()],'v6':[unrelated['v6'].copy()]}
            for family,address in [('v4','169.254.169.254/32'),('v6','fd20:ce::254/128')]:
                if legacy:state[family].insert(0,['-d',address,'-m','owner','!','--uid-owner','0','-j','REJECT'])
            state_path.write_text(json.dumps(state));snapshot=None
            for iteration in range(3):
                script='set -euo pipefail\n'+function+'\n'
                for tool,family in [('iptables','v4'),('ip6tables','v6')]:
                    script+=tool+'() { '+shlex.join([sys.executable,str(pathlib.Path(__file__).resolve()),'adapter',str(state_path),family])+' "$@"; }\n'
                subprocess.run(['bash','-c',script+'firewall\n'],check=True,timeout=30,capture_output=True)
                state=json.loads(state_path.read_text());observations=[]
                for family,address in [('v4','169.254.169.254'),('v6','fd20:ce::254')]:
                    rules=state[family];assert rules.count(unrelated[family])==1
                    for protocol,port in [('udp',53),('tcp',53),('udp',123),('tcp',80),('tcp',443),('udp',80),('tcp',123),('udp',54),('icmp',0)]:
                        actual=packet(rules,1000,address,protocol,port)
                        expected='ACCEPT' if (protocol,port) in [('udp',53),('tcp',53),('udp',123)] else 'REJECT'
                        assert actual==expected,(legacy,iteration,family,protocol,port,actual,expected)
                        observations.append([family,protocol,port,actual])
                    for protocol,port in [('tcp',80),('tcp',443)]:
                        actual=packet(rules,0,address,protocol,port);assert actual=='CONTINUE'
                        observations.append([family,'root',protocol,port,actual])
                    assert packet(rules,1000,'203.0.113.1' if family=='v4' else '2001:db8::1','tcp',443)=='REJECT'
                    assert packet(rules,1000,'198.51.100.1' if family=='v4' else '2001:db8::2','udp',53)=='CONTINUE'
                    assert len(rules)==5,('duplicate or missing policy',rules)
                current={k:state[k] for k in ['v4','v6']}
                if snapshot is not None:assert current==snapshot,'repeat changed ordered policy'
                snapshot=current
                results.append({'legacy':legacy,'iteration':iteration,'packets':observations,'rules':current})
            results.append({'legacy':legacy,'commands':state['commands']})
    print(json.dumps({'status':'pass','observations':results}))
if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='adapter':sys.exit(adapter(sys.argv[2],sys.argv[3],sys.argv[4:]))
    run(sys.argv[1])
`;
test('ordered host metadata policy preserves DNS/NTP on fresh, legacy and repeated firewall runs',async()=>withArtifacts(async dir=>{
  const driver=path.join(dir,'policy.py');await writeFile(driver,firewallPolicyDriver);
  const result=spawnSync('python3',[driver,new URL('../deploy/bootstrap.sh',import.meta.url).pathname],{encoding:'utf8',timeout:60000,maxBuffer:1000000});
  assert.equal(result.status,0,result.stderr);const observation=JSON.parse(result.stdout);
  assert.equal(observation.status,'pass');assert.equal(observation.observations.filter(x=>x.packets).length,6);
}));


test('host management retains an abandoned installation lock and durable intent before any installer action',()=>{
  monitorFixture(`
import contextlib
with tempfile.TemporaryDirectory(dir=os.path.expanduser('~')) as d:
 g['STATE']=d
 held=[]
 @contextlib.contextmanager
 def lease(name):
  assert name==('trigger-maintenance.lock' if not held else 'lifecycle.lock')
  held.append(name)
  try:yield
  finally:assert held.pop()==name
 g['lock']=lease;g['safe_dir']=lambda p,**kw:None
 g['owned_container']=lambda c,k:None
 g['stop_owned']=lambda *a:(_ for _ in ()).throw(AssertionError('installer removed before reconciliation'))
 g['subprocess'].run=lambda *a,**kw:(_ for _ in ()).throw(AssertionError('management refresh ran'))
 g['docker']=lambda *a,**kw:(_ for _ in ()).throw(AssertionError('installer launched'))
 os.mkdir(d+'/installation.lock',0o700)
 intent=b'{"pending":"unknown-create"}';open(d+'/installation.json','wb').write(intent)
 for attempt in range(2):
  try:g['manage']({},'inspect');raise AssertionError('abandoned lock reclaimed')
  except g['InstallationLockHeld'] as e:assert 'installation.lock' in str(e) and 'durable intent' in str(e)
  assert os.path.isdir(d+'/installation.lock') and open(d+'/installation.json','rb').read()==intent
 # Execute the actual CLI exception handler with only main's host operations adapted.
 import io
 g['main']=lambda:g['manage']({},'inspect');g['__name__']='__main__'
 with contextlib.redirect_stderr(io.StringIO()) as output:
  try:exec(compile(${JSON.stringify(monitoringPython.slice(monitoringPython.indexOf("if __name__=='__main__':")))},'monitoring-cli','exec'),g);raise AssertionError('CLI reported success')
  except SystemExit as e:assert e.code==1
 assert 'Protected installation.lock exists' in output.getvalue() and 'durable intent' in output.getvalue()
 assert os.path.isdir(d+'/installation.lock') and open(d+'/installation.json','rb').read()==intent
`);
});
