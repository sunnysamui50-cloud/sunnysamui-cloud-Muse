const METADATA_IDENTITY_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

export async function getBrowserWorkerAuthorization(mode: "bearer" | "iam", workerUrl: string, bearerToken?: string): Promise<string> {
  if (mode === "bearer") {
    if (!bearerToken) throw new Error("Browser worker bearer authentication is not configured");
    return "Bearer " + bearerToken;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const metadataUrl = new URL(METADATA_IDENTITY_URL);
    metadataUrl.searchParams.set("audience", workerUrl);
    metadataUrl.searchParams.set("format", "full");
    const response = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" }, signal: controller.signal });
    if (!response.ok) throw new Error("Cloud Run identity token request failed");
    const token = (await response.text()).trim();
    if (!token) throw new Error("Cloud Run identity token response was empty");
    return "Bearer " + token;
  } catch {
    throw new Error("Browser worker IAM authentication is unavailable");
  } finally {
    clearTimeout(timeout);
  }
}