import test from "node:test";
import assert from "node:assert/strict";
import { PlaywrightBrowserExecutor } from "../src/browser-executor.js";
import { BrowserMissionSchema } from "../src/browser-schemas.js";

const runLive = process.env.MUSE_LIVE_BROWSER_E2E === "1";

test("REAL browser mission reaches an external site, types, clicks, reads and captures evidence", { skip: !runLive }, async () => {
  const mission = BrowserMissionSchema.parse({
    objective: "Verify external search works",
    acceptanceCriteria: ["Koh Samui appears in search evidence"],
    maxDurationMs: 45000,
    maxInteractions: 20,
    steps: [
      { type: "navigate", url: "https://en.wikipedia.org/wiki/Main_Page" },
      { type: "snapshot" },
      { type: "screenshot" },
      { type: "type", target: { selector: 'input[type="search"]:visible' }, text: "Koh Samui" },
      { type: "click", target: { selector: 'button:has-text("Search"):visible' } },
      { type: "wait", text: "Koh Samui", timeoutMs: 15000 },
      { type: "snapshot", maxChars: 12000 },
      { type: "assert", textContains: "Koh Samui" },
      { type: "screenshot" }
    ]
  });

  const result = await new PlaywrightBrowserExecutor().run(mission);
  assert.equal(result.ok, true);
  assert.equal(result.status, "PASS");
  const finalUrl = result.finalUrl;
  assert.ok(finalUrl);
  assert.match(finalUrl, /wikipedia\.org/);
  assert.ok(result.evidence.filter((item) => item.type === "screenshot").length === 2);
  const snapshots = result.evidence.filter((item) => item.type === "snapshot").map((item) => item.text).join("\n");
  assert.match(snapshots, /Koh Samui/i);
  for (const item of result.evidence.filter((item) => item.type === "screenshot")) {
    assert.match(item.data, /^[A-Za-z0-9+/]+=*$/);
    assert.ok(item.data.length > 1000);
  }
});
