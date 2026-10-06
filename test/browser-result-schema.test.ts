import test from "node:test";
import assert from "node:assert/strict";
import { BrowserMissionResultSchema } from "../src/browser-schemas.js";

test("browser result schema accepts multiple screenshot evidence items without a product-level evidence-count ceiling", () => {
  const result = BrowserMissionResultSchema.safeParse({
    ok: true,
    finalUrl: "https://example.com/",
    title: "Example",
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
    ok: true,
    finalUrl: "https://example.com/",
    title: "Example",
    evidence: [{ type: "screenshot", url: "https://example.com/", mimeType: "image/png", data: "aGVsbG8=" }]
  });
  assert.equal(result.success, false);
});
