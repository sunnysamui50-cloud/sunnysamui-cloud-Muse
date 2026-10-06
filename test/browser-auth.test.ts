import test from "node:test";
import assert from "node:assert/strict";
import { getBrowserWorkerAuthorization } from "../src/browser-auth.js";

test("uses configured bearer authentication in bearer mode", async () => {
  assert.equal(await getBrowserWorkerAuthorization("bearer", "https://browser.example.com", "secret"), "Bearer secret");
});

test("uses Cloud Run metadata identity in IAM mode", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  try {
    globalThis.fetch = (async (input) => { requestUrl = String(input); return new Response("identity-token", { status: 200 }); }) as typeof fetch;
    assert.equal(await getBrowserWorkerAuthorization("iam", "https://browser.example.com"), "Bearer identity-token");
    assert.match(requestUrl, /metadata\\.google\\.internal/);
    assert.match(requestUrl, /audience=https%3A%2F%2Fbrowser\\.example\\.com/);
  } finally { globalThis.fetch = originalFetch; }
});