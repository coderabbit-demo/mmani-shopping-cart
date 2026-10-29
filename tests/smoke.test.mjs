import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the scaffold declares exactly the approved dependencies", () => {
  assert.deepEqual(
    { dependencies: manifest.dependencies, devDependencies: manifest.devDependencies },
    {
      dependencies: {
        next: "^16.4.3",
        react: "^19.3.1",
        "react-dom": "^19.3.1",
        "lucide-react": "^1.63.0",
      },
      devDependencies: {
        "@playwright/test": "^1.64.1",
        "@types/node": "^26.6.5",
        "@types/react": "^19.3.0",
        "@types/react-dom": "^19.3.0",
        typescript: "^7.0.2",
      },
    },
  );
});

test("page test scripts use Playwright", () => {
  assert.equal(manifest.scripts["test:e2e"], "playwright test");
  assert.equal(manifest.scripts["golden:capture:pages"], "playwright test tests/e2e/pages.spec.ts --update-snapshots");
});

test("test subprocesses do not invoke bare npm", () => {
  const bareNpm = /\b(?:spawnSync|spawn|execFileSync|execFile)\s*\(\s*(["'])npm\1/;
  const directory = new URL("./", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".test.mjs"))) {
    const source = readFileSync(new URL(file, directory), "utf8").replace(bareNpm.source, "");
    assert.doesNotMatch(source, bareNpm, `${file} invokes bare npm`);
  }
});
