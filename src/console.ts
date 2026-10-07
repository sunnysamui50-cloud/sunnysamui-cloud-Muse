import type { IncomingMessage, ServerResponse } from "node:http";
import { BrowserMissionSchema, type BrowserMission, type BrowserStep } from "./browser-schemas.js";
import type { AppClient } from "./app-client.js";
import type { BrowserClient } from "./browser-client.js";
import { consoleHtml } from "./console-ui.js";

const MAX_BODY_BYTES = 1_500_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function phaseFor(step: BrowserStep): string {
  switch (step.type) {
    case "navigate": return "Open the target page";
    case "snapshot": return "Inspect the page";
    case "screenshot": return "Capture visual evidence";
    case "click": return "Interact with the page";
    case "type": return "Enter test data";
    case "wait": return "Wait for the expected state";
    case "assert": return "Verify an acceptance criterion";
  }
}

export function buildMissionPlan(mission: BrowserMission) {
  const phases: Array<{ name: string; purpose: string }> = [];
  const seen = new Set<string>();
  for (const step of mission.steps) {
    const name = phaseFor(step);
    if (!seen.has(name)) {
      seen.add(name);
      phases.push({ name, purpose: name + "." });
    }
  }
  return { summary: mission.objective, phases };
}

export function parseConsoleMission(targetUrl: string, missionText: string): BrowserMission {
  const url = new URL(targetUrl.trim());
  if (url.protocol !== "https:") throw new Error("Test URL must use HTTPS");

  let raw: unknown;
  try {
    raw = JSON.parse(missionText);
  } catch {
    throw new Error("The test instructions need to be a Muse mission JSON block. Ask ChatGPT to produce the mission, then paste it here.");
  }

  if (typeof raw !== "object" || raw === null) throw new Error("Mission must be a JSON object.");
  const candidate = { ...(raw as Record<string, unknown>) };
  const steps = Array.isArray(candidate.steps) ? [...candidate.steps] as Array<Record<string, unknown>> : [];

  // Accept the common generated "ms" shorthand and normalize it to the canonical schema field.
  for (const step of steps) {
    if (step && step.type === "wait" && step.milliseconds === undefined && typeof step.ms === "number") {
      step.milliseconds = step.ms;
      delete step.ms;
    }
  }

  const navigateIndex = steps.findIndex((step) => step && step.type === "navigate");
  if (navigateIndex >= 0) {
    steps[navigateIndex] = { ...steps[navigateIndex], url: url.toString() };
  } else {
    steps.unshift({ type: "navigate", url: url.toString() });
  }

  candidate.steps = steps;
  const parsed = BrowserMissionSchema.parse(candidate);
  if (!parsed.plan) return { ...parsed, plan: buildMissionPlan(parsed) };
  return parsed;
}

export async function runConsoleMission(
  mission: BrowserMission,
  _appClient: AppClient,
  browserClient: BrowserClient
): Promise<unknown> {
  return browserClient.runMission(mission);
}

export function handleConsoleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  appClient: AppClient,
  browserClient: BrowserClient
): void {
  const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "localhost"));

  if (url.pathname === "/" && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(consoleHtml);
    return;
  }

  if ((url.pathname === "/api/review" || url.pathname === "/api/run") && req.method === "POST") {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as { targetUrl?: string; mission?: string };
        if (!body.targetUrl || !body.mission) throw new Error("Test URL and mission are required.");
        const mission = parseConsoleMission(body.targetUrl, body.mission);

        if (url.pathname === "/api/review") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify({ mission, plan: mission.plan ?? buildMissionPlan(mission) }));
          return;
        }

        const report = await runConsoleMission(mission, appClient, browserClient);
        res.statusCode = 200;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(JSON.stringify(report));
      } catch (error) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Console request failed" }));
      }
    })();
    return;
  }
}
