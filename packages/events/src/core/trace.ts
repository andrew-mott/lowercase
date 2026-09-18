import { randomBytes } from "crypto";

export function generateTraceId(): string {
  let id = "";
  do {
    id = randomBytes(16).toString("hex"); // 32 hex characters
  } while (/^0+$/.test(id)); // try again if all zeros
  return id;
}

/** Fallback span-id generator for domains with no registered SpanIdentityConfig — see span.ts. */
export function generateRandomSpanId(): string {
  let id = "";
  do {
    id = randomBytes(8).toString("hex"); // 16 hex characters
  } while (/^0+$/.test(id)); // try again if all zeros
  return id;
}

export function makeTraceParent(
  traceId: string,
  spanId: string,
  sampled = true,
): string {
  const version = "00";
  const flags = sampled ? "01" : "00";
  return `${version}-${traceId}-${spanId}-${flags}`;
}
