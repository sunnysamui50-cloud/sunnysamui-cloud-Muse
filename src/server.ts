import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { toNodeHandler, type NodeIncomingMessageLike, type NodeServerResponseLike } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { loadConfig } from "./config.js";
import { isAuthorized } from "./auth.js";
import { AppClient } from "./app-client.js";
import { BrowserClient } from "./browser-client.js";
import { buildMcpServer } from "./mcp-server.js";
import { audit, createRequestId, runWithRequestId } from "./request-context.js";

const config = loadConfig();
const appClient = new AppClient(config);
const browserClient = new BrowserClient(config);
const handler = createMcpHandler(
  () => buildMcpServer(appClient, browserClient),
  { responseMode: "json", maxRequestBodySize: 1024 * 1024 }
);
const nodeHandler = toNodeHandler(handler);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  const requestId = typeof req.headers["x-request-id"] === "string"
    ? req.headers["x-request-id"] : createRequestId();
  res.setHeader("x-request-id", requestId);

  runWithRequestId(requestId, () => {
    const host = req.headers.host ?? "unknown";
    const url = new URL(req.url ?? "/", "http://" + host);

    if (url.pathname === "/healthz" && req.method === "GET") {
      sendJson(res, 200, { ok: true, service: "muse-mcp", requestId });
      return;
    }
    if (url.pathname !== "/mcp") {
      audit("http_request", { method: req.method, path: url.pathname, status: 404 });
      sendJson(res, 404, { error: "NOT_FOUND", message: "Endpoint not found", requestId });
      return;
    }
    if (!isAuthorized(req.headers, config.MCP_BEARER_TOKEN)) {
      audit("http_request", { method: req.method, path: "/mcp", status: 401 });
      sendJson(res, 401, { error: "UNAUTHORIZED", message: "Missing or invalid bearer token" });
      return;
    }

    audit("http_request", { method: req.method, path: "/mcp", status: "accepted" });
    void nodeHandler(
      req as unknown as NodeIncomingMessageLike,
      res as unknown as NodeServerResponseLike
    ).catch((error) => {
      audit("http_request", { method: req.method, path: "/mcp", status: 500, error: error instanceof Error ? error.name : "unknown" });
      if (!res.headersSent) sendJson(res, 500, { error: "INTERNAL_ERROR", message: "MCP request failed", requestId });
    });
  });
});

httpServer.listen(config.PORT, "0.0.0.0", () => {
  audit("service_ready", {
    service: "muse-mcp", port: config.PORT, endpoint: "/mcp",
    browserWorkerConfigured: Boolean(config.BROWSER_WORKER_URL)
  });
});

async function shutdown(signal: string): Promise<void> {
  audit("shutdown", { signal });
  await handler.close();
  httpServer.close(() => process.exit(0));
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
