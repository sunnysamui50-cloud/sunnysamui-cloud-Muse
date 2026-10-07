# Muse verification checkpoint

Required gates before deployment:

1. TypeScript typecheck passes.
2. Unit/integration tests pass.
3. Production build passes.
4. Main Muse Docker image builds successfully.
5. Browser worker Docker image builds successfully.
6. Exactly eight MCP tools are exposed.
7. Browser mission input is bounded, HTTPS-only, and contains no arbitrary code execution.
8. Audit events contain request ID, operation/tool, input hash, outcome and latency where applicable.

The browser worker is a separate deployment boundary.

A live MCP handshake, negative-auth checks and live browser-worker health check are post-deployment gates.

A committed package-lock.json and npm ci are now enforced by CI and Docker builds at this checkpoint. Production browser-worker invocation is now designed for Cloud Run IAM rather than a shared bearer secret.
