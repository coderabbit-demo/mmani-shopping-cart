import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import * as checker from '../deploy/checker.mjs';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('local seccomp emitter preserves the reviewed bytes and controller hash binding', async () => {
  const result = spawnSync('bash', ['deploy/seccomp-profile.sh'], { timeout: 5000 });
  assert.equal(result.status, 0);
  const digest = '6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c';
  assert.equal(createHash('sha256').update(result.stdout).digest('hex'), digest);
  const controller = await read('scripts/demo/local.mjs');
  assert.ok(controller.includes("run('bash', ['deploy/seccomp-profile.sh'])"));
  assert.ok(controller.includes(digest));
  assert.notEqual(spawnSync('bash', ['deploy/seccomp-profile.sh', 'invalid']).status, 0);
});

test('runtime pins retain only the identical Docker architecture and immutable images', async () => {
  assert.deepEqual(JSON.parse(await read('deploy/runtime-versions.json')), {
    architecture: 'linux/amd64',
    nodeImage: 'node:24.13.0-bookworm-slim@sha256:46feb5752989c05b8606e6323fbbc3db667d14ade1c24f5d0d44d9ca9909d607',
    playwrightImage: 'mcr.microsoft.com/playwright:v1.64.1-noble@sha256:ee15712262f017b8157421b212b12099146645f44b1bc5c0514cbbe6a229b1d0',
    datadogImage: 'registry.datadoghq.com/agent:7.85.0@sha256:1e45b8442dbcc297a01eb9ef61b7b909650b30e50f3dd6aa3654d89380bf5cc9',
  });
  assert.deepEqual(Object.keys(checker).sort(), ['journeyLocal', 'validateLocal']);
  assert.match(await read('deploy/local-checker.mjs'), /import \{ journeyLocal, validateLocal \} from '\.\/checker.mjs'/);
});

test('active deployment code contains no retired provider configuration or release entry points', async () => {
  for (const name of ['infra/bootstrap/main.tf', 'infra/terraform/main.tf', '.github/workflows/infra.yml', 'deploy/bootstrap.sh', 'deploy/compose.yaml', 'deploy/checker.Dockerfile', 'scripts/demo/baseline.mjs']) {
    await assert.rejects(read(name), { code: 'ENOENT' });
  }
  for (const directory of ['deploy/', 'scripts/demo/', '.github/workflows/']) {
    for (const item of await readdir(new URL(directory, root), { recursive: true, withFileTypes: true })) {
      if (!item.isFile()) continue;
      const text = await readFile(join(item.parentPath, item.name), 'utf8');
      assert.doesNotMatch(text, /gcloud|terraform|googleProvider|vmImage|hostPackages|pkg\.dev|vercel|bootstrap\.sh|baseline\.mjs/i, item.name);
    }
  }
});

test('deployment scan reads a checkout containing spaces and still rejects forbidden contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'deskdrop checkout spaces '));
  try {
    for (const name of ['tests', 'deploy', 'scripts/demo', '.github/workflows']) await mkdir(join(directory, name), { recursive: true });
    await copyFile(fileURLToPath(import.meta.url), join(directory, 'tests/docker-only.test.mjs'));
    await copyFile(new URL('../deploy/checker.mjs', import.meta.url), join(directory, 'deploy/checker.mjs'));
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const scan = () => spawnSync(process.execPath, ['--test', '--test-name-pattern=^active deployment code', 'tests/docker-only.test.mjs'], { cwd: directory, env, encoding: 'utf8', timeout: 10000 });
    const clean = scan();
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    await writeFile(join(directory, 'scripts/demo/fixture.mjs'), 'terraform');
    const forbidden = scan();
    assert.notEqual(forbidden.status, 0);
    assert.match(forbidden.stdout + forbidden.stderr, /terraform/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('profile generation and digest failures prevent every Docker image mutation', async () => {
  const { build } = await import('../scripts/demo/local.mjs');
  for (const mode of ['generation', 'digest']) {
    const calls = [];
    let profiles = 0, portChecks = 0;
    const run = async (file, args) => {
      calls.push([file, ...args]);
      if (file === 'git') {
        if (args[0] === 'rev-parse') return Buffer.from('a'.repeat(40));
        if (args[0] === 'status') return Buffer.alloc(0);
        if (args[0] === 'ls-tree') return Buffer.from('Dockerfile\0');
        if (args[0] === 'archive') return Buffer.from('synthetic archive');
      }
      if (file === 'bash') {
        assert.deepEqual(args, ['deploy/seccomp-profile.sh']); profiles++;
        if (mode === 'generation') throw new Error('Synthetic profile generation failure');
        return Buffer.from('invalid profile');
      }
      throw new Error('Unexpected command');
    };
    await assert.rejects(build(run, async () => { portChecks++; }), mode === 'generation' ? /Synthetic profile generation failure/ : /Seccomp profile mismatch/);
    assert.equal(profiles, 1);
    assert.equal(portChecks, 1);
    assert.equal(calls.filter(([file]) => file === 'docker').length, 0, 'profile failure must precede all Docker commands');
  }
});
