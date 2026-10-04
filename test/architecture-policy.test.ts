import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Muse remains stateless with no database or shell dependency", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  assert.equal(Object.keys(deps).some((name) => /firebase|firestore|google-cloud.*storage/i.test(name)), false);
  const source = await readFile("src/browser-executor.ts", "utf8");
  assert.equal(/child_process|\beval\s*\(|new Function\s*\(/.test(source), false);
});

test("Cloud Run policy keeps browser execution bounded and scale-to-zero", async () => {
  const workflow = await readFile(".github/workflows/deploy-cloud-run.yml", "utf8");
  assert.match(workflow, /BROWSER_SERVICE: muse-browser-worker/);
  assert.match(workflow, /--min 0 --max 2/);
  assert.match(workflow, /--memory 1Gi/);
  assert.match(workflow, /--concurrency 1/);
  assert.match(workflow, /--timeout 120s/);
  assert.match(workflow, /MUSE_SERVICE: muse-mcp/);
  assert.match(workflow, /--memory 512Mi/);
  assert.match(workflow, /--concurrency 40/);
});
