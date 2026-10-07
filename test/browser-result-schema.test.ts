import test from "node:test";
import assert from "node:assert/strict";
import { BrowserMissionResultSchema } from "../src/browser-schemas.js";

const base = {
  ok: true,
  status: "PASS",
  objective: "Verify a mission",
  acceptanceCriteria: ["The expected text appears"],
  finalUrl: "https://example.com/",
  title: "Example",
  evidence: [],
  findings: [],
  diagnosis: { summary: "Mission completed", confidence: "high", nextAction: "Review evidence against acceptance criteria" },
  budget: { maxDurationMs: 10000, maxInteractions: 10, interactionsUsed: 2, durationMs: 500 }
};

test("browser result schema accepts a passing mission with structured outcome", () => {
  assert.equal(BrowserMissionResultSchema.safeParse(base).success, true);
});

test("browser result schema accepts FAIL, BLOCKED and UNPROVEN outcomes", () => {
  for (const status of ["FAIL", "BLOCKED", "UNPROVEN"]) {
    assert.equal(BrowserMissionResultSchema.safeParse({ ...base, status }).success, true);
  }
});

test("browser result schema accepts multiple screenshot evidence items without a product-level evidence-count ceiling", () => {
  const result = BrowserMissionResultSchema.safeParse({
    ...base,
    evidence: Array.from({ length: 20 }, () => ({
      type: "screenshot",
      url: "https://example.com/",
      mimeType: "image/jpeg",
      data: "aGVsbG8="
    }))
  });
  assert.equal(result.success, true);
});

test("browser result schema rejects unexpected evidence fields", () => {
  const result = BrowserMissionResultSchema.safeParse({
    ...base,
    evidence: [{ type: "screenshot", url: "https://example.com/", mimeType: "image/png", data: "aGVsbG8=" }]
  });
  assert.equal(result.success, false);
});
