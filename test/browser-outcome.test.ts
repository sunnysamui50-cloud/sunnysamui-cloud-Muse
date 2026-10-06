import test from "node:test";
import assert from "node:assert/strict";
import { PlaywrightBrowserExecutor } from "../src/browser-executor.js";
import { BrowserMissionSchema } from "../src/browser-schemas.js";

test("failed browser assertion is a mission FAIL, not a transport error", { skip: process.env.MUSE_BROWSER_TEST !== "1" }, async () => {
  const mission = BrowserMissionSchema.parse({
    objective: "Verify a known false assertion",
    acceptanceCriteria: ["Impossible content appears"],
    maxDurationMs: 30000,
    maxInteractions: 3,
    steps: [
      { type: "navigate", url: "https://example.com/" },
      { type: "assert", textContains: "this text definitely cannot be present" },
      { type: "snapshot" }
    ]
  });
  const result = await new PlaywrightBrowserExecutor().run(mission);
  assert.equal(result.status, "FAIL");
  assert.equal(result.findings[0]?.kind, "assertion");
  assert.equal(result.findings[0]?.stepIndex, 1);
  assert.ok(result.evidence.some((item) => item.type === "snapshot"));
});

test("blocked browser target produces BLOCKED", { skip: process.env.MUSE_BROWSER_TEST !== "1" }, async () => {
  const mission = BrowserMissionSchema.parse({
    objective: "Verify internal targets are blocked",
    acceptanceCriteria: ["Internal navigation is blocked"],
    maxDurationMs: 10000,
    maxInteractions: 1,
    steps: [{ type: "navigate", url: "https://localhost/" }]
  });
  const result = await new PlaywrightBrowserExecutor().run(mission);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.findings[0]?.kind, "target_blocked");
});
