import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";

const requestContext = new AsyncLocalStorage<string>();

export function createRequestId(): string { return randomUUID(); }
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestContext.run(requestId, fn);
}
export function getRequestId(): string { return requestContext.getStore() ?? "unknown"; }
export function hashInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}
export function audit(event: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({
    event, requestId: getRequestId(), timestamp: new Date().toISOString(), ...fields
  }));
}
