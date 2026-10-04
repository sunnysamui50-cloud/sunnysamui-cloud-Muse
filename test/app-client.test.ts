import test from "node:test";
import assert from "node:assert/strict";
import { AppClient } from "../src/app-client.js";
import type { Config } from "../src/config.js";

const config: Config = {
  PORT: 3000,
  MCP_BEARER_TOKEN: "m".repeat(32),
  APP_API_BASE_URL: "https://api.example.com",
  APP_API_TOKEN: "app-secret",
  APP_API_TIMEOUT_MS: 1000
};

test("sends the application bearer token and parses JSON", async () => {
  const originalFetch = globalThis.fetch;
  let seenRequest: Request | undefined;

  globalThis.fetch = async (input, init) => {
    seenRequest = new Request(input, init);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const result = await new AppClient(config).getAppStatus();
    assert.deepEqual(result, { ok: true });
    assert.equal(seenRequest?.headers.get("authorization"), "Bearer app-secret");
    assert.equal(seenRequest?.url, "https://api.example.com/v1/status");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not expose upstream 5xx response details", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        message: "database password=super-secret internal stack trace"
      }),
      { status: 500 }
    );

  try {
    await assert.rejects(
      () => new AppClient(config).getAppStatus(),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, "Application API returned a server error");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
