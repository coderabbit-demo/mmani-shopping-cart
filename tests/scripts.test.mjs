import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("golden shell scripts guard array expansions for Bash 3.2", () => {
  for (const file of readdirSync(scripts).filter((name) => name.endsWith(".sh"))) {
    const source = readFileSync(join(scripts, file), "utf8");
    for (const match of source.matchAll(/"\$\{([A-Za-z_][A-Za-z0-9_]*)\[@\]\}"/g)) {
      const guard = "${" + match[1] + "[@]+";
      const line = source.slice(0, match.index).split("\n").length;
      assert.equal(source.slice(match.index - guard.length, match.index), guard,
        `${file}:${line} has an unguarded array expansion`);
    }
  }
});

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
  const result = scope(directory, base, head, "allow.txt");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS: diff is within scope/);
  assert.equal(result.stderr, "");
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
  const result = scope(directory, base, commit(directory));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS: diff is within scope/);
  assert.equal(result.stderr, "");
});

test("scope gate fails closed if evaluation exits before printing PASS", (t) => {
  const directory = fixture(t);
  const head = git(directory, "rev-parse", "HEAD");
  const source = readFileSync(join(scripts, "scope-gate.sh"), "utf8");
  const interrupted = source.replace(/^git -C .* diff .*$/m, "exit 0");
  assert.notEqual(interrupted, source);
  write(directory, "interrupted-gate.sh", interrupted);
  const result = command(directory, "bash", ["interrupted-gate.sh", head, head]);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /PASS: diff is within scope/);
  assert.match(result.stderr, /FAIL:/);
});

test("scope gate single star allows direct tests but rejects nested goldens", (t) => {
  const directory = fixture(t);
  const base = git(directory, "rev-parse", "HEAD");
  write(directory, "tests/a.test.mjs", "direct\n");
  const direct = commit(directory);
  write(directory, "allow.txt", "ALLOW: tests/*.test.mjs\n");
  const allowed = scope(directory, base, direct, "allow.txt");
  assert.equal(allowed.status, 0);
  assert.match(allowed.stdout, /PASS: diff is within scope/);
  assert.equal(allowed.stderr, "");
  rmSync(join(directory, "allow.txt"));
  write(directory, "tests/golden/x.test.mjs", "protected\n");
  const nested = commit(directory);
  write(directory, "allow.txt", "ALLOW: tests/*.test.mjs\n");
  const denied = scope(directory, base, nested, "allow.txt");
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /tests\/golden\/x\.test\.mjs/);
});

test("scope gate double star allows nested judge files", (t) => {
  const directory = fixture(t);
  const base = git(directory, "rev-parse", "HEAD");
  write(directory, "scripts/golden/judges/x.md", "judge\n");
  write(directory, "scripts/golden/x.md", "direct\n");
  const head = commit(directory);
  write(directory, "allow.txt", "ALLOW: scripts/golden/**\n");
  const result = scope(directory, base, head, "allow.txt");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS: diff is within scope/);
  assert.equal(result.stderr, "");
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

for (const failure of ["syntax error", "missing module"]) {
  test(`red-green treats an imported ${failure} on base as setup failure`, (t) => {
    const directory = fixture(t);
    if (failure === "syntax error") write(directory, "value.mjs", "export const value = ;\n");
    const base = git(directory, "rev-parse", "HEAD");
    const broken = failure === "syntax error" ? commit(directory) : base;
    write(directory, "value.mjs", "export const value = 2;\n");
    write(directory, "tests/value.test.mjs", 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { value } from "../value.mjs";\ntest("value is updated", () => assert.equal(value, 2));\n');
    const head = commit(directory);
    const result = command(directory, "bash", [join(scripts, "red-green.sh"), broken, head, "tests/value.test.mjs"]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /SETUP FAILURE: base test did not produce a loaded assertion failure/);
    assert.doesNotMatch(result.stdout, /^RED:/m);
    assert.match(result.stdout, /GREEN: tests\/value.test.mjs/);
  });
}

test("red-green treats an empty test file as setup failure", (t) => {
  const directory = fixture(t);
  write(directory, "tests/empty.test.mjs", "export const value = 1;\n");
  const head = commit(directory);
  const result = command(directory, "bash", [join(scripts, "red-green.sh"), head, head, "tests/empty.test.mjs"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /SETUP FAILURE: base test did not produce a loaded assertion failure/);
  assert.doesNotMatch(result.stdout, /^RED:/m);
});

function reviewCoverage(coveredCommitId = "a".repeat(40), kind = "reviewed") {
  return `<!-- final_review_risk_coverage:${JSON.stringify({ sourceCommitId: coveredCommitId, coveredCommitId, kind })} -->`;
}

function securitySummary(status = "passed", coverage = reviewCoverage()) {
  return `<details>\n<summary>Pre-merge checks</summary>\n<details>\n<summary>${status === "passed" ? "Passed" : "Failed"} checks</summary>\n\n| Check | Status | Explanation |\n| --- | --- | --- |\n|        Security Gate       | ![${status}](https://storage.googleapis.com/coderabbit_public_assets/pre-merge-checks-${status}.svg) | Review result. |\n\n</details>\n</details>\n${coverage}`;
}

function strictFixture(t) {
  const directory = fixture(t);
  const head = "a".repeat(40);
  const names = ["typecheck", "unit", "golden", "CodeRabbit Security"];
  const data = {
    head,
    reviews: [[{ id: 1, user: { login: "coderabbitai[bot]" }, state: "APPROVED", commit_id: head, submitted_at: "2026-10-28T12:00:00Z", body: "Approved." }]],
    threads: [{ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }],
    checks: [{ check_runs: names.map((name) => ({ name, head_sha: head, status: "completed", conclusion: "success" })) }],
    statuses: [[]],
    comments: [[{ id: 1, user: { login: "coderabbitai" }, updated_at: "2026-10-28T12:00:00Z", body: securitySummary() }]],
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
  else if (route.includes('/comments?')) result = data.comments;
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

test("strict gate accepts a passed Security Gate row without a Security Gate check-run", (t) => {
  const fixture = strictFixture(t);
  const result = fixture.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS: strict gate/);
  assert.equal(result.stderr, "");
  assert.equal(fixture.data.checks[0].check_runs.some((check) => check.name === "Security Gate"), false);
});

for (const [name, coverage] of [
  ["an older head marker", reviewCoverage("b".repeat(40))],
  ["a missing marker", ""],
  ["a malformed marker", "<!-- final_review_risk_coverage:{invalid JSON} -->"],
  ["an unreviewed marker", reviewCoverage("a".repeat(40), "pending")],
  ["conflicting markers", `${reviewCoverage()}\n${reviewCoverage("b".repeat(40))}`],
  ["conflicting markers in reverse order", `${reviewCoverage("b".repeat(40))}\n${reviewCoverage()}`],
  ["a malformed marker alongside valid coverage", `${reviewCoverage()}\n<!-- final_review_risk_coverage:{invalid JSON} -->`],
  ["an unterminated marker alongside valid coverage", `${reviewCoverage()}\n<!-- final_review_risk_coverage:{`],
]) {
  test(`strict gate rejects Security Gate coverage with ${name}`, (t) => {
    const fixture = strictFixture(t);
    fixture.data.comments.push([{
      id: 2,
      user: { login: "coderabbitai[bot]" },
      updated_at: "2026-10-28T13:00:00Z",
      body: `${securitySummary("passed", coverage)}\n<!-- change_assessment_commit:"${fixture.data.head}" -->`,
    }]);
    const result = fixture.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.stderr, `FAIL: Security Gate summary does not cover head ${fixture.data.head}\n`);
    assert.doesNotMatch(result.stdout, /PASS: strict gate/);
  });
}

test("strict gate accepts reviewed Security Gate coverage for the current head", (t) => {
  const fixture = strictFixture(t);
  fixture.data.comments[0][0].user.login = "coderabbitai[bot]";
  fixture.data.comments[0][0].body = securitySummary("passed", reviewCoverage(fixture.data.head));
  const result = fixture.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, `PASS: strict gate for PR #1 at ${fixture.data.head}\n`);
});

for (const status of ["failed", "warning", "error", "inconclusive"]) {
  test(`strict gate rejects a ${status} Security Gate row in the latest summary`, (t) => {
    const fixture = strictFixture(t);
    fixture.data.comments.push([{ id: 2, user: { login: "coderabbitai" }, updated_at: "2026-10-28T13:00:00Z", body: securitySummary(status) }]);
    const result = fixture.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Security Gate status is not passed in latest CodeRabbit summary/);
  });
}

test("strict gate rejects a missing Pre-merge checks section", (t) => {
  const fixture = strictFixture(t);
  fixture.data.comments[0][0].body = "Review summary without pre-merge results.";
  const result = fixture.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /CodeRabbit summary with Pre-merge checks is missing/);
});

test("strict gate rejects a missing Security Gate row", (t) => {
  const fixture = strictFixture(t);
  fixture.data.comments[0][0].body = securitySummary().replace("Security Gate", "Other check");
  const result = fixture.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Security Gate row is missing from latest CodeRabbit summary/);
});

test("strict gate still requires the CodeRabbit Security GitHub check", (t) => {
  const fixture = strictFixture(t);
  fixture.data.checks[0].check_runs.pop();
  const result = fixture.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /required check is missing: CodeRabbit Security/);
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
  for (const reason of ["not approved", "Critical or Major", "unresolved", "typecheck", "CodeRabbit Security", "deployment"]) {
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

function openPrFixture(t) {
  const directory = fixture(t);
  const brief = "docs/briefs/step with spaces.md";
  const results = "results with spaces.md";
  const title = "chore: automatic PR opening";
  const source = `# Brief 00b — \`${title}\`\n\n**Mode:** Brownfield. **Jira:** SC-3\n`;
  const report = "Validation: PASS\r\nJudges: PASS\r\nRED then GREEN\nSkipped findings: none\nLiteral: `code` $HOME $(touch injected)";
  const stateFile = join(directory, "responses.json");
  write(directory, brief, source);
  write(directory, results, report);
  const data = { pr: null, calls: [], comments: [[]], failure: null };
  write(directory, "bin/gh", `#!/usr/bin/env node
const fs = require('node:fs');
const file = process.env.OPEN_PR_FIXTURE;
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const action = args.slice(0, args[0] === 'api' ? 1 : 2).join(' ');
const option = (name) => args[args.indexOf(name) + 1];
data.calls.push(args);
const save = () => fs.writeFileSync(file, JSON.stringify(data));
if (data.failure === action) {
  save();
  console.log('https://github.com/fixture/repo/pull/7');
  console.error('remote failure https://github.com/fixture/repo/pull/7');
  process.exit(17);
}
let result;
if (action === 'repo view') result = { nameWithOwner: 'fixture/repo', url: 'https://github.com/fixture/repo' };
else if (action === 'pr list') result = data.listResponse ?? (data.pr ? [data.pr] : []);
else if (action === 'pr create') {
  data.pr = { number: 7, url: 'https://github.com/fixture/repo/pull/7', isCrossRepository: false };
  data.body = fs.readFileSync(option('--body-file'), 'utf8');
  data.title = option('--title');
  result = data.createResponse ?? data.pr.url;
} else if (action === 'pr edit') {
  data.body = fs.readFileSync(option('--body-file'), 'utf8');
  result = data.pr.url;
} else if (action === 'api') {
  if (!args.includes('--paginate') ||
      !args.includes('repos/fixture/repo/issues/7/comments?per_page=100')) process.exit(19);
  if (args.includes('--jq')) {
    if (args.includes('--slurp')) process.exit(19);
    result = data.comments.map((page) => Array.isArray(page) &&
      page.every((comment) => typeof comment?.body === 'string')
      ? page.filter((comment) => comment.body === '@coderabbitai test').length : -1).join('\\n');
  } else {
    if (!args.includes('--slurp')) process.exit(19);
    result = data.comments;
  }
} else if (action === 'pr comment') {
  data.comments.push([{ body: option('--body') }]);
  result = data.pr.url + '#issuecomment-1';
} else process.exit(18);
save();
process.stdout.write(typeof result === 'string' ? result + '\\n' : JSON.stringify(result));
`);
  chmodSync(join(directory, "bin/gh"), 0o755);
  return {
    directory, brief, results, title, source, report, data,
    run(args = ["feature/sc-3", brief, results], script = join(scripts, "open-pr.sh")) {
      writeFileSync(stateFile, JSON.stringify(data));
      const result = command(directory, "bash", [script, ...args], {
        ...gitEnv,
        PATH: `${join(directory, "bin")}:${process.env.PATH}`,
        OPEN_PR_FIXTURE: stateFile,
        TMPDIR: directory,
      });
      Object.assign(data, JSON.parse(readFileSync(stateFile, "utf8")));
      return result;
    },
  };
}

function assertOpened(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, "https://github.com/fixture/repo/pull/7\n");
  assert.equal(result.stderr, "");
}

function assertOpenFailed(result, message) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, message);
  assert.doesNotMatch(result.stderr, /https?:\/\//);
}

test("open-pr creates a PR with exact metadata, verbatim results and a final URL", (t) => {
  const f = openPrFixture(t);
  assertOpened(f.run());
  assert.equal(f.data.title, f.title);
  const create = f.data.calls.find((args) => args[0] === "pr" && args[1] === "create");
  assert.equal(create[create.indexOf("--base") + 1], "main");
  assert.equal(create[create.indexOf("--head") + 1], "feature/sc-3");
  assert.equal(f.data.body, `Jira: SC-3\n\n[Brief](https://github.com/fixture/repo/blob/feature%2Fsc-3/docs/briefs/step%20with%20spaces.md)\n\n${f.report}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n`);
  assert.equal(readdirSync(f.directory).includes("injected"), false);
});

test("open-pr updates an existing PR body without creating a duplicate", (t) => {
  const f = openPrFixture(t);
  f.data.pr = { number: 7, url: "https://github.com/fixture/repo/pull/7", isCrossRepository: false };
  assertOpened(f.run());
  assert.equal(f.data.calls.filter((args) => args[1] === "edit").length, 1);
  assert.equal(f.data.calls.some((args) => args[1] === "create"), false);
  assert.ok(f.data.body.includes(f.report));
});

test("open-pr posts the test comment exactly once across two runs", (t) => {
  const f = openPrFixture(t);
  assertOpened(f.run());
  assertOpened(f.run());
  assert.equal(f.data.calls.filter((args) => args[1] === "create").length, 1);
  assert.equal(f.data.calls.filter((args) => args[1] === "comment").length, 1);
  assert.deepEqual(f.data.comments.flat(), [{ body: "@coderabbitai test" }]);
});

test("open-pr finds an identical test comment on a later page", (t) => {
  const f = openPrFixture(t);
  f.data.comments = [[{ body: "Please run @coderabbitai test" }], [{ body: "@coderabbitai test" }]];
  assertOpened(f.run());
  assert.equal(f.data.calls.some((args) => args[1] === "comment"), false);
});

test("open-pr does not treat a similar comment as an identical request", (t) => {
  const f = openPrFixture(t);
  f.data.comments = [[{ body: "@coderabbitai test please" }]];
  assertOpened(f.run());
  assert.equal(f.data.calls.filter((args) => args[1] === "comment").length, 1);
});

for (const action of ["repo view", "pr list", "pr create", "pr edit", "api", "pr comment"]) {
  test(`open-pr fails without leaking a URL when gh ${action} fails`, (t) => {
    const f = openPrFixture(t);
    f.data.failure = action;
    if (action === "pr edit") f.data.pr = { number: 7, url: "https://github.com/fixture/repo/pull/7", isCrossRepository: false };
    const result = f.run();
    assertOpenFailed(result, /FAIL: gh .*failed/);
    assert.equal(result.status, 17);
  });
}

for (const branch of ["-bad", "feature;echo", "feature name", "$(touch injected)", ""]) {
  test(`open-pr rejects invalid branch ${JSON.stringify(branch)} before calling gh`, (t) => {
    const f = openPrFixture(t);
    assertOpenFailed(f.run([branch, f.brief, f.results]), /Invalid branch/);
    assert.deepEqual(f.data.calls, []);
  });
}

for (const path of ["outside.md", "docs/briefs/../../outside.md", "docs/briefs-neighbor/step.md"]) {
  test(`open-pr rejects a brief outside docs/briefs: ${path}`, (t) => {
    const f = openPrFixture(t);
    write(f.directory, "outside.md", f.source);
    write(f.directory, "docs/briefs-neighbor/step.md", f.source);
    assertOpenFailed(f.run(["feature/sc-3", path, f.results]), /Brief must be under docs\/briefs/);
    assert.deepEqual(f.data.calls, []);
  });
}

for (const missing of ["brief", "results"]) {
  test(`open-pr rejects a missing ${missing} file`, (t) => {
    const f = openPrFixture(t);
    rmSync(join(f.directory, f[missing]));
    assertOpenFailed(f.run(), /Brief and results must be existing files/);
    assert.deepEqual(f.data.calls, []);
  });
}

for (const [name, source] of [
  ["missing Jira", "# Brief — `chore: title`\n"],
  ["malformed Jira", "# Brief — `chore: title`\n**Jira:** invalid\n"],
  ["missing heading", "**Jira:** SC-3\n"],
  ["missing backticked title", "# Brief without title\n**Jira:** SC-3\n"],
  ["title only in a later heading", "# No title\n# Later `chore: title`\n**Jira:** SC-3\n"],
]) {
  test(`open-pr rejects metadata with ${name}`, (t) => {
    const f = openPrFixture(t);
    write(f.directory, f.brief, source);
    assertOpenFailed(f.run(), /Brief must contain/);
    assert.deepEqual(f.data.calls, []);
  });
}

test("open-pr rejects malformed create output without printing a URL", (t) => {
  const f = openPrFixture(t);
  f.data.createResponse = "not a PR URL";
  assertOpenFailed(f.run(), /Invalid PR URL/);
  assert.equal(f.data.calls.some((args) => args[0] === "api"), false);
});

test("open-pr rejects ambiguous existing PRs", (t) => {
  const f = openPrFixture(t);
  f.data.listResponse = [7, 8].map((number) => ({ number, url: `https://github.com/fixture/repo/pull/${number}`, isCrossRepository: false }));
  assertOpenFailed(f.run(), /Multiple open PRs/);
  assert.equal(f.data.calls.some((args) => ["create", "edit"].includes(args[1])), false);
});

test("open-pr help succeeds without invoking gh", (t) => {
  const f = openPrFixture(t);
  const result = f.run(["--help"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^Usage: open-pr.sh/);
  assert.equal(result.stderr, "");
  assert.deepEqual(f.data.calls, []);
});

test("open-pr rejects an incorrect argument count", (t) => {
  const f = openPrFixture(t);
  const result = f.run([]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Usage: open-pr.sh/);
  assert.deepEqual(f.data.calls, []);
});

test("scope gate ignores main commits after the branch point", (t) => {
  const directory = fixture(t);
  git(directory, "branch", "-M", "main");
  git(directory, "checkout", "--quiet", "-b", "feature");
  write(directory, "app/page.tsx", "in scope\n");
  const head = commit(directory);
  git(directory, "checkout", "--quiet", "main");
  write(directory, "docs/main-only.md", "unrelated main commit\n");
  const base = commit(directory);
  write(directory, "allow.txt", "ALLOW: app/**\n");
  const result = scope(directory, base, head, "allow.txt");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout, "PASS: diff is within scope\n");
  assert.equal(result.stderr, "");
});

test("scope gate fails closed for histories without a merge base", (t) => {
  const directory = fixture(t);
  const base = git(directory, "rev-parse", "HEAD");
  git(directory, "checkout", "--quiet", "--orphan", "unrelated");
  write(directory, "app/page.tsx", "unrelated history\n");
  const result = scope(directory, base, commit(directory));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(result.stdout, "");
  assert.doesNotMatch(result.stderr, /PASS:/);
});

test("open-pr fails closed if execution ends before recording a URL", (t) => {
  const f = openPrFixture(t);
  let source;
  assert.doesNotThrow(() => { source = readFileSync(join(scripts, "open-pr.sh"), "utf8"); });
  const interrupted = source.replace(/^node --input-type=module .*$/m, "exit 0");
  assert.notEqual(interrupted, source);
  write(f.directory, "interrupted-open-pr.sh", interrupted);
  const result = f.run(undefined, "interrupted-open-pr.sh");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /FAIL: PR operation ended without a URL/);
  assert.deepEqual(f.data.calls, []);
});

test("open-pr suppresses its URL if temporary-file cleanup fails", (t) => {
  const f = openPrFixture(t);
  write(f.directory, "bin/rm", "#!/usr/bin/env bash\nexit 1\n");
  chmodSync(join(f.directory, "bin/rm"), 0o755);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /FAIL: could not remove PR temporary files/);
});

test("open-pr accepts absolute brief and results paths within the repository", (t) => {
  const f = openPrFixture(t);
  assertOpened(f.run(["feature/sc-3", join(f.directory, f.brief), join(f.directory, f.results)]));
  assert.ok(f.data.body.includes(f.report));
});

for (const [name, response] of [
  ["malformed JSON", "invalid json"],
  ["a malformed PR list", { unexpected: true }],
  ["an invalid PR number", [{ number: 8, url: "https://github.com/fixture/repo/pull/7", isCrossRepository: false }]],
]) {
  test(`open-pr rejects ${name} without editing a PR`, (t) => {
    const f = openPrFixture(t);
    f.data.listResponse = response;
    assertOpenFailed(f.run(), /Invalid (JSON|PR)/);
    assert.equal(f.data.calls.some((args) => ["create", "edit"].includes(args[1])), false);
  });
}

test("open-pr rejects malformed comment pages without printing a URL", (t) => {
  const f = openPrFixture(t);
  f.data.comments = [{ body: "@coderabbitai test" }];
  assertOpenFailed(f.run(), /Invalid comments/);
  assert.equal(f.data.calls.some((args) => args[1] === "comment"), false);
});


test("open-pr rejects a symlink escaping docs/briefs", { skip: process.platform === "win32" }, (t) => {
  const f = openPrFixture(t);
  write(f.directory, "outside.md", f.source);
  symlinkSync(join(f.directory, "outside.md"), join(f.directory, "docs/briefs/escape.md"));
  assertOpenFailed(f.run(["feature/sc-3", "docs/briefs/escape.md", f.results]), /Brief must be under docs\/briefs/);
  assert.deepEqual(f.data.calls, []);
});

test("open-pr encodes parentheses in the brief link", (t) => {
  const f = openPrFixture(t);
  const brief = "docs/briefs/step)link(.md";
  write(f.directory, brief, f.source);
  assertOpened(f.run(["feature/sc-3", brief, f.results]));
  assert.match(f.data.body, /\[Brief\]\(https:\/\/github\.com\/fixture\/repo\/blob\/feature%2Fsc-3\/docs\/briefs\/step%29link%28\.md\)/);
});


for (const matching of [true, false]) {
  test(`open-pr handles more than 1 MiB of comments ${matching ? "with" : "without"} an exact match`, (t) => {
    const f = openPrFixture(t);
    f.data.comments = [
      Array.from({ length: 100 }, () => ({ body: "Unrelated comment: " + "x".repeat(12_000) })),
      [{ body: "@coderabbitai test please" }, ...(matching ? [{ body: "@coderabbitai test" }] : [])],
    ];
    assert.ok(Buffer.byteLength(JSON.stringify(f.data.comments)) > 1024 * 1024);
    assertOpened(f.run());
    const api = f.data.calls.find((args) => args[0] === "api");
    assert.ok(api.includes("--paginate"));
    assert.ok(api.includes("--jq"));
    assert.equal(api.includes("--slurp"), false);
    assert.equal(f.data.calls.filter((args) => args[1] === "comment").length, matching ? 0 : 1);
    assert.equal(f.data.comments.flat().filter((comment) => comment.body === "@coderabbitai test").length, 1);
  });
}

test("strict gate accepts a completed neutral CodeRabbit Security check", (t) => {
  const f = strictFixture(t);
  f.data.checks[0].check_runs.find((check) => check.name === "CodeRabbit Security").conclusion = "neutral";
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, `PASS: strict gate for PR #1 at ${f.data.head}\n`);
});

test("strict gate rejects unit neutral even when CodeRabbit Security neutral passes", (t) => {
  const f = strictFixture(t);
  for (const check of f.data.checks[0].check_runs) {
    if (["unit", "CodeRabbit Security"].includes(check.name)) check.conclusion = "neutral";
  }
  const result = f.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(result.stderr, "FAIL: check unit: completed/neutral\n");
  assert.equal(result.stdout, "");
});

for (const conclusion of ["failure", "cancelled", "timed_out", "action_required", "skipped", null]) {
  test(`strict gate rejects CodeRabbit Security conclusion ${conclusion ?? "pending"}`, (t) => {
    const f = strictFixture(t);
    f.data.checks[0].check_runs.find((check) => check.name === "CodeRabbit Security").conclusion = conclusion;
    const result = f.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.stderr, `FAIL: check CodeRabbit Security: completed/${conclusion ?? "pending"}\n`);
    assert.equal(result.stdout, "");
  });
}

test("strict gate rejects a pending CodeRabbit Security check", (t) => {
  const f = strictFixture(t);
  const security = f.data.checks[0].check_runs.find((check) => check.name === "CodeRabbit Security");
  security.status = "in_progress";
  security.conclusion = null;
  const result = f.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(result.stderr, "FAIL: check CodeRabbit Security: in_progress/pending\n");
  assert.equal(result.stdout, "");
});

test("strict gate rejects a neutral CodeRabbit Security check for another head", (t) => {
  const f = strictFixture(t);
  const security = f.data.checks[0].check_runs.find((check) => check.name === "CodeRabbit Security");
  security.head_sha = "b".repeat(40);
  security.conclusion = "neutral";
  const result = f.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(result.stderr, "FAIL: check CodeRabbit Security: completed/neutral\n");
  assert.equal(result.stdout, "");
});

test("strict gate help documents the neutral exception only for CodeRabbit Security", () => {
  const result = command(scripts, "bash", [join(scripts, "strict-gate.sh"), "--help"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /CodeRabbit Security also accepts neutral/);
  assert.match(result.stdout, /All other checks require success/);
});
