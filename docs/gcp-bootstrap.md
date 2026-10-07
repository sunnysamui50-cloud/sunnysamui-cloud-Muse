# GCP bootstrap for Muse

Muse uses a completely separate Google Cloud project from MyVoice, OmniAgent and Chordstream.

## Target

- Project ID: `muse-agent-control`
- Project number: `961760273239`
- Region: `europe-west2`
- GitHub repository: `sunnysamui50-cloud/sunnysamui-cloud-Muse`
- GitHub repository ID: `1404558057`

Do not reuse a deployer service account, Artifact Registry repository, secret, or cross-project IAM binding from another application.

## Automated bootstrap

Run from an authenticated Google Cloud Shell session after billing is enabled:

```bash
bash scripts/bootstrap-gcp.sh
```

The script creates the required APIs, `muse-deployer`, `muse-runtime`, Artifact Registry repository `muse`, runtime Secret Manager entries, and a Muse-specific GitHub Workload Identity Federation pool/provider.

It does not create service-account keys.

The WIF provider is restricted by immutable GitHub repository ID as well as repository name. Google recommends immutable ID claims for GitHub federation because repository names can potentially be reused.

## Secrets

The bootstrap prompts for secret values without echoing them.

Muse's current runtime does not require a Gemini API key, so one is not provisioned by the bootstrap. Do not put API keys into source control or GitHub variables.

The Cloud Run runtime service account receives Secret Manager accessor permission. The GitHub deployer does not receive application secret values.

For live verification, configure the GitHub Actions secret `MUSE_MCP_BEARER_TOKEN` with the same MCP bearer value entered during bootstrap. The deployed service reads its runtime copy from Secret Manager.

## GitHub repository variables

```text
GCP_PROJECT_ID=muse-agent-control
GCP_WIF_PROVIDER=projects/961760273239/locations/global/workloadIdentityPools/github/providers/muse-github
GCP_DEPLOY_SERVICE_ACCOUNT=muse-deployer@muse-agent-control.iam.gserviceaccount.com
GCP_RUNTIME_SERVICE_ACCOUNT=muse-runtime@muse-agent-control.iam.gserviceaccount.com
APP_API_BASE_URL=<actual upstream application API>
```

Do not invent `APP_API_BASE_URL`; it must be the authoritative upstream API endpoint.

## Deployment security

The deployment creates:

- `muse-mcp`: public network endpoint protected by the MCP bearer token.
- `muse-browser-worker`: private Cloud Run service, invokable only by `muse-runtime`.

Muse obtains a short-lived Google-signed identity token from the Cloud Run metadata server and sends it to the private browser worker. This follows Google's documented Cloud Run service-to-service authentication pattern.

No browser-worker bearer secret is required in production.

## First deployment

After bootstrap and GitHub variables/secrets are configured:

1. CI must be green at the deliberate checkpoint.
2. Deploy Muse from GitHub Actions.
3. Build and push both containers.
4. Deploy the private browser worker and grant only `muse-runtime` `roles/run.invoker`.
5. Deploy Muse MCP with Secret Manager references.
6. Verify MCP authentication, the exact eight-tool boundary, and a real external browser mission.
7. Verify browser-worker IAM health.

Do not merge the operational PR until the real deployment and live verification gates pass.

## Current blocker

As of 2026-10-06, `muse-agent-control` exists but Google has not yet allowed the existing billing account to be linked because the billing/project quota increase request is pending. Do not rerun the bootstrap until billing is enabled.
