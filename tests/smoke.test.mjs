import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
