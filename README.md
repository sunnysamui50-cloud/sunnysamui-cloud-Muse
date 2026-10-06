# Muse MCP

Standalone MCP gateway for controlled AI-agent access to approved application operations.

This repository is intentionally independent of MyVoice, OmniAgent and Chordstream.

## Architecture

ChatGPT / Muse -> HTTPS -> Muse MCP gateway on Google Cloud Run -> fixed application API routes

The gateway exposes exactly eight tools:

- get_app_status
- list_projects
- create_task
- get_task
- run_smoke_tests
- get_test_results
- search_docs
- run_browser_mission

It does not expose shell execution, arbitrary SQL, arbitrary URL fetching, filesystem operations, deletion, or unrestricted administration.

## Engineering baseline

- modular TypeScript rather than a monolithic prototype
- Zod validation at every tool boundary
- explicit authentication and least-privilege boundaries
- small, purposeful commits
- local/static verification before CI
- targeted tests and regression tests
- build/container verification before deployment
- CI used as a deliberate checkpoint to conserve GitHub Actions minutes
- deployment/runtime verification before declaring success
- no secrets in source control
- browser worker uses Cloud Run IAM service-to-service authentication in production
- preserve the approved eight-tool security boundary

## Runtime

- Node.js 22+
- TypeScript 6+
- official MCP TypeScript SDK v2
- Streamable HTTP
- Google Cloud Run
- Artifact Registry
- Google Secret Manager

## GitHub Actions deployment

Deployment is CI-gated and automatic after successful CI on `main`; manual dispatch remains available.

Repository variables:

- `GCP_PROJECT_ID`
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `GCP_RUNTIME_SERVICE_ACCOUNT`
- `APP_API_BASE_URL`

Repository secret used by the live verifier:

- `MUSE_MCP_BEARER_TOKEN`

Runtime application secrets are held in Google Secret Manager:

- `MUSE_MCP_BEARER_TOKEN`
- `MUSE_APP_API_TOKEN`

Flow:

push/merge main -> CI green -> Cloud Run deployment -> live MCP/auth/browser verification

## Production acceptance gates

1. typecheck
2. unit/security tests
3. production build
4. main Docker build
5. browser-worker Docker build
6. MCP handshake
7. exactly eight tools
8. missing bearer returns 401
9. wrong bearer returns 401
10. valid bearer reaches MCP
11. every tool rejects invalid input
12. fixed upstream routes verified
13. Cloud Run health green
14. live HTTPS MCP verified
15. no secret in repository history
16. browser mission returns PASS / FAIL / BLOCKED / UNPROVEN with structured findings
17. browser mission diagnosis identifies the next diagnostic action
18. reproducible `npm ci` build with committed package-lock.json
19. browser worker is not publicly invokable in production and Muse uses short-lived Cloud Run identity tokens

The deployment workflow automatically performs the live MCP handshake/tool-boundary/auth checks and browser-worker health check.

## Current status

Muse is in the pre-deployment hardening checkpoint. The browser mission path has caller-controlled time and interaction budgets, structured outcomes, evidence, and first-pass diagnosis. Live deployment is not claimed until GCP Workload Identity, runtime secrets, upstream API contracts, reproducible dependency installation and live verification are available.

See [docs/gcp-bootstrap.md](docs/gcp-bootstrap.md) for the standalone GCP setup.
