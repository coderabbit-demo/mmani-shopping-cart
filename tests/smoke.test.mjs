import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("test:e2e is a successful placeholder until PR 3", () => {
  assert.doesNotMatch(manifest.scripts["test:e2e"], /\bplaywright\b/);
  assert.doesNotMatch(manifest.scripts["test:e2e"], /\bbuild\b/);

  const result = spawnSync("npm", ["run", "-s", "test:e2e"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "no e2e tests yet (Playwright arrives in PR 3)\n");
});
