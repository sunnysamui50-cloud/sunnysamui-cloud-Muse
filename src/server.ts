import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { loadConfig } from "./config.js";
import { isAuthorized } from "./auth.js";
import { AppClient } from "./app-client.js";
import { toToolError } from "./errors.js";
import {
  CreateTaskSchema,
  GetAppStatusSchema,
  GetTaskSchema,
  GetTestResultsSchema,
  ListProjectsSchema,
  RunSmokeTestsSchema,
  SearchDocsSchema
} from "./schemas.js";

const config = loadConfig();
const appClient = new AppClient(config);

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data)
      }
    ]
  };
}

function buildServer(): McpServer {
  const server = new McpServer({
    name: "muse-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "get_app_status",
    {
      title: "Get Application Status",
      description: "Return application health and deployment status.",
      inputSchema: GetAppStatusSchema
    },
    async (input) => {
      try {
        GetAppStatusSchema.parse(input);
        return jsonResult(await appClient.getAppStatus());
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description: "List approved projects with bounded pagination.",
      inputSchema: ListProjectsSchema
    },
    async (input) => {
      try {
        return jsonResult(
          await appClient.listProjects(ListProjectsSchema.parse(input))
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description: "Create one task in an approved project.",
      inputSchema: CreateTaskSchema
    },
    async (input) => {
      try {
        return jsonResult(
          await appClient.createTask(CreateTaskSchema.parse(input))
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_task",
    {
      title: "Get Task",
      description: "Retrieve one task by identifier.",
      inputSchema: GetTaskSchema
    },
    async (input) => {
      try {
        return jsonResult(
          await appClient.getTask(GetTaskSchema.parse(input))
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "run_smoke_tests",
    {
      title: "Run Smoke Tests",
      description: "Start one predefined smoke-test suite for a project.",
      inputSchema: RunSmokeTestsSchema
    },
    async (input) => {
      try {
        return jsonResult(
          await appClient.runSmokeTests(RunSmokeTestsSchema.parse(input))
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_test_results",
    {
      title: "Get Test Results",
      description: "Retrieve results for a previous smoke-test run.",
      inputSchema: GetTestResultsSchema
    },
    async (input) => {
      try {
        return jsonResult(
          await appClient.getTestResults(GetTestResultsSchema.parse(input))
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "search_docs",
    {
      title: "Search Documentation",
      description: "Search the approved application documentation index.",
      inputSchema: SearchDocsSchema
    },
    async (input) => {
      try {
        return jsonResult(
          await appClient.searchDocs(SearchDocsSchema.parse(input))
        );
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  return server;
}

const handler = createMcpHandler(buildServer, {
  responseMode: "json",
  maxRequestBodySize: 1024 * 1024
});

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
  console.log(
    JSON.stringify({
      service: "muse-mcp",
      port: config.PORT,
      endpoint: "/mcp"
    })
  );
});

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ event: "shutdown", signal }));
  await handler.close();

  httpServer.close(() => {
    process.exit(0);
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
