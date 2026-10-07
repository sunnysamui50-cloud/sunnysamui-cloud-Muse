import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpsUrl } from "../src/browser-executor.js";
import { BrowserMissionSchema } from "../src/browser-schemas.js";

test("browser missions reject unsafe input but accept large caller-budgeted missions", () => {
  assert.equal(BrowserMissionSchema.safeParse({
    objective: "Test the application login flow",
    acceptanceCriteria: ["Login reaches the authenticated landing page"],
    steps: [{ type: "navigate", url: "http://example.com" }],
    maxDurationMs: 60000,
    maxInteractions: 100
  }).success, false);

  const largeMission = BrowserMissionSchema.safeParse({
    objective: "Exercise a large end-to-end workflow",
    acceptanceCriteria: ["The workflow completes successfully"],
    instructions: "Investigate failures and capture evidence.",
    plan: { summary: "Large workflow test", phases: [{ name: "startup", purpose: "Reach the application" }] },
    steps: [
      ...Array.from({ length: 20 }, () => ({ type: "wait", milliseconds: 100 })),
      ...Array.from({ length: 4 }, () => ({ type: "screenshot" }))
    ],
    maxDurationMs: 300000,
    maxInteractions: 500
  });
  assert.equal(largeMission.success, true);
});

test("browser mission requires explicit execution budgets", () => {
  assert.equal(BrowserMissionSchema.safeParse({
    steps: [{ type: "wait", milliseconds: 100 }]
  }).success, false);

  const mission = BrowserMissionSchema.parse({
    objective: "Verify the application entry point",
    acceptanceCriteria: ["The page identifies itself as Wikipedia"],
    steps: [
      { type: "navigate", url: "https://www.wikipedia.org/" },
      { type: "snapshot" },
      { type: "screenshot" },
      { type: "assert", criterionIndex: 0, titleContains: "Wikipedia" }
    ],
    maxDurationMs: 60000,
    maxInteractions: 20
  });
  assert.equal(mission.maxDurationMs, 60000);
  assert.equal(mission.maxInteractions, 20);
  assert.equal(mission.maxInteractions, 20);
});

test("browser target policy blocks credentialed, non-443, and IPv6 private targets", async () => {
  await assert.rejects(() => assertPublicHttpsUrl("https://user:password@example.com/"), /credentials/);
  await assert.rejects(() => assertPublicHttpsUrl("https://example.com:8443/"), /port 443/);
  await assert.rejects(() => assertPublicHttpsUrl("https://[::1]/"), /private IP/);
  await assert.rejects(() => assertPublicHttpsUrl("https://[::ffff:127.0.0.1]/"), /private IP/);
});
