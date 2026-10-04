import express from "express";
import { BrowserMissionSchema } from "./browser-schemas.js";
import { PlaywrightBrowserExecutor } from "./browser-executor.js";
import { isAuthorized } from "./auth.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));

const token = process.env.BROWSER_WORKER_TOKEN;
if (!token || token.length < 32) throw new Error("BROWSER_WORKER_TOKEN must be at least 32 characters");

const port = Number(process.env.PORT ?? 8080);
const executor = new PlaywrightBrowserExecutor();

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, service: "muse-browser-worker" });
});

app.post("/v1/browser/missions", async (req, res) => {
  if (!isAuthorized(req.headers, token)) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Missing or invalid bearer token" });
    return;
  }

  const parsed = BrowserMissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "INVALID_MISSION",
      message: "Browser mission failed validation",
      details: parsed.error.flatten()
    });
    return;
  }

  try {
    const result = await executor.run(parsed.data);
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      error: "BROWSER_MISSION_FAILED",
      message: error instanceof Error ? error.message : "Browser mission failed"
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Endpoint not found" });
});

app.listen(port, "0.0.0.0", () => {
  console.error(JSON.stringify({ service: "muse-browser-worker", port }));
});
