import test from "node:test";
import assert from "node:assert/strict";
import { PlaywrightBrowserExecutor } from "../src/browser-executor.js";
import { BrowserMissionSchema } from "../src/browser-schemas.js";

test("browser executor enforces the hard mission deadline", { skip: process.env.MUSE_BROWSER_TEST !== "1" }, async () => {
  const mission = BrowserMissionSchema.parse({
    maxDurationMs: 5000,
    steps: [{ type: "wait", milliseconds: 10000 }]
  });
  const started = Date.now();
  try { await new PlaywrightBrowserExecutor().run(mission); assert.fail("mission unexpectedly succeeded"); } catch (error) { assert.match(error instanceof Error ? error.message : String(error), /hard deadline/i); }
  assert.ok(Date.now() - started < 8000, "deadline must terminate the mission promptly");
});

test("browser executor honours caller cancellation", { skip: process.env.MUSE_BROWSER_TEST !== "1" }, async () => {
  const controller = new AbortController();
  const mission = BrowserMissionSchema.parse({
    maxDurationMs: 30000,
    steps: [{ type: "wait", milliseconds: 10000 }]
  });
  setTimeout(() => controller.abort(), 100);
  const started = Date.now();
  try { await new PlaywrightBrowserExecutor().run(mission, controller.signal); assert.fail("mission unexpectedly succeeded"); } catch (error) { assert.match(error instanceof Error ? error.message : String(error), /cancelled/i); }
  assert.ok(Date.now() - started < 3000, "caller cancellation must terminate promptly");
});
