import { vi } from "vitest";

export function createFakeFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) =>
    handler(String(url), init),
  );
  return { fetchFn, fetch: fetchFn as unknown as typeof fetch };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
