import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("rejects weak token and non-HTTPS upstream", () => {
  assert.throws(() => loadConfig({ PORT: "3000", MCP_BEARER_TOKEN: "short", APP_API_BASE_URL: "http://example.com", APP_API_TOKEN: "token" }));
});

test("accepts valid configuration and defaults timeout", () => {
  const config = loadConfig({ PORT: "3000", MCP_BEARER_TOKEN: "a".repeat(32), APP_API_BASE_URL: "https://example.com", APP_API_TOKEN: "token" });
  assert.equal(config.PORT, 3000);
  assert.equal(config.APP_API_TIMEOUT_MS, 10000);
  assert.equal(config.BROWSER_WORKER_URL, undefined);
  assert.equal(config.BROWSER_WORKER_AUTH_MODE, "bearer");
});

test("requires browser worker URL and token together in bearer mode", () => {
  assert.throws(() => loadConfig({ PORT: "3000", MCP_BEARER_TOKEN: "a".repeat(32), APP_API_BASE_URL: "https://example.com", APP_API_TOKEN: "token", BROWSER_WORKER_URL: "https://browser.example.com" }));
});

test("allows IAM browser worker authentication without a shared worker token", () => {
  const config = loadConfig({ PORT: "3000", MCP_BEARER_TOKEN: "a".repeat(32), APP_API_BASE_URL: "https://example.com", APP_API_TOKEN: "token", BROWSER_WORKER_URL: "https://browser.example.com", BROWSER_WORKER_AUTH_MODE: "iam" });
  assert.equal(config.BROWSER_WORKER_AUTH_MODE, "iam");
});