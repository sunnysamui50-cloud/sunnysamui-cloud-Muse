# Muse verification checkpoint

This checkpoint validates the current Muse boundary before any Cloud Run deployment.

Required gates:

1. TypeScript typecheck passes.
2. Unit/integration tests pass.
3. Production build passes.
4. Docker image builds successfully.
5. Only the seven approved MCP tools are exposed.

A live MCP handshake is a separate post-deployment gate and must not be marked passed until a real Cloud Run endpoint is verified.
