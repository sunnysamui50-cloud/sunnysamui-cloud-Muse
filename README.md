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

Deployment is now CI-gated and automatic. The deploy workflow runs after CI succeeds on main; manual dispatch remains available.

Repository variables:
- GCP_PROJECT_ID
- GCP_WIF_PROVIDER
- GCP_DEPLOY_SERVICE_ACCOUNT
- APP_API_BASE_URL

Repository secrets:
- MUSE_MCP_BEARER_TOKEN
- MUSE_APP_API_TOKEN
- MUSE_BROWSER_WORKER_TOKEN

Flow:

push/merge main -> CI green -> Cloud Run deployment -> live MCP/auth verification

The deployed MCP endpoint is printed by the workflow.

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

The deployment workflow automatically performs the live MCP handshake/tool-boundary/auth checks and browser-worker health check.

## Current status

Live deployment is not claimed until GCP Workload Identity, runtime secrets, upstream API contracts and live verification are available.
