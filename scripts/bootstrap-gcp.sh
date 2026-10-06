#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-muse-agent-control}"
REGION="${REGION:-europe-west2}"
REPO_OWNER="sunnysamui50-cloud"
REPO_NAME="sunnysamui-cloud-Muse"
REPO_ID="1404558057"
DEPLOYER_SA="muse-deployer"
RUNTIME_SA="muse-runtime"
ARTIFACT_REPO="muse"
WIF_POOL="github"
WIF_PROVIDER="muse-github"

echo "Muse GCP bootstrap: $PROJECT_ID / $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
echo "Project number: $PROJECT_NUMBER"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com

DEPLOYER_EMAIL="$DEPLOYER_SA@$PROJECT_ID.iam.gserviceaccount.com"
RUNTIME_EMAIL="$RUNTIME_SA@$PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create "$DEPLOYER_SA" --display-name="Muse Cloud Run deployer" --description="Dedicated GitHub Actions deployment identity for Muse" 2>/dev/null || true
gcloud iam service-accounts create "$RUNTIME_SA" --display-name="Muse Cloud Run runtime" --description="Dedicated runtime identity for Muse Cloud Run services" 2>/dev/null || true

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER_EMAIL" --role="roles/run.admin" --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER_EMAIL" --role="roles/serviceusage.serviceUsageConsumer" --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_EMAIL" --member="serviceAccount:$DEPLOYER_EMAIL" --role="roles/iam.serviceAccountUser" --quiet >/dev/null

gcloud artifacts repositories create "$ARTIFACT_REPO" --repository-format=docker --location="$REGION" --description="Muse production container images" 2>/dev/null || true
gcloud artifacts repositories add-iam-policy-binding "$ARTIFACT_REPO" --location="$REGION" --member="serviceAccount:$DEPLOYER_EMAIL" --role="roles/artifactregistry.writer" --quiet >/dev/null

for SECRET in MUSE_MCP_BEARER_TOKEN MUSE_APP_API_TOKEN; do
  gcloud secrets create "$SECRET" --replication-policy="automatic" 2>/dev/null || true
  gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$RUNTIME_EMAIL" --role="roles/secretmanager.secretAccessor" --quiet >/dev/null
done

gcloud iam workload-identity-pools create "$WIF_POOL" --location=global --display-name="Muse GitHub Actions" --description="GitHub Actions identity federation for Muse" 2>/dev/null || true
gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" --location=global --workload-identity-pool="$WIF_POOL" --display-name="Muse GitHub OIDC" --issuer-uri="https://token.actions.githubusercontent.com/" --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository=assertion.repository" --attribute-condition="assertion.repository_id == '$REPO_ID' && assertion.repository == '$REPO_OWNER/$REPO_NAME'" 2>/dev/null || true

WIF_PROVIDER_RESOURCE="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/providers/$WIF_PROVIDER"
WIF_PRINCIPAL="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/attribute.repository_id/$REPO_ID"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" --role="roles/iam.workloadIdentityUser" --member="$WIF_PRINCIPAL" --quiet >/dev/null

echo
echo "Infrastructure is ready."
echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCP_WIF_PROVIDER=$WIF_PROVIDER_RESOURCE"
echo "GCP_DEPLOY_SERVICE_ACCOUNT=$DEPLOYER_EMAIL"
echo "GCP_RUNTIME_SERVICE_ACCOUNT=$RUNTIME_EMAIL"

read -r -s -p "Enter MUSE_MCP_BEARER_TOKEN (32+ characters): " MCP_TOKEN
echo
[[ ${#MCP_TOKEN} -ge 32 ]] || { echo "Token must be at least 32 characters."; exit 1; }
printf '%s' "$MCP_TOKEN" | gcloud secrets versions add MUSE_MCP_BEARER_TOKEN --data-file=-
unset MCP_TOKEN

read -r -s -p "Enter MUSE_APP_API_TOKEN (blank if not available yet): " APP_TOKEN
echo
if [[ -n "$APP_TOKEN" ]]; then
  printf '%s' "$APP_TOKEN" | gcloud secrets versions add MUSE_APP_API_TOKEN --data-file=-
fi
unset APP_TOKEN

echo
echo "Configure these non-secret GitHub repository variables:"
echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCP_WIF_PROVIDER=$WIF_PROVIDER_RESOURCE"
echo "GCP_DEPLOY_SERVICE_ACCOUNT=$DEPLOYER_EMAIL"
echo "GCP_RUNTIME_SERVICE_ACCOUNT=$RUNTIME_EMAIL"
echo "APP_API_BASE_URL=<actual upstream application API>"
echo
echo "Configure GitHub secret MUSE_MCP_BEARER_TOKEN with the same MCP value for live verification."
