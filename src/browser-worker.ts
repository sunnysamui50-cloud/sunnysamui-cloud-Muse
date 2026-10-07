import express from "express";
import { randomUUID } from "node:crypto";
import { BrowserMissionSchema } from "./browser-schemas.js";
import { PlaywrightBrowserExecutor } from "./browser-executor.js";
import { isAuthorized } from "./auth.js";
import { audit, hashInput, runWithRequestId } from "./request-context.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));

const authMode = process.env.BROWSER_WORKER_AUTH_MODE ?? "bearer";
if (authMode !== "bearer" && authMode !== "iam") throw new Error("BROWSER_WORKER_AUTH_MODE must be bearer or iam");
const token = process.env.BROWSER_WORKER_TOKEN;
if (authMode === "bearer" && (!token || token.length < 32)) throw new Error("BROWSER_WORKER_TOKEN must be at least 32 characters in bearer mode");
const port = Number(process.env.PORT ?? 8080);
const executor = new PlaywrightBrowserExecutor();

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "muse-browser-worker" });
});

app.post("/v1/browser/missions", async (req, res) => {
  const requestId = typeof req.headers["x-request-id"] === "string"
    ? req.headers["x-request-id"] : randomUUID();

  runWithRequestId(requestId, async () => {
    if (authMode === "bearer" && !isAuthorized(req.headers, token!)) {
      audit("browser_request", { outcome: "unauthorized" });
      res.status(401).json({ error: "UNAUTHORIZED", message: "Missing or invalid bearer token" });
      return;
    }

    const parsed = BrowserMissionSchema.safeParse(req.body);
    if (!parsed.success) {
      audit("browser_request", { outcome: "invalid_input" });
      res.status(400).json({
        error: "INVALID_MISSION",
        message: "Browser mission failed validation",
        details: parsed.error.flatten()
      });
      return;
    }

    const started = Date.now();
    const controller = new AbortController();
    req.once("aborted", () => controller.abort());
    try {
      const result = await executor.run(parsed.data, controller.signal);
      audit("browser_request", {
        outcome: "success", inputHash: hashInput(parsed.data), latencyMs: Date.now() - started
      });
      res.status(200).json(result);
    } catch (error) {
      audit("browser_request", {
        outcome: "error", inputHash: hashInput(parsed.data), latencyMs: Date.now() - started
      });
      res.status(502).json({
        error: "BROWSER_MISSION_FAILED",
        message: error instanceof Error ? error.message : "Browser mission failed"
      });
    }
  }).catch((error) => {
    audit("browser_request", { outcome: "handler_error", error: error instanceof Error ? error.name : "unknown" });
    if (!res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR", message: "Browser worker request failed" });
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Endpoint not found" });
});

app.listen(port, "0.0.0.0", () => {
  audit("service_ready", { service: "muse-browser-worker", port });
});
