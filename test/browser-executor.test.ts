import test from "node:test";
import assert from "node:assert/strict";
import { BrowserMissionSchema } from "../src/browser-schemas.js";

test("browser mission permits bounded public HTTPS navigation", () => {
  assert.equal(BrowserMissionSchema.safeParse({
    steps: [{ type: "navigate", url: "https://example.com" }]
  }).success, true);
});

test("browser mission rejects non-HTTPS navigation", () => {
  assert.equal(BrowserMissionSchema.safeParse({
    steps: [{ type: "navigate", url: "http://example.com" }]
  }).success, false);
});

test("browser mission cannot exceed twelve steps", () => {
  assert.equal(BrowserMissionSchema.safeParse({
    steps: Array.from({ length: 13 }, () => ({ type: "wait", milliseconds: 100 }))
  }).success, false);
});

test("browser mission hard deadline remains bounded", () => {
  const parsed = BrowserMissionSchema.parse({
    steps: [{ type: "wait", milliseconds: 100 }],
    maxDurationMs: 5000
  });
  assert.equal(parsed.maxDurationMs, 5000);
  assert.ok(parsed.steps.length === 1);
});
