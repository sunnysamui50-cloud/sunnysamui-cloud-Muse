import type { Config } from "./config.js";
import { BrowserMissionResultSchema, type BrowserMission } from "./browser-schemas.js";
import { getRequestId } from "./request-context.js";

export class BrowserApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BrowserApiError";
  }
}

export class BrowserClient {
  constructor(private readonly config: Config) {}

  async runMission(input: BrowserMission): Promise<unknown> {
    if (!this.config.BROWSER_WORKER_URL || !this.config.BROWSER_WORKER_TOKEN) {
      throw new BrowserApiError("Browser worker is not configured", 503);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.maxDurationMs + 5000);
    try {
      const response = await fetch(this.config.BROWSER_WORKER_URL + "/v1/browser/missions", {
        method: "POST",
        headers: {
          authorization: "Bearer " + this.config.BROWSER_WORKER_TOKEN,
          "content-type": "application/json",
          "x-request-id": getRequestId()
        },
        body: JSON.stringify(input),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new BrowserApiError(
          response.status >= 500 ? "Browser worker failed" : String(body.message ?? "Browser request rejected"),
          response.status
        );
      }
      const parsed = BrowserMissionResultSchema.safeParse(body);
      if (!parsed.success) throw new BrowserApiError("Browser worker returned an invalid mission result", 502);
      return parsed.data;
    } catch (error) {
      if (error instanceof BrowserApiError) throw error;
      throw new BrowserApiError("Browser worker request failed", 503);
    } finally {
      clearTimeout(timeout);
    }
  }
}
