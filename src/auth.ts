import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAuthorized(
  headers: IncomingHttpHeaders,
  expectedToken: string
): boolean {
  const raw = headers.authorization;
  if (typeof raw !== "string") return false;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1] ? constantTimeEqual(match[1], expectedToken) : false;
}
