import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import type { BrowserMission, BrowserStep, BrowserMissionResult, BrowserEvidence, BrowserFinding } from "./browser-schemas.js";
import { diagnoseBrowserMission } from "./mission-diagnosis.js";

const MAX_SCREENSHOT_BYTES = 1_500_000;
const DNS_LOOKUP_TIMEOUT_MS = 2000;

export type { BrowserEvidence };

export interface BrowserExecutor {
  run(mission: BrowserMission, signal?: AbortSignal): Promise<BrowserMissionResult>;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts as [number, number];
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && b >= 18 && b <= 19);
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  if (isIP(ip) === 6) {
    const normalized = ip.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mappedIpv4 && isPrivateIpv4(mappedIpv4[1]!)) return true;
    if (normalized.startsWith("::ffff:")) {
      const tail = normalized.slice("::ffff:".length);
      const groups = tail.split(":");
      if (groups.length === 2 && groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
        const high = Number.parseInt(groups[0]!, 16);
        const low = Number.parseInt(groups[1]!, 16);
        const dotted = [
          high >> 8,
          high & 255,
          low >> 8,
          low & 255
        ].join(".");
        if (isPrivateIpv4(dotted)) return true;
      }
    }
    return normalized === "::1" || normalized === "::" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb") ||
      normalized.startsWith("ff");
  }
  return false;
}

async function assertPublicNetworkUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "wss:") throw new Error("Browser network access is restricted to HTTPS/WSS");
  if (url.username || url.password) throw new Error("Browser network URLs must not contain credentials");
  if (url.port && url.port !== "443") throw new Error("Browser network access is restricted to port 443");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (hostname === "localhost" || hostname === "metadata.google.internal" || hostname.endsWith(".internal") || hostname === "host.docker.internal") {
    throw new Error("Browser network access to internal hosts is blocked");
  }
  if (isIP(hostname) && isPrivateIp(hostname)) throw new Error("Browser network access to private IP addresses is blocked");
  if (!isIP(hostname)) {
    const addresses = await Promise.race([
      dns.lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Browser DNS lookup timed out")), DNS_LOOKUP_TIMEOUT_MS))
    ]);
    if (addresses.some(({ address }) => isPrivateIp(address))) throw new Error("Browser network access to a host resolving to a private IP is blocked");
  }
  return url;
}

export async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  const url = await assertPublicNetworkUrl(rawUrl);
  if (url.protocol !== "https:") throw new Error("Browser navigation is restricted to HTTPS");
  return url;
}

function getTarget(page: Page, target: { role?: string | undefined; name?: string | undefined; text?: string | undefined; selector?: string | undefined }) {
  if (target.selector) return page.locator(target.selector);
  if (target.name) return target.role
    ? page.getByRole(target.role as Parameters<Page["getByRole"]>[0], { name: target.name })
    : page.getByText(target.name, { exact: true });
  return page.getByText(target.text!, { exact: true });
}

function semanticPattern(target: string): RegExp {
  const alternatives = target.split("|").map((part) => part.trim()).filter(Boolean);
  const escaped = alternatives.map((part) => part.replace(/[.*+?^$(){}[\\]\\\\]/g, "\\\\async function executeStep(page: Page, step: BrowserStep, evidence: BrowserEvidence[], provenCriteria: Set<number>): Promise<Page> {").replace(/\\s+/g, "\\\\s+"));
  return new RegExp(escaped.length ? escaped.join("|") : target, "i");
}

function semanticCandidates(page: Page, target: string) {
  const pattern = semanticPattern(target);
  return page.locator('button, a, [role="button"], input[type="button"], input[type="submit"], summary').filter({ hasText: pattern });
}

async function semanticClick(page: Page, target: string, timeout: number): Promise<void> {
  const candidates = semanticCandidates(page, target);
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout });
      return;
    }
  }

  const textCandidate = page.getByText(semanticPattern(target)).first();
  if (await textCandidate.isVisible().catch(() => false)) {
    await textCandidate.click({ timeout });
    return;
  }

  throw new Error(`Could not find a visible control matching "${target}".`);
}

async function semanticClickMany(page: Page, target: string, count: number, timeout: number, evidence: BrowserEvidence[]): Promise<void> {
  const candidates = semanticCandidates(page, target);
  let clicked = 0;
  for (let index = 0; index < await candidates.count() && clicked < count; index += 1) {
    const candidate = candidates.nth(index);
    if (!await candidate.isVisible().catch(() => false)) continue;
    await candidate.click({ timeout });
    clicked += 1;
    evidence.push({ type: "action", action: `semanticClick:${target}:${clicked}`, url: page.url() });
  }

  if (clicked === 0 && /song|result|item/i.test(target)) {
    const fallback = page.locator('main a, main button, [role="main"] a, [role="main"] button');
    for (let index = 0; index < await fallback.count() && clicked < count; index += 1) {
      const candidate = fallback.nth(index);
      const text = (await candidate.innerText().catch(() => "")).trim();
      if (!text || /^(search|discover|saved|refresh|logout|log out|sign in|login|menu)$/i.test(text)) continue;
      if (!await candidate.isVisible().catch(() => false)) continue;
      await candidate.click({ timeout });
      clicked += 1;
      evidence.push({ type: "action", action: `semanticClickFallback:${clicked}`, url: page.url() });
    }
  }

  if (clicked < count) throw new Error(`Could only complete ${clicked} of ${count} semantic clicks for "${target}".`);
}

async function semanticType(page: Page, target: string, text: string, submit: boolean, timeout: number): Promise<void> {
  const pattern = semanticPattern(target);
  const candidates = [
    page.getByRole("textbox", { name: pattern }),
    page.getByPlaceholder(pattern),
    page.getByLabel(pattern)
  ];

  for (const candidate of candidates) {
    if (await candidate.count() && await candidate.first().isVisible().catch(() => false)) {
      await candidate.first().fill(text, { timeout });
      if (submit) await candidate.first().press("Enter", { timeout });
      return;
    }
  }

  if (/search/i.test(target)) {
    const firstTextbox = page.getByRole("textbox").first();
    if (await firstTextbox.isVisible().catch(() => false)) {
      await firstTextbox.fill(text, { timeout });
      if (submit) await firstTextbox.press("Enter", { timeout });
      return;
    }
  }

  throw new Error(`Could not find a visible textbox matching "${target}".`);
}

async function executeStep(page: Page, step: BrowserStep, evidence: BrowserEvidence[], provenCriteria: Set<number>): Promise<Page> {
  const timeout = step.timeoutMs ?? 10000;
  page.setDefaultTimeout(timeout);
  switch (step.type) {
    case "navigate":
      await assertPublicHttpsUrl(step.url);
      await page.goto(step.url, { waitUntil: "domcontentloaded", timeout });
      evidence.push({ type: "navigation", url: page.url(), title: await page.title() });
      return page;
    case "snapshot":
      evidence.push({ type: "snapshot", url: page.url(), text: (await page.locator("body").innerText({ timeout })).slice(0, step.maxChars) });
      return page;
    case "screenshot": {
      const buffer = await page.screenshot({ type: "jpeg", quality: 60, fullPage: step.fullPage, timeout });
      if (buffer.byteLength > MAX_SCREENSHOT_BYTES) throw new Error("Screenshot exceeds the 1.5 MB evidence limit");
      evidence.push({ type: "screenshot", url: page.url(), mimeType: "image/jpeg", data: buffer.toString("base64") });
      return page;
    }
    case "semanticClick":
      await semanticClick(page, step.target, timeout);
      evidence.push({ type: "action", action: "semanticClick:" + step.target, url: page.url() });
      return page;
    case "semanticClickMany":
      await semanticClickMany(page, step.target, step.count, timeout, evidence);
      return page;
    case "semanticType":
      await semanticType(page, step.target, step.text, step.submit, timeout);
      evidence.push({ type: "action", action: "semanticType:" + step.target, url: page.url() });
      return page;
    case "click": {
      const locator = getTarget(page, step.target);
      await locator.first().click({ timeout });
      evidence.push({ type: "action", action: "click:" + (step.target.name ?? step.target.text ?? step.target.selector), url: page.url() });
      return page;
    }
    case "type": {
      const locator = step.target.selector ? page.locator(step.target.selector)
        : step.target.label ? page.getByLabel(step.target.label)
        : step.target.placeholder ? page.getByPlaceholder(step.target.placeholder)
        : step.target.name ? page.getByRole("textbox", { name: step.target.name }) : page.getByRole("textbox").first();
      await locator.fill(step.text, { timeout });
      if (step.submit) await locator.press("Enter", { timeout });
      evidence.push({ type: "action", action: "type", url: page.url() });
      return page;
    }
    case "wait":
      if (step.text) await page.getByText(step.text, { exact: false }).first().waitFor({ state: "visible", timeout });
      else await new Promise((resolve) => setTimeout(resolve, step.milliseconds));
      evidence.push({ type: "action", action: "wait", url: page.url() });
      return page;
    case "assert": {
      const failures: string[] = [];
      if (step.urlContains && !page.url().includes(step.urlContains)) failures.push(`url does not contain "${step.urlContains}"`);
      if (step.titleContains && !(await page.title()).includes(step.titleContains)) failures.push(`title does not contain "${step.titleContains}"`);
      if (step.textContains && !(await page.locator("body").innerText({ timeout })).includes(step.textContains)) failures.push(`page text does not contain "${step.textContains}"`);
      if (failures.length) throw new Error(`Browser assertion failed: ${failures.join("; ")}`);
      provenCriteria.add(step.criterionIndex);
      evidence.push({ type: "action", action: `assert[criterion:${step.criterionIndex}]:` + [step.urlContains, step.titleContains, step.textContains].filter(Boolean).join("|"), url: page.url() });
      return page;
    }
  }
}

function classifyFailure(error: unknown): { status: "BLOCKED" | "UNPROVEN"; finding: BrowserFinding } {
  const message = error instanceof Error ? error.message : "Browser mission failed";
  if (/hard deadline|timed out|timeout/i.test(message)) {
    return { status: "UNPROVEN", finding: { severity: "error", kind: "timeout", message } };
  }
  if (/interaction budget/i.test(message)) {
    return { status: "UNPROVEN", finding: { severity: "error", kind: "interaction_budget", message } };
  }
  if (/cancelled/i.test(message)) {
    return { status: "UNPROVEN", finding: { severity: "warning", kind: "cancelled", message } };
  }
  if (/restricted|blocked|private IP|credentials/i.test(message)) {
    return { status: "BLOCKED", finding: { severity: "error", kind: "target_blocked", message } };
  }
  return { status: "BLOCKED", finding: { severity: "error", kind: "browser", message } };
}

export class PlaywrightBrowserExecutor implements BrowserExecutor {
  async run(mission: BrowserMission, signal?: AbortSignal): Promise<BrowserMissionResult> {
    const started = Date.now();
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let rejectDeadline: ((error: Error) => void) | undefined;
    let expired = false;
    let cancelled = false;
    const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
    deadline.catch(() => undefined);
    const abortHandler = () => { cancelled = true; rejectDeadline?.(new Error("Browser mission cancelled")); };
    const evidence: BrowserEvidence[] = [];
    const findings: BrowserFinding[] = [];
    let interactionsUsed = 0;
    let status: BrowserMissionResult["status"] = "PASS";
    let exhausted: "time" | "interactions" | undefined;
    const provenCriteria = new Set<number>();

    try {
      if (signal?.aborted) throw new Error("Browser mission cancelled");
      deadlineTimer = setTimeout(() => { expired = true; rejectDeadline?.(new Error("Browser mission exceeded its hard deadline")); }, mission.maxDurationMs);
      signal?.addEventListener("abort", abortHandler, { once: true });
      browser = await chromium.launch({ headless: true, chromiumSandbox: typeof process.getuid === "function" ? process.getuid() !== 0 : true });
      context = await browser.newContext({ serviceWorkers: "block", ignoreHTTPSErrors: false, viewport: { width: 1440, height: 900 } });
      await context.route("**/*", async (route) => {
        try { await assertPublicNetworkUrl(route.request().url()); await route.continue(); }
        catch { await route.abort("blockedbyclient"); }
      });
      await context.routeWebSocket("**/*", async (webSocket) => {
        try {
          await assertPublicNetworkUrl(webSocket.url());
          await webSocket.connectToServer();
        } catch {
          await webSocket.close({ code: 1008, reason: "Blocked by Muse network policy" });
        }
      });
      const page = await context.newPage();

      for (let index = 0; index < mission.steps.length; index += 1) {
        const step = mission.steps[index]!;
        if (expired) { exhausted = "time"; status = "UNPROVEN"; findings.push({ severity: "error", kind: "timeout", message: "Browser mission exceeded its hard deadline", stepIndex: index }); break; }
        if (interactionsUsed >= mission.maxInteractions) {
          exhausted = "interactions";
          status = "UNPROVEN";
          findings.push({ severity: "error", kind: "interaction_budget", message: "Browser mission exceeded its interaction budget", stepIndex: index });
          break;
        }
        interactionsUsed += 1;
        try {
          await Promise.race([executeStep(page, step, evidence, provenCriteria), deadline]);
        } catch (error) {
          if (expired) {
            exhausted = "time"; status = "UNPROVEN";
            findings.push({ severity: "error", kind: "timeout", message: "Browser mission exceeded its hard deadline", stepIndex: index });
            break;
          }
          if (cancelled) {
            status = "UNPROVEN";
            findings.push({ severity: "warning", kind: "cancelled", message: "Browser mission cancelled", stepIndex: index });
            break;
          }
          if (step.type === "assert" && error instanceof Error && /^Browser assertion failed:/.test(error.message)) {
            status = "FAIL";
            findings.push({ severity: "error", kind: "assertion", message: error.message.replace(/^Browser assertion failed:\s*/, ""), stepIndex: index });
            continue;
          }
          const classified = classifyFailure(error);
          status = classified.status;
          findings.push({ ...classified.finding, stepIndex: index });
          break;
        }
      }

      const finalUrl = page.url();
      const title = await page.title();
      const assertionCount = mission.steps.filter((step) => step.type === "assert").length;
      const missingCriteria = mission.acceptanceCriteria.map((_, index) => index).filter((index) => !provenCriteria.has(index));
      if (status === "PASS" && findings.length === 0 && (assertionCount === 0 || missingCriteria.length > 0)) {
        status = "UNPROVEN";
        findings.push({
          severity: "warning",
          kind: "unverified",
          message: assertionCount === 0
            ? "Mission completed without an executable browser assertion; acceptance criteria are not machine-verified."
            : `Mission completed with ${missingCriteria.length} acceptance criteria not covered by successful executable assertions: ${missingCriteria.join(", ")}.`,
          recommendedAction: "Add explicit assert steps mapped to every acceptance criterion and rerun the mission."
        });
      }
      const diagnosis = diagnoseBrowserMission(status, findings);
      return {
        ok: true,
        status,
        objective: mission.objective,
        acceptanceCriteria: mission.acceptanceCriteria,
        finalUrl,
        title,
        evidence,
        findings,
        diagnosis,
        budget: {
          maxDurationMs: mission.maxDurationMs,
          maxInteractions: mission.maxInteractions,
          interactionsUsed,
          durationMs: Date.now() - started,
          ...(exhausted ? { exhausted } : {})
        }
      };
    } catch (error) {
      const classified = classifyFailure(error);
      findings.push(classified.finding);
      const diagnosis = diagnoseBrowserMission(classified.status, findings);
      return {
        ok: true,
        status: classified.status,
        objective: mission.objective,
        acceptanceCriteria: mission.acceptanceCriteria,
        finalUrl: null,
        title: "Mission did not reach a browser page",
        evidence,
        findings,
        diagnosis,
        budget: {
          maxDurationMs: mission.maxDurationMs,
          maxInteractions: mission.maxInteractions,
          interactionsUsed,
          durationMs: Date.now() - started,
          ...(classified.status === "UNPROVEN" && /budget|deadline|timeout/i.test(classified.finding.message) ? { exhausted: /interaction/i.test(classified.finding.message) ? "interactions" : "time" } : {})
        }
      };
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      signal?.removeEventListener("abort", abortHandler);
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }
}
