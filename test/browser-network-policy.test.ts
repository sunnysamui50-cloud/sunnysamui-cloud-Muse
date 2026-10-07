import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpsUrl } from "../src/browser-executor.js";

for (const url of [
  "http://example.com",
  "https://127.0.0.1",
  "https://10.0.0.1",
  "https://100.64.0.1",
  "https://198.18.0.1",
  "https://[::1]",
  "https://metadata.google.internal"
]) {
  test("blocks unsafe browser URL: " + url, async () => {
    await assert.rejects(() => assertPublicHttpsUrl(url));
  });
}

test("accepts a syntactically public HTTPS hostname", async () => {
  const url = await assertPublicHttpsUrl("https://example.com");
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "example.com");
});
