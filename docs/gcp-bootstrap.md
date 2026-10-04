# GCP bootstrap for Muse

This is the one-time Google Cloud setup for the standalone Muse MCP service.

Existing project:

- Project ID: `myvoice-508222`
- Project number: `408643281527`
- Region: `europe-west2`
- Existing workload identity pool: `github`

Do not reuse the existing OmniAgent GitHub provider for Muse. Create a separate provider restricted to the Muse repository.

Muse repository ID:

`1404558057`

## 1. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  --project=myvoice-508222
```

## 2. Create dedicated service accounts

```bash
gcloud iam service-accounts create muse-deployer \
  --project=myvoice-508222 \
  --display-name="Muse GitHub deployer"

gcloud iam service-accounts create muse-runtime \
  --project=myvoice-508222 \
  --display-name="Muse Cloud Run runtime"
```

## 3. Create Artifact Registry repository

```bash
gcloud artifacts repositories create muse \
  --repository-format=docker \
  --location=europe-west2 \
  --project=myvoice-508222
```

If it already exists, keep it.

Grant only repository-level write access to the deployer:

```bash
gcloud artifacts repositories add-iam-policy-binding muse \
  --location=europe-west2 \
  --project=myvoice-508222 \
  --member="serviceAccount:muse-deployer@myvoice-508222.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

## 4. Grant deployment permissions

```bash
gcloud projects add-iam-policy-binding myvoice-508222 \
  --member="serviceAccount:muse-deployer@myvoice-508222.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding myvoice-508222 \
  --member="serviceAccount:muse-deployer@myvoice-508222.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"

gcloud iam service-accounts add-iam-policy-binding \
  muse-runtime@myvoice-508222.iam.gserviceaccount.com \
  --project=myvoice-508222 \
  --member="serviceAccount:muse-deployer@myvoice-508222.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## 5. Create the runtime secrets

Generate the MCP bearer token locally. Never commit it.

```bash
openssl rand -hex 32
```

Create the secrets:

```bash
printf '%s' 'YOUR_MCP_BEARER_TOKEN' | \
  gcloud secrets create MUSE_MCP_BEARER_TOKEN \
  --project=myvoice-508222 \
  --data-file=-

printf '%s' 'YOUR_APP_API_TOKEN' | \
  gcloud secrets create MUSE_APP_API_TOKEN \
  --project=myvoice-508222 \
  --data-file=-
```

Grant the runtime service account access:

```bash
gcloud secrets add-iam-policy-binding MUSE_MCP_BEARER_TOKEN \
  --project=myvoice-508222 \
  --member="serviceAccount:muse-runtime@myvoice-508222.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding MUSE_APP_API_TOKEN \
  --project=myvoice-508222 \
  --member="serviceAccount:muse-runtime@myvoice-508222.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## 6. Create a Muse-specific GitHub OIDC provider

The existing GitHub workload identity pool can be reused, but the provider should be separate and restricted to Muse.

```bash
gcloud iam workload-identity-pools providers create-oidc muse-github \
  --project=myvoice-508222 \
  --location=global \
  --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository_id == '1404558057'"
```

Grant that exact repository identity permission to impersonate the deployer:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  muse-deployer@myvoice-508222.iam.gserviceaccount.com \
  --project=myvoice-508222 \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/408643281527/locations/global/workloadIdentityPools/github/attribute.repository_id/1404558057"
```

This prevents another repository from using the Muse deploy identity.

## 7. GitHub repository variables

Add these repository variables to Muse:

```text
GCP_PROJECT_ID=myvoice-508222
GCP_WIF_PROVIDER=projects/408643281527/locations/global/workloadIdentityPools/github/providers/muse-github
GCP_DEPLOY_SERVICE_ACCOUNT=muse-deployer@myvoice-508222.iam.gserviceaccount.com
GCP_RUNTIME_SERVICE_ACCOUNT=muse-runtime@myvoice-508222.iam.gserviceaccount.com
APP_API_BASE_URL=https://YOUR-REAL-APPLICATION-API
```

The two tokens are Google Secret Manager secrets, not GitHub variables.

## 8. First deployment

The repository intentionally uses manual deployment while the system is being hardened.

Run:

GitHub -> Actions -> Deploy Muse MCP to Cloud Run -> Run workflow.

The workflow:

1. obtains a short-lived Google credential through GitHub OIDC
2. builds the Docker image
3. pushes it to Artifact Registry
4. deploys the image to Cloud Run
5. attaches the two Secret Manager secrets
6. uses the dedicated runtime service account

This avoids long-lived Google service-account keys. Google recommends Workload Identity Federation for external deployment workloads rather than service-account keys.
