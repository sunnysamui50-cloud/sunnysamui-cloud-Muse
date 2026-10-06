import test from "node:test";
import assert from "node:assert/strict";
import { BrowserMissionSchema } from "../src/browser-schemas.js";

test("browser mission permits bounded public HTTPS navigation", () => {
  assert.equal(BrowserMissionSchema.safeParse({
    objective: "Reach the public test page",
    acceptanceCriteria: ["The page loads"],
    steps: [{ type: "navigate", url: "https://example.com" }],
    maxDurationMs: 10000,
    maxInteractions: 5
  }).success, true);
});

test("browser mission rejects non-HTTPS navigation", () => {
  assert.equal(BrowserMissionSchema.safeParse({
    steps: [{ type: "navigate", url: "http://example.com" }]
  }).success, false);
});

test("browser mission permits large caller-budgeted missions", () => {
  const result = BrowserMissionSchema.safeParse({
    objective: "Exercise a long workflow",
    acceptanceCriteria: ["The workflow completes"],
    steps: Array.from({ length: 20 }, () => ({ type: "wait", milliseconds: 100 })),
    maxDurationMs: 60000,
    maxInteractions: 50
  });
  assert.equal(result.success, true);
});

test("browser mission hard deadline remains bounded", () => {
  const parsed = BrowserMissionSchema.parse({
    objective: "Verify bounded execution",
    acceptanceCriteria: ["The wait completes"],
    steps: [{ type: "wait", milliseconds: 100 }],
    maxDurationMs: 5000,
    maxInteractions: 5
  });
  assert.equal(parsed.maxDurationMs, 5000);
  assert.ok(parsed.steps.length === 1);
});
