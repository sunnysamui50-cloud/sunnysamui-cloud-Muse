import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

import { loadConfig } from "./config.js";
import { isAuthorized } from "./auth.js";
import { AppClient } from "./app-client.js";
import { buildMcpServer } from "./mcp-server.js";

const config = loadConfig();
const appClient = new AppClient(config);

const handler = createMcpHandler(
  () => buildMcpServer(appClient),
  {
    responseMode: "json",
    maxRequestBodySize: 1024 * 1024
  }
);

const nodeHandler = toNodeHandler(handler);

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(payload);
}

const httpServer = createServer(
  (req: IncomingMessage, res: ServerResponse) => {
    const host = req.headers.host ?? "unknown";
    const url = new URL(req.url ?? "/", `http://${host}`);

    if (url.pathname === "/healthz" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        service: "muse-mcp"
      });
      return;
    }

    if (url.pathname !== "/mcp") {
      sendJson(res, 404, {
        error: "NOT_FOUND",
        message: "Endpoint not found"
      });
      return;
    }

    if (!isAuthorized(req.headers, config.MCP_BEARER_TOKEN)) {
      sendJson(res, 401, {
        error: "UNAUTHORIZED",
        message: "Missing or invalid bearer token"
      });
      return;
    }

    void nodeHandler(req, res);
  }
);

httpServer.listen(config.PORT, "0.0.0.0", () => {
  console.error(
    JSON.stringify({
      service: "muse-mcp",
      port: config.PORT,
      endpoint: "/mcp"
    })
  );
});

async function shutdown(signal: string): Promise<void> {
  console.error(JSON.stringify({ event: "shutdown", signal }));
  await handler.close();

  httpServer.close(() => {
    process.exit(0);
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
