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
    case "click":
    case "semanticClick":
    case "semanticClickMany": return "Interact with the page";
    case "type":
    case "semanticType": return "Enter test data";
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

function extractSearchQueries(instruction: string): string[] {
  const queries: string[] = [];
  const quoted = /(?:search|look up|find)(?:\s+for)?\s+[“"]([^”"]+)[”"]/gi;
  for (const match of instruction.matchAll(quoted)) {
    if (match[1]) queries.push(match[1].trim());
  }

  if (queries.length === 0) {
    const plain = /(?:search|look up|find)(?:\s+for)?\s+([A-Za-z0-9][^.!?
]{1,60}?)(?=\s+(?:and|then|after|before|while)\b|[.!?]|$)/gi;
    for (const match of instruction.matchAll(plain)) {
      const value = match[1]?.trim();
      if (value && value.length <= 60) queries.push(value);
    }
  }

  return [...new Set(queries)].slice(0, 5);
}

function compileNaturalLanguageMission(targetUrl: string, instruction: string): BrowserMission {
  const lower = instruction.toLowerCase();
  const steps: Array<Record<string, unknown>> = [
    { type: "navigate", url: targetUrl },
    { type: "snapshot" },
    { type: "screenshot" }
  ];

  const addObservation = () => {
    steps.push({ type: "wait", milliseconds: 500 });
    steps.push({ type: "snapshot" });
    steps.push({ type: "screenshot" });
  };

  if (/\b(login|log in|sign in|signin|authenticate)\b/i.test(instruction)) {
    steps.push({ type: "semanticClick", target: "log in|login|sign in|signin|authenticate" });
    addObservation();
  }

  const searchQueries = extractSearchQueries(instruction);
  if (/\b(search|look up|find)\b/i.test(instruction)) {
    if (searchQueries.length > 0) {
      for (const query of searchQueries) {
        steps.push({ type: "semanticType", target: "search", text: query, submit: true });
        addObservation();
      }
    } else {
      steps.push({ type: "semanticClick", target: "search" });
      addObservation();
    }
  }

  const songCount = lower.match(/\b(\d+|five|six|seven|eight|nine|ten)\s+(?:different\s+)?songs?\b/);
  if (songCount && searchQueries.length === 0) {
    const words: Record<string, number> = { five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const token = songCount[1] ?? "";
    const count = Number(token) || words[token] || 5;
    steps.push({ type: "semanticClickMany", target: "song|track|result", count: Math.min(count, 10) });
    addObservation();
  }

  if (/\b(discover|refresh|saved|library)\b/i.test(instruction)) {
    if (/\bdiscover\b/i.test(instruction)) {
      steps.push({ type: "semanticClick", target: "discover" });
      addObservation();
    }
    if (/\brefresh\b/i.test(instruction)) {
      steps.push({ type: "semanticClick", target: "refresh" });
      addObservation();
    }
    if (/\b(saved|library)\b/i.test(instruction)) {
      steps.push({ type: "semanticClick", target: "saved|library" });
      addObservation();
    }
  }

  if (/\b(free trial|trial|try for free)\b/i.test(instruction)) {
    steps.push({ type: "semanticClick", target: "start free trial|start trial|free trial|try for free" });
    addObservation();
  }

  // A natural-language mission may explicitly ask what happens at a limit/paywall.
  // Muse observes that state but deliberately does not click purchase/checkout controls.
  if (/\b(paywall|upgrade|subscribe|subscription|sixth|limit|purchase|buy)\b/i.test(instruction)) {
    steps.push({ type: "snapshot" });
    steps.push({ type: "screenshot" });
  }

  if (/\b(log ?out|sign out|logout)\b/i.test(instruction)) {
    steps.push({ type: "semanticClick", target: "log out|logout|sign out" });
    addObservation();
  }

  const criteria = [
    "The target page loads and remains reachable.",
    "Muse executes the requested natural-language workflow using bounded browser interactions.",
    "Muse records the resulting page states and visual evidence so the observed outcome can be assessed."
  ];

  return BrowserMissionSchema.parse({
    objective: instruction.trim(),
    instructions: instruction.trim(),
    acceptanceCriteria: criteria,
    steps,
    maxDurationMs: 120000,
    maxInteractions: 50,
    plan: undefined
  });
}

export function parseConsoleMission(targetUrl: string, missionText: string): BrowserMission {
  const url = new URL(targetUrl.trim());
  if (url.protocol !== "https:") throw new Error("Test URL must use HTTPS");

  const trimmed = missionText.trim();
  if (!trimmed) throw new Error("Describe what you want Muse to test.");

  // Keep the structured mission format as an internal/backward-compatible interface,
  // but the Console no longer requires users to author it.
  if (trimmed.startsWith("{")) {
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new Error("The test instructions are not valid JSON. Describe the test in plain English instead.");
    }

    if (typeof raw !== "object" || raw === null) throw new Error("Mission must be a JSON object.");
    const candidate = { ...(raw as Record<string, unknown>) };
    delete candidate.plan;
    const steps = Array.isArray(candidate.steps) ? [...candidate.steps] as Array<Record<string, unknown>> : [];

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

  return compileNaturalLanguageMission(url.toString(), trimmed);
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
