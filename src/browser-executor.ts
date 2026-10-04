import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import type { BrowserMission, BrowserStep } from "./browser-schemas.js";

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_BYTES = 1_500_000;

export type BrowserEvidence =
  | { type: "navigation"; url: string; title: string }
  | { type: "snapshot"; url: string; text: string }
  | { type: "screenshot"; url: string; mimeType: "image/jpeg"; data: string }
  | { type: "action"; action: string; url: string };

export interface BrowserExecutor {
  run(mission: BrowserMission): Promise<{
    ok: true;
    finalUrl: string;
    title: string;
    evidence: BrowserEvidence[];
  }>;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0;
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  if (isIP(ip) === 6) {
    const normalized = ip.toLowerCase();
    return normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb");
  }
  return false;
}

async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Browser navigation is restricted to HTTPS");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".internal") ||
    hostname === "host.docker.internal"
  ) {
    throw new Error("Browser navigation to internal hosts is blocked");
  }

  if (isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error("Browser navigation to private IP addresses is blocked");
  }

  if (!isIP(hostname)) {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.some(({ address }) => isPrivateIp(address))) {
      throw new Error("Browser navigation to a host resolving to a private IP is blocked");
    }
  }

  return url;
}

function getTarget(page: Page, target: { role?: string; name?: string; text?: string }) {
  if (target.name) {
    return target.role
      ? page.getByRole(target.role as Parameters<Page["getByRole"]>[0], { name: target.name })
      : page.getByText(target.name, { exact: true });
  }
  return page.getByText(target.text!, { exact: true });
}

async function executeStep(
  page: Page,
  step: BrowserStep,
  evidence: BrowserEvidence[]
): Promise<Page> {
  const timeout = step.timeoutMs ?? 10000;
  page.setDefaultTimeout(timeout);

  switch (step.type) {
    case "navigate": {
      await assertPublicHttpsUrl(step.url);
      await page.goto(step.url, { waitUntil: "domcontentloaded", timeout });
      evidence.push({ type: "navigation", url: page.url(), title: await page.title() });
      return page;
    }
    case "snapshot": {
      const text = (await page.locator("body").innerText({ timeout })).slice(0, step.maxChars);
      evidence.push({ type: "snapshot", url: page.url(), text });
      return page;
    }
    case "screenshot": {
      if (evidence.filter((item) => item.type === "screenshot").length >= MAX_SCREENSHOTS) {
        throw new Error("Mission screenshot limit exceeded");
      }
      const buffer = await page.screenshot({
        type: "jpeg",
        quality: 60,
        fullPage: step.fullPage,
        timeout
      });
      if (buffer.byteLength > MAX_SCREENSHOT_BYTES) {
        throw new Error("Screenshot exceeds the 1.5 MB evidence limit");
      }
      evidence.push({
        type: "screenshot",
        url: page.url(),
        mimeType: "image/jpeg",
        data: buffer.toString("base64")
      });
      return page;
    }
    case "click": {
      const locator = getTarget(page, step.target);
      await locator.first().click({ timeout });
      evidence.push({
        type: "action",
        action: "click:" + (step.target.name ?? step.target.text),
        url: page.url()
      });
      return page;
    }
    case "type": {
      const locator = step.target.label
        ? page.getByLabel(step.target.label)
        : page.getByPlaceholder(step.target.placeholder!);
      await locator.fill(step.text, { timeout });
      if (step.submit) await locator.press("Enter", { timeout });
      evidence.push({ type: "action", action: "type", url: page.url() });
      return page;
    }
    case "wait": {
      if (step.text) {
        await page.getByText(step.text, { exact: false }).first().waitFor({ state: "visible", timeout });
      } else {
        await new Promise((resolve) => setTimeout(resolve, step.milliseconds));
      }
      evidence.push({ type: "action", action: "wait", url: page.url() });
      return page;
    }
  }
}

export class PlaywrightBrowserExecutor implements BrowserExecutor {
  async run(mission: BrowserMission) {
    const browser: Browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const context: BrowserContext = await browser.newContext({
      serviceWorkers: "block",
      ignoreHTTPSErrors: false,
      viewport: { width: 1440, height: 900 }
    });

    await context.route("**/*", async (route) => {
      try {
        await assertPublicHttpsUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });

    const page = await context.newPage();
    const evidence: BrowserEvidence[] = [];
    const timer = setTimeout(() => void context.close(), mission.maxDurationMs);

    try {
      for (const step of mission.steps) await executeStep(page, step, evidence);
      return { ok: true as const, finalUrl: page.url(), title: await page.title(), evidence };
    } finally {
      clearTimeout(timer);
      await context.close();
      await browser.close();
    }
  }
}
