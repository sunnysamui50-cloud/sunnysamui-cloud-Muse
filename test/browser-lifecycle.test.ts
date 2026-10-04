import test from "node:test";
import assert from "node:assert/strict";
import { PlaywrightBrowserExecutor } from "../src/browser-executor.js";
import { BrowserMissionSchema } from "../src/browser-schemas.js";

test("browser executor enforces the hard mission deadline", async () => {
  const mission = BrowserMissionSchema.parse({
    maxDurationMs: 5000,
    steps: [{ type: "wait", milliseconds: 10000 }]
  });
  const started = Date.now();
  await assert.rejects(() => new PlaywrightBrowserExecutor().run(mission), /hard deadline/i);
  assert.ok(Date.now() - started < 8000, "deadline must terminate the mission promptly");
});

test("browser executor honours caller cancellation", async () => {
  const controller = new AbortController();
  const mission = BrowserMissionSchema.parse({
    maxDurationMs: 30000,
    steps: [{ type: "wait", milliseconds: 10000 }]
  });
  setTimeout(() => controller.abort(), 100);
  const started = Date.now();
  await assert.rejects(() => new PlaywrightBrowserExecutor().run(mission, controller.signal), /cancelled/i);
  assert.ok(Date.now() - started < 3000, "caller cancellation must terminate promptly");
});
