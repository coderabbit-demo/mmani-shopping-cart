import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../", import.meta.url));
const golden = "tests/golden/";
const selected = golden + "domain/money-format.json";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "deskdrop-golden-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts/golden"), { recursive: true });
  for (const path of ["scripts/golden/capture.mjs", "scripts/golden/scenarios.mjs", "lib", "tests/golden"]) {
    await cp(join(source, path), join(root, path), { recursive: true });
  }
  await writeFile(join(root, "package.json"), '{"type":"module"}\n');
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "--quiet"]);
  git(["-c", "user.name=Golden Fixture", "-c", "user.email=golden@example.test", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "--quiet", "-m", "Synthetic baseline"]);
  return root;
}

function run(root, args = ["--check"]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/golden/capture.mjs", ...args], {
    cwd: root, encoding: "utf8", timeout: 15_000,
  });
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
}

function passes(result, pattern = /^PASS: 29 goldens match$/m) {
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, pattern);
}

function fails(result, pattern) {
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /FAIL:/);
  assert.match(result.output, pattern);
  assert.doesNotMatch(result.output, /^PASS:/m);
}

async function snapshot(root, directory = golden) {
  const files = {};
  for (const entry of (await readdir(join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = directory + entry.name;
    if (entry.isDirectory()) Object.assign(files, await snapshot(root, path + "/"));
    else files[path] = (await readFile(join(root, path))).toString("hex");
  }
  return files;
}

test("golden check passes on copied repository fixtures and writes nothing", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  passes(run(root));
  assert.deepEqual(await snapshot(root), before);
});

test("one changed byte fails and names the golden without modifying it", async (t) => {
  const root = await fixture(t);
  const path = join(root, selected);
  const bytes = await readFile(path);
  const index = bytes.indexOf(Buffer.from("$0"));
  assert.notEqual(index, -1);
  bytes[index + 1] = "1".charCodeAt(0);
  await writeFile(path, bytes);
  const before = await snapshot(root);
  fails(run(root), /Golden mismatch: domain\/money-format\.json/);
  assert.deepEqual(await snapshot(root), before);
});

test("missing golden fails with its path", async (t) => {
  const root = await fixture(t);
  await rm(join(root, selected));
  fails(run(root), /Missing golden: domain\/money-format\.json/);
});

for (const extra of ["extra.json", "nested/extra.txt"]) {
  test(`extra domain file ${extra} fails with its path`, async (t) => {
    const root = await fixture(t);
    await mkdir(join(root, golden, "domain/nested"), { recursive: true });
    await writeFile(join(root, golden, "domain", extra), "extra\n");
    fails(run(root), new RegExp(`Extra golden: domain/${extra.replaceAll(".", "\\.")}`));
  });
}

test("capture removes obsolete JSON goldens and refreshes the manifest", async (t) => {
  const root = await fixture(t);
  const obsolete = join(root, golden, "domain/obsolete.json");
  await writeFile(obsolete, "{}\n");
  const result = run(root, []);
  passes(result, /^Captured 29 goldens$/m);
  assert.match(result.output, /^removed obsolete golden: domain\/obsolete\.json$/m);
  await assert.rejects(lstat(obsolete), { code: "ENOENT" });
  assert.doesNotMatch(await readFile(join(root, golden, "MANIFEST.sha256"), "utf8"), /obsolete\.json/);
  passes(run(root));
});

test("capture preserves non-JSON files, nested files, directories, and symlinks", async (t) => {
  const root = await fixture(t);
  const domain = join(root, golden, "domain");
  await writeFile(join(domain, "obsolete.json"), "{}\n");
  await writeFile(join(domain, "notes.txt"), "notes\n");
  await mkdir(join(domain, "sub"));
  await writeFile(join(domain, "sub/x.json"), "nested\n");
  await mkdir(join(domain, "directory.json"));
  const target = join(root, "outside.json");
  await writeFile(target, "outside\n");
  await symlink(target, join(domain, "linked.json"));
  const result = run(root, []);
  passes(result, /^Captured 29 goldens$/m);
  assert.match(result.output, /^removed obsolete golden: domain\/obsolete\.json$/m);
  assert.equal(await readFile(join(domain, "notes.txt"), "utf8"), "notes\n");
  assert.equal(await readFile(join(domain, "sub/x.json"), "utf8"), "nested\n");
  assert.ok((await lstat(join(domain, "directory.json"))).isDirectory());
  assert.ok((await lstat(join(domain, "linked.json"))).isSymbolicLink());
  assert.equal(await readFile(target, "utf8"), "outside\n");
  assert.doesNotMatch(result.output, /removed obsolete golden: domain\/(?:notes|sub|directory|linked)/);
  await rm(join(domain, "linked.json"));
  fails(run(root), /Extra golden: domain\/notes\.txt/);
  await rm(join(domain, "notes.txt"));
  fails(run(root), /Extra golden: domain\/sub\/x\.json/);
});

test("manifest hash mismatch fails", async (t) => {
  const root = await fixture(t);
  const path = join(root, golden, "MANIFEST.sha256");
  const text = await readFile(path, "utf8");
  await writeFile(path, (text[0] === "0" ? "1" : "0") + text.slice(1));
  fails(run(root), /MANIFEST\.sha256 does not match/);
});

for (const name of ["MANIFEST.sha256", "BASELINE"]) {
  test(`missing ${name} fails`, async (t) => {
    const root = await fixture(t);
    await rm(join(root, golden, name));
    fails(run(root), new RegExp(`Cannot read ${name.replaceAll(".", "\\.")}`));
  });
}

for (const [label, value] of [["extra newline", "a".repeat(40) + "\n\n"], ["short", "abc\n"], ["nonhex", "g".repeat(40) + "\n"], ["trailing data", "a".repeat(40) + "\nextra\n"]]) {
  test(`malformed BASELINE (${label}) fails`, async (t) => {
    const root = await fixture(t);
    await writeFile(join(root, golden, "BASELINE"), value);
    fails(run(root), /Malformed BASELINE/);
  });
}

test("capture on clean copy writes the HEAD, passes check, and repeats byte-identically", async (t) => {
  const root = await fixture(t);
  await rm(join(root, golden), { recursive: true });
  passes(run(root, []), /^Captured 29 goldens$/m);
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  assert.equal(head.status, 0, head.stderr);
  assert.equal(await readFile(join(root, golden, "BASELINE"), "utf8"), head.stdout);
  const first = await snapshot(root);
  passes(run(root));
  passes(run(root, []), /^Captured 29 goldens$/m);
  assert.deepEqual(await snapshot(root), first);
  passes(run(root));
});

test("planted express shipping change fails naming the scenario", async (t) => {
  const root = await fixture(t);
  const path = join(root, "lib/store.ts");
  const original = await readFile(path, "utf8");
  const changed = original.replace('state.delivery === "express" ? 1200 : 0', 'state.delivery === "express" ? 1300 : 0');
  assert.notEqual(changed, original);
  await writeFile(path, changed);
  fails(run(root), /Golden mismatch: domain\/cents-100-10\.json/);
});

test("help succeeds and unknown arguments fail without writing fixtures", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  passes(run(root, ["--help"]), /Usage:.*capture\.mjs/);
  fails(run(root, ["--unknown"]), /Unknown arguments/);
  fails(run(root, ["--check", "--help"]), /Unknown arguments/);
  assert.deepEqual(await snapshot(root), before);
});
