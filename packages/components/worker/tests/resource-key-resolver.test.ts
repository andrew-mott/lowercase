import { describe, expect, it } from "vitest";
import { defaultResourceKeyResolver } from "../src/resource-key-resolver.js";
import type { ResolvedHttpJsonRequest } from "../src/protocol/http-json/http-json.types.js";

function makeRequest(url: string): ResolvedHttpJsonRequest {
  return { url, method: "GET", headers: {} };
}

describe("defaultResourceKeyResolver", () => {
  it("derives an origin-based key when no hint is given", () => {
    const result = defaultResourceKeyResolver(
      makeRequest("https://api.example.com/v1/users/1"),
    );
    expect(result).toEqual({
      ok: true,
      resourceKey: "http-origin:https://api.example.com",
    });
  });

  it("derives the same origin-based key for {kind: 'derive'} as for no hint", () => {
    const request = makeRequest("https://api.example.com/v1/users/2");
    const withoutHint = defaultResourceKeyResolver(request);
    const withDeriveHint = defaultResourceKeyResolver(request, {
      kind: "derive",
    });
    expect(withDeriveHint).toEqual(withoutHint);
  });

  it("uses a named hint independent of the URL", () => {
    const result = defaultResourceKeyResolver(
      makeRequest("https://api.example.com/v1/users/1"),
      { kind: "named", name: "openai-primary" },
    );
    expect(result).toEqual({ ok: true, resourceKey: "named:openai-primary" });
  });

  it("returns ok:false for a malformed URL", () => {
    const result = defaultResourceKeyResolver(makeRequest("not a url"));
    expect(result.ok).toBe(false);
  });

  it("two different paths on the same origin share one key", () => {
    const a = defaultResourceKeyResolver(
      makeRequest("https://api.example.com/v1/a"),
    );
    const b = defaultResourceKeyResolver(
      makeRequest("https://api.example.com/v2/b"),
    );
    expect(a).toEqual(b);
  });
});
