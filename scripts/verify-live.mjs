import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.MCP_URL;
const token = process.env.MCP_BEARER_TOKEN;

if (!url || !token) {
  throw new Error("MCP_URL and MCP_BEARER_TOKEN are required");
}

const expected = [
  "create_task",
  "get_app_status",
  "get_task",
  "get_test_results",
  "list_projects",
  "run_smoke_tests",
  "search_docs"
];

const client = new Client({
  name: "muse-live-verifier",
  version: "0.1.0"
});

const transport = new StreamableHTTPClientTransport(new URL(url), {
  authProvider: {
    token: async () => token
  }
});

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  const actual = tools.map((tool) => tool.name).sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Tool boundary mismatch. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }

  console.log(JSON.stringify({
    ok: true,
    server: client.getServerVersion(),
    tools: actual
  }, null, 2));
} finally {
  await client.close();
}
