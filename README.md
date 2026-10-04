# Muse MCP

Standalone MCP gateway for controlled AI-agent access to approved application operations.

This repository is intentionally independent of MyVoice, OmniAgent and Chordstream.

## Architecture

ChatGPT / Muse
  -> HTTPS
  -> Muse MCP gateway on Google Cloud Run
  -> fixed application API routes

The gateway exposes exactly seven tools:

- get_app_status
- list_projects
- create_task
- get_task
- run_smoke_tests
- get_test_results
- search_docs

It does not expose shell execution, arbitrary SQL, arbitrary URL fetching, filesystem operations, deletion, or unrestricted administration.

## Engineering baseline

This project follows the user's canonical engineering standard:

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
- preserve the approved seven-tool security boundary

The server is stateless and horizontally scalable.

## Runtime

- Node.js 22+
- TypeScript 6+
- official MCP TypeScript SDK v2
- Streamable HTTP
- Google Cloud Run
- Artifact Registry
- Google Secret Manager

## Application API contract

The gateway uses fixed routes only:

| MCP tool | Upstream route |
|---|---|
| get_app_status | GET /v1/status |
| list_projects | GET /v1/projects |
| create_task | POST /v1/tasks |
| get_task | GET /v1/tasks/{taskId} |
| run_smoke_tests | POST /v1/tests/smoke |
| get_test_results | GET /v1/tests/{runId} |
| search_docs | GET /v1/docs/search |

These are a contract boundary. They must be mapped to the real application APIs and tested before production use.

## Local verification

Copy .env.example to .env and provide real values.

Then:

```bash
npm install
npm run typecheck
npm test
npm run build
```

The server listens on port 3000 by default.

Health:

```
GET /healthz
```

MCP:

```
POST /mcp
Authorization: Bearer <MCP_BEARER_TOKEN>
```

## Google Cloud setup

Recommended region: europe-west2.

Enable:

- Cloud Run
- Artifact Registry
- Secret Manager
- IAM Credentials / Workload Identity Federation

Create an Artifact Registry Docker repository:

```bash
gcloud artifacts repositories create muse \
  --repository-format=docker \
  --location=europe-west2
```

Create the two runtime secrets:

```bash
printf '%s' 'YOUR_MCP_BEARER_TOKEN' | gcloud secrets create MUSE_MCP_BEARER_TOKEN --data-file=-
printf '%s' 'YOUR_APP_API_TOKEN' | gcloud secrets create MUSE_APP_API_TOKEN --data-file=-
```

Grant the Cloud Run runtime service account access to those secrets.

The GitHub deploy identity needs permission to push to Artifact Registry, deploy Cloud Run revisions, and act as the Cloud Run runtime service account.

Prefer GitHub Actions Workload Identity Federation. Do not create a long-lived Google service-account JSON key for this repository.

## GitHub Actions deployment configuration

The deployment workflow is manual by design until the integration is proven. This avoids burning Actions minutes on every small commit.

Repository variables:

- GCP_PROJECT_ID
- GCP_WIF_PROVIDER
- GCP_DEPLOY_SERVICE_ACCOUNT
- APP_API_BASE_URL

Then:

GitHub -> Actions -> Deploy Muse MCP to Cloud Run -> Run workflow.

The deployed endpoint will be:

```
https://muse-mcp-<generated-id>-<region>.a.run.app/mcp
```

Cloud Run supplies HTTPS. The MCP endpoint remains protected by the bearer token.

## Production acceptance gates

Do not connect ChatGPT or Muse until all of these are proven:

1. typecheck passes
2. unit/security tests pass
3. production build passes
4. Docker build passes
5. MCP initialize/handshake succeeds
6. tools/list returns exactly seven tools
7. unauthenticated /mcp requests return 401
8. wrong bearer token returns 401
9. valid bearer token reaches MCP
10. every tool rejects invalid input
11. every fixed upstream route is verified
12. Cloud Run health check is green
13. live HTTPS MCP endpoint is verified
14. no secret is present in repository history

Only after these gates should the connector be registered in ChatGPT and Muse.

## Current status

Initial implementation is in GitHub. Live deployment is intentionally not claimed until GCP credentials, upstream API contracts and runtime verification are available.
