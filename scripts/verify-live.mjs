import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.MCP_URL;
const token = process.env.MCP_BEARER_TOKEN;
if (!url || !token) throw new Error("MCP_URL and MCP_BEARER_TOKEN are required");

const expected = ["create_task","get_app_status","get_task","get_test_results","list_projects","run_browser_mission","run_smoke_tests","search_docs"];

for (const [label, auth] of [["missing", undefined], ["wrong", "Bearer invalid-token"]]) {
  const headers = { "content-type": "application/json" };
  if (auth) headers.authorization = auth;
  const response = await fetch(url, { method: "POST", headers, body: "{}" });
  if (response.status !== 401) throw new Error(label + " authentication check returned HTTP " + response.status + ", expected 401");
}

const client = new Client({ name: "muse-live-verifier", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), { authProvider: { token: async () => token } });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const actual = tools.map((tool) => tool.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Tool boundary mismatch. Expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }

  const browserResult = await client.callTool({
    name: "run_browser_mission",
    arguments: {
      objective: "Verify external search works",
      acceptanceCriteria: ["Koh Samui appears in search evidence"],
      maxDurationMs: 45000,
      maxInteractions: 20,
      steps: [
        { type: "navigate", url: "https://en.wikipedia.org/wiki/Main_Page" },
        { type: "snapshot" },
        { type: "screenshot" },
        { type: "type", target: { selector: 'input[type="search"]:visible' }, text: "Koh Samui" },
        { type: "click", target: { selector: 'button:has-text("Search"):visible' } },
        { type: "wait", text: "Koh Samui", timeoutMs: 15000 },
        { type: "assert", textContains: "Koh Samui" },
        { type: "snapshot", maxChars: 12000 },
        { type: "screenshot" }
      ]
    }
  });

  if (browserResult.isError) throw new Error("Live browser mission returned an MCP tool error");
  const browserText = (browserResult.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n");
  if (!/\"status\":\"PASS\"/.test(browserText)) throw new Error("Live browser mission did not return PASS status");
  const content = browserResult.content ?? [];
  const textParts = content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
  const images = content.filter((item) => item.type === "image");
  if (!/Koh Samui/i.test(textParts)) throw new Error("Live browser mission did not return the expected search evidence");
  if (images.length !== 2) throw new Error("Live browser mission returned " + images.length + " screenshots; expected 2");
  if (images.some((item) => item.type === "image" && (!item.data || item.mimeType !== "image/jpeg"))) {
    throw new Error("Live browser mission returned invalid screenshot evidence");
  }

  console.log(JSON.stringify({
    ok: true,
    server: client.getServerVersion(),
    tools: actual,
    browserAcceptance: { externalSite: "wikipedia.org", query: "Koh Samui", assertion: "textContains", screenshots: images.length }
  }, null, 2));
} finally {
  await client.close();
}
