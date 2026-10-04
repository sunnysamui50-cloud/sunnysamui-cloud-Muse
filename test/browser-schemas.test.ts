import test from "node:test";
import assert from "node:assert/strict";
import { BrowserMissionSchema } from "../src/browser-schemas.js";

test("browser missions reject unsafe and oversized input", () => {
  assert.equal(BrowserMissionSchema.safeParse({ steps: [{ type: "navigate", url: "http://example.com" }] }).success, false);
  assert.equal(BrowserMissionSchema.safeParse({ steps: Array.from({ length: 13 }, () => ({ type: "wait", milliseconds: 100 })) }).success, false);
  assert.equal(BrowserMissionSchema.safeParse({ steps: [{ type: "screenshot" }, { type: "screenshot" }, { type: "screenshot" }, { type: "screenshot" }] }).success, false);
});

test("browser mission applies bounded defaults", () => {
  const mission = BrowserMissionSchema.parse({
    steps: [
      { type: "navigate", url: "https://www.wikipedia.org/" },
      { type: "snapshot" },
      { type: "screenshot" },
      { type: "click", target: { role: "button", name: "Search" } },
      { type: "type", target: { placeholder: "Search Wikipedia" }, text: "Koh Samui", submit: true },
      { type: "wait", text: "Koh Samui" }
    ]
  });
  assert.equal(mission.maxDurationMs, 60000);
});
