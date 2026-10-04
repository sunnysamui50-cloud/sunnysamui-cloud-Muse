import { McpServer } from "@modelcontextprotocol/server";

import { AppClient } from "./app-client.js";
import { BrowserClient } from "./browser-client.js";
import { toToolError } from "./errors.js";
import { BrowserMissionSchema } from "./browser-schemas.js";
import {
  CreateTaskSchema,
  GetAppStatusSchema,
  GetTaskSchema,
  GetTestResultsSchema,
  ListProjectsSchema,
  RunSmokeTestsSchema,
  SearchDocsSchema
} from "./schemas.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }]
  };
}

function browserResult(data: unknown) {
  const evidence = (
    typeof data === "object" && data !== null && "evidence" in data
      ? (data as { evidence?: unknown }).evidence
      : undefined
  );

  if (!Array.isArray(evidence)) return jsonResult(data);

  const content: Array<
    { type: "text"; text: string } |
    { type: "image"; data: string; mimeType: "image/jpeg" }
  > = [{
    type: "text",
    text: JSON.stringify({
      ...((data as Record<string, unknown>)),
      evidence: evidence.map((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type?: unknown }).type === "screenshot"
        ) {
          const { data: _image, ...metadata } = item as Record<string, unknown>;
          return metadata;
        }
        return item;
      })
    })
  }];

  for (const item of evidence) {
    if (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      (item as { type?: unknown }).type === "screenshot" &&
      "data" in item &&
      typeof (item as { data?: unknown }).data === "string"
    ) {
      content.push({
        type: "image",
        data: (item as { data: string }).data,
        mimeType: "image/jpeg"
      });
    }
  }

  return { content };
}

export function buildMcpServer(
  appClient: AppClient,
  browserClient: BrowserClient
): McpServer {
  const server = new McpServer({ name: "muse-mcp", version: "0.1.0" });

  server.registerTool("get_app_status", {
    title: "Get Application Status",
    description: "Return application health and deployment status.",
    inputSchema: GetAppStatusSchema
  }, async (input) => {
    try {
      GetAppStatusSchema.parse(input);
      return jsonResult(await appClient.getAppStatus());
    } catch (error) {
      return toToolError(error);
    }
  });

  server.registerTool("list_projects", {
    title: "List Projects",
    description: "List approved projects with bounded pagination.",
    inputSchema: ListProjectsSchema
  }, async (input) => {
    try {
      return jsonResult(await appClient.listProjects(ListProjectsSchema.parse(input)));
    } catch (error) {
      return toToolError(error);
    }
  });

  server.registerTool("create_task", {
    title: "Create Task",
    description: "Create one task in an approved project.",
    inputSchema: CreateTaskSchema
  }, async (input) => {
    try {
      return jsonResult(await appClient.createTask(CreateTaskSchema.parse(input)));
    } catch (error) {
      return toToolError(error);
    }
  });

  server.registerTool("get_task", {
    title: "Get Task",
    description: "Retrieve one task by identifier.",
    inputSchema: GetTaskSchema
  }, async (input) => {
    try {
      return jsonResult(await appClient.getTask(GetTaskSchema.parse(input)));
    } catch (error) {
      return toToolError(error);
    }
  });

  server.registerTool("run_smoke_tests", {
    title: "Run Smoke Tests",
    description: "Start one predefined smoke-test suite for a project.",
    inputSchema: RunSmokeTestsSchema
  }, async (input) => {
    try {
      return jsonResult(await appClient.runSmokeTests(RunSmokeTestsSchema.parse(input)));
    } catch (error) {
      return toToolError(error);
    }
  });

  server.registerTool("get_test_results", {
    title: "Get Test Results",
    description: "Retrieve results for a previous smoke-test run.",
    inputSchema: GetTestResultsSchema
  }, async (input) => {
    try {
      return jsonResult(await appClient.getTestResults(GetTestResultsSchema.parse(input)));
    } catch (error) {
      return toToolError(error);
    }
  });

  server.registerTool("search_docs", {
    title: "Search Documentation",
    description: "Search the approved application documentation index.",
    inputSchema: SearchDocsSchema
  }, async (input) => {
    try {
      return jsonResult(await appClient.searchDocs(SearchDocsSchema.parse(input)));
    } catch (error) {
      return toToolError(error);
    }
  });

  server.registerTool("run_browser_mission", {
    title: "Run Browser Mission",
    description: "Execute a bounded HTTPS browser mission and return structured evidence plus screenshots.",
    inputSchema: BrowserMissionSchema
  }, async (input) => {
    try {
      return browserResult(await browserClient.runMission(BrowserMissionSchema.parse(input)));
    } catch (error) {
      return toToolError(error);
    }
  });

  return server;
}
