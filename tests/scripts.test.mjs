import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scripts = fileURLToPath(new URL("../scripts/golden/", import.meta.url));
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};

function command(cwd, program, args, env = gitEnv) {
  const childEnv = { ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.BASH_ENV;
  return spawnSync(program, args, { cwd, encoding: "utf8", env: childEnv, timeout: 30_000 });
}

function git(cwd, ...args) {
  const result = command(cwd, "git", args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "deskdrop-gate-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  git(directory, "init", "--quiet");
  git(directory, "commit", "--quiet", "--allow-empty", "-m", "base");
  return directory;
}

function write(directory, path, contents) {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), contents);
}

function commit(directory) {
  git(directory, "add", "--all");
  git(directory, "commit", "--quiet", "-m", "fixture change");
  return git(directory, "rev-parse", "HEAD");
}

function scope(directory, base, head, allow) {
  return command(directory, "bash", [join(scripts, "scope-gate.sh"), base, head, ...(allow ? [allow] : [])]);
}

test("scope gate denies every protected path without approval", (t) => {
  const directory = fixture(t);
  const base = git(directory, "rev-parse", "HEAD");
  for (const path of ["package.json", "package-lock.json", ".github/workflows/ci.yml", "tests/golden/cart.json"]) {
    write(directory, path, "fixture\n");
  }
  const result = scope(directory, base, commit(directory));
  assert.equal(result.status, 1);
  for (const path of ["package.json", "package-lock.json", ".github/workflows/ci.yml", "tests/golden/cart.json"]) {
    assert.ok(result.stderr.includes(path), result.stderr);
  }
});

test("scope gate accepts protected changes covered by an ALLOW glob", (t) => {
  const directory = fixture(t);
  const base = git(directory, "rev-parse", "HEAD");
  write(directory, ".github/workflows/ci.yml", "fixture\n");
  const head = commit(directory);
  write(directory, "allow.txt", "```\nALLOW: .github/workflows/**\n```\n");
  assert.equal(scope(directory, base, head, "allow.txt").status, 0);
});

test("scope gate checks all files when an allow file is supplied", (t) => {
  const directory = fixture(t);
  const base = git(directory, "rev-parse", "HEAD");
  write(directory, "app/page.tsx", "page\n");
  write(directory, "unrelated file.txt", "outside\n");
  const head = commit(directory);
  write(directory, "allow.txt", "ALLOW: app/**\n");
  const result = scope(directory, base, head, "allow.txt");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unrelated/);
});

test("scope gate permits ordinary changes without an allow file", (t) => {
  const directory = fixture(t);
  const base = git(directory, "rev-parse", "HEAD");
  write(directory, "app/page.tsx", "page\n");
  assert.equal(scope(directory, base, commit(directory)).status, 0);
});

test("scope gate rejects deletion or renaming away of a protected file", (t) => {
  const directory = fixture(t);
  write(directory, "package.json", "{}\n");
  const base = commit(directory);
  git(directory, "mv", "package.json", "ordinary.txt");
  const head = commit(directory);
  write(directory, "allow.txt", "ALLOW: ordinary.txt\n");
  assert.equal(scope(directory, base, head, "allow.txt").status, 1);
  rmSync(join(directory, "ordinary.txt"));
  assert.equal(scope(directory, base, commit(directory)).status, 1);
});

test("scope gate rejects invalid refs and missing or empty allow files", (t) => {
  const directory = fixture(t);
  const head = git(directory, "rev-parse", "HEAD");
  assert.notEqual(scope(directory, "missing-ref", head).status, 0);
  assert.notEqual(scope(directory, head, head, "missing.txt").status, 0);
  write(directory, "app/page.tsx", "page\n");
  const changed = commit(directory);
  write(directory, "allow.txt", "no approvals\n");
  assert.equal(scope(directory, head, changed, "allow.txt").status, 1);
});

test("red-green runs head assertions against both implementations and cleans worktrees", (t) => {
  const directory = fixture(t);
  write(directory, "value.mjs", "export const value = 1;\n");
  const base = commit(directory);
  write(directory, "value.mjs", "export const value = 2;\n");
  write(directory, "tests/value.test.mjs", 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../value.mjs";\ntest("value is updated", () => assert.equal(value, 2));\n');
  const head = commit(directory);
  const run = (...files) => command(directory, "bash", [join(scripts, "red-green.sh"), base, head, ...files]);
  const result = run("tests/value.test.mjs");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /RED: tests\/value.test.mjs/);
  assert.match(result.stdout, /GREEN: tests\/value.test.mjs/);
  assert.notEqual(run("tests/missing.test.mjs").status, 0);
  assert.equal(git(directory, "worktree", "list", "--porcelain").match(/^worktree /gm).length, 1);
});

test("red-green rejects green-on-base and red-on-head tests", (t) => {
  const directory = fixture(t);
  write(directory, "tests/pass.test.mjs", 'import test from "node:test";\ntest("passes", () => {});\n');
  write(directory, "tests/fail.test.mjs", 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("fails", () => assert.equal(1, 2));\n');
  const head = commit(directory);
  for (const name of ["pass", "fail"]) {
    const result = command(directory, "bash", [join(scripts, "red-green.sh"), head, head, `tests/${name}.test.mjs`]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
  }
});

function strictFixture(t) {
  const directory = fixture(t);
  const head = "a".repeat(40);
  const names = ["typecheck", "unit", "golden", "CodeRabbit Security", "Security Gate"];
  const data = {
    head,
    reviews: [[{ id: 1, user: { login: "coderabbitai[bot]" }, state: "APPROVED", commit_id: head, submitted_at: "2026-10-28T12:00:00Z", body: "Approved." }]],
    threads: [{ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }],
    checks: [{ check_runs: names.map((name) => ({ name, head_sha: head, status: "completed", conclusion: "success" })) }],
    statuses: [[]],
  };
  write(directory, "bin/gh", `#!/usr/bin/env node
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(process.env.GATE_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
let result;
if (args[0] === 'repo') result = 'fixture/repo';
else if (args.includes('graphql')) result = data.threads;
else {
  const route = args.find((arg) => arg.startsWith('repos/'));
  if (route.includes('/reviews?')) result = data.reviews;
  else if (route.includes('/check-runs?')) result = data.checks;
  else if (route.includes('/statuses?')) result = data.statuses;
  else if (route.includes('/pulls/')) result = data.head;
  else process.exit(2);
}
process.stdout.write(typeof result === 'string' ? result : JSON.stringify(result));
`);
  chmodSync(join(directory, "bin/gh"), 0o755);
  return {
    data,
    run() {
      write(directory, "responses.json", JSON.stringify(data));
      return command(directory, "bash", [join(scripts, "strict-gate.sh"), "1"], {
        ...gitEnv,
        PATH: `${join(directory, "bin")}:${process.env.PATH}`,
        GATE_FIXTURE: join(directory, "responses.json"),
      });
    },
  };
}

test("strict gate accepts approved head with every required check successful", (t) => {
  const fixture = strictFixture(t);
  const result = fixture.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS: strict gate/);
});

test("strict gate reports failures across reviews, paginated threads and checks", (t) => {
  const fixture = strictFixture(t);
  fixture.data.reviews[0][0].commit_id = "b".repeat(40);
  fixture.data.reviews.push([{ id: 2, user: { login: "coderabbitai[bot]" }, state: "COMMENTED", submitted_at: "2026-10-28T13:00:00Z", body: "Major issue" }]);
  fixture.data.threads.push({ data: { repository: { pullRequest: { reviewThreads: { nodes: [{ isResolved: false }] } } } } });
  fixture.data.checks[0].check_runs[0].conclusion = "failure";
  fixture.data.checks[0].check_runs.pop();
  fixture.data.statuses = [[{ context: "deployment", state: "pending" }]];
  const result = fixture.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  for (const reason of ["not approved", "Critical or Major", "unresolved", "typecheck", "Security Gate", "deployment"]) {
    assert.ok(result.stderr.includes(reason), result.stderr);
  }
});

test("strict gate rejects absent or revoked approval and skipped checks", (t) => {
  const fixture = strictFixture(t);
  fixture.data.reviews = [[]];
  assert.equal(fixture.run().status, 1);
  fixture.data.reviews = [[{ id: 3, user: { login: "coderabbitai[bot]" }, state: "CHANGES_REQUESTED", commit_id: fixture.data.head, body: "Changes needed" }]];
  assert.equal(fixture.run().status, 1);
  fixture.data.checks[0].check_runs[0].conclusion = "skipped";
  assert.match(fixture.run().stderr, /completed\/skipped/);
});
