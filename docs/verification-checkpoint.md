# Muse verification checkpoint

This checkpoint validates the current Muse boundary before any Cloud Run deployment.

Required gates:

1. TypeScript typecheck passes.
2. Unit/integration tests pass.
3. Production build passes.
4. Docker image builds successfully.
5. The eight approved MCP tools are exposed: seven application tools plus run_browser_mission.
6. Browser mission input is bounded, HTTPS-only, and contains no arbitrary code execution.

The browser worker is a separate deployment boundary. Strict TypeScript compilation remains a required gate before any browser deployment. Its container is built only in a deliberate browser-worker checkpoint so ordinary Muse CI does not pay the Chromium build cost.

A live MCP handshake and live browser mission are separate post-deployment gates and must not be marked passed until real Cloud Run endpoints are verified.
