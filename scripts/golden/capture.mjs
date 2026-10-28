import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { scenarios } from "./scenarios.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const goldenRoot = new URL("../../tests/golden/", import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => JSON.stringify(value, null, 2) + "\n";

async function read(path) {
  try { return await readFile(new URL(path, goldenRoot)); }
  catch (error) { throw new Error(`Cannot read ${path}: ${error.message}`); }
}

async function inventory(directory = "domain/") {
  const files = [];
  for (const entry of await readdir(new URL(directory, goldenRoot), { withFileTypes: true })) {
    const path = directory + entry.name;
    if (entry.isDirectory()) files.push(...await inventory(path + "/"));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unexpected file type: ${path}`);
  }
  return files.sort();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node --experimental-strip-types scripts/golden/capture.mjs [--check|--help]\nWithout flags: capture domain goldens, manifest, and current Git HEAD.\n--check: compare without writing any files.");
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    throw new Error("Unknown arguments; use --help.");
  }
  const check = args[0] === "--check";
  const outputs = new Map();
  for (const { name, run } of scenarios) {
    const path = `domain/${name}.json`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || outputs.has(path)) {
      throw new Error(`Invalid or duplicate scenario name: ${name}`);
    }
    try { outputs.set(path, Buffer.from(serialize(run()))); }
    catch (error) { throw new Error(`Scenario ${name}: ${error.message}`); }
  }
  if (outputs.size === 0) throw new Error("No scenarios defined.");
  const paths = [...outputs.keys()].sort();
  if (check) {
    const actual = await inventory();
    for (const path of paths) if (!actual.includes(path)) throw new Error(`Missing golden: ${path}`);
    for (const path of actual) if (!outputs.has(path)) throw new Error(`Extra golden: ${path}`);
    const baseline = (await read("BASELINE")).toString("utf8");
    if (baseline.length > 41 || !/^[a-fA-F0-9]{40}\n?$/.test(baseline)) throw new Error("Malformed BASELINE: expected a 40-hex commit SHA.");
    const lines = [];
    for (const path of paths) {
      const bytes = await read(path);
      if (!bytes.equals(outputs.get(path))) throw new Error(`Golden mismatch: ${path}`);
      lines.push(`${hash(bytes)}  ${path}\n`);
    }
    if (!(await read("MANIFEST.sha256")).equals(Buffer.from(lines.join("")))) {
      throw new Error("MANIFEST.sha256 does not match golden file hashes and paths.");
    }
    console.log(`PASS: ${outputs.size} goldens match`);
    return;
  }
  const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[a-fA-F0-9]{40}$/.test(baseline)) throw new Error("Git HEAD is not a 40-hex commit SHA.");
  await mkdir(new URL("domain/", goldenRoot), { recursive: true });
  for (const [path, bytes] of outputs) await writeFile(new URL(path, goldenRoot), bytes);
  await writeFile(new URL("MANIFEST.sha256", goldenRoot), paths.map((path) => `${hash(outputs.get(path))}  ${path}\n`).join(""));
  await writeFile(new URL("BASELINE", goldenRoot), baseline + "\n");
  console.log(`Captured ${outputs.size} goldens`);
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
