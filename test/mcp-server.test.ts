import test from "node:test";
import assert from "node:assert/strict";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildMcpServer } from "../src/mcp-server.js";

function fakeAppClient() {
  return {
    getAppStatus: async () => ({ ok: true }),
    listProjects: async () => ({ projects: [] }),
    createTask: async (input: unknown) => ({ created: input }),
    getTask: async (input: unknown) => ({ task: input }),
    runSmokeTests: async (input: unknown) => ({ runId: "test-run", input }),
    getTestResults: async (input: unknown) => ({ runId: input }),
    searchDocs: async (input: unknown) => ({ results: [], input })
  } as never;
}

function fakeBrowserClient() {
  return {
    runMission: async () => ({
      ok: true,
      finalUrl: "https://example.com",
      title: "Example",
      evidence: []
    })
  } as never;
}

test("MCP advertises the seven application tools plus browser mission", async () => {
  const server = buildMcpServer(fakeAppClient(), fakeBrowserClient());
  const client = new Client({ name: "muse-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  try {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      [
        "create_task",
        "get_app_status",
        "get_task",
        "get_test_results",
        "list_projects",
        "run_browser_mission",
        "run_smoke_tests",
        "search_docs"
      ]
    );
    assert.equal(tools.length, 8);
  } finally {
    await client.close();
    await server.close();
  }
});

test("MCP schema rejects invalid create_task arguments", async () => {
  const server = buildMcpServer(fakeAppClient(), fakeBrowserClient());
  const client = new Client({ name: "muse-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  try {
    const result = await client.callTool({
      name: "create_task",
      arguments: { projectId: "myvoice", title: "", unexpected: true }
    });
    assert.equal(result.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
