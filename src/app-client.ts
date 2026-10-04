import { AppApiError } from "./errors.js";
import type { Config } from "./config.js";
import type {
  CreateTaskInput,
  GetTestResultsInput,
  GetTaskInput,
  ListProjectsInput,
  RunSmokeTestsInput,
  SearchDocsInput
} from "./schemas.js";

export class AppClient {
  constructor(private readonly config: Config) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.APP_API_TIMEOUT_MS
    );

    try {
      const response = await fetch(
        new URL(path, this.config.APP_API_BASE_URL),
        {
          ...init,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.config.APP_API_TOKEN}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {})
          }
        }
      );

      const text = await response.text();
      let body: unknown = null;

      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new AppApiError(
            "Application API returned invalid JSON",
            502,
            "INVALID_APP_RESPONSE"
          );
        }
      }

      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : `Application API returned HTTP ${response.status}`;

        throw new AppApiError(
          message,
          response.status,
          "APP_API_REQUEST_FAILED"
        );
      }

      return body as T;
    } catch (error) {
      if (error instanceof AppApiError) throw error;

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppApiError(
          "Application API request timed out",
          504,
          "APP_API_TIMEOUT"
        );
      }

      throw new AppApiError(
        error instanceof Error ? error.message : "Application API request failed",
        502,
        "APP_API_UNREACHABLE"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  getAppStatus() {
    return this.request("/v1/status");
  }

  listProjects(input: ListProjectsInput) {
    const params = new URLSearchParams({ limit: String(input.limit) });
    if (input.cursor) params.set("cursor", input.cursor);
    return this.request(`/v1/projects?${params.toString()}`);
  }

  createTask(input: CreateTaskInput) {
    return this.request("/v1/tasks", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getTask(input: GetTaskInput) {
    return this.request(
      `/v1/tasks/${encodeURIComponent(input.taskId)}`
    );
  }

  runSmokeTests(input: RunSmokeTestsInput) {
    return this.request("/v1/tests/smoke", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getTestResults(input: GetTestResultsInput) {
    return this.request(
      `/v1/tests/${encodeURIComponent(input.runId)}`
    );
  }

  searchDocs(input: SearchDocsInput) {
    const params = new URLSearchParams({
      q: input.query,
      limit: String(input.limit)
    });
    return this.request(`/v1/docs/search?${params.toString()}`);
  }
}
