import type { ResolvedHttpJsonRequest } from "./protocol/http-json/http-json.types.js";

export type ResourceHint = { kind: "named"; name: string } | { kind: "derive" };

export type ResourceKeyResult =
  { ok: true; resourceKey: string } | { ok: false; message: string };

export type ResourceKeyResolver = (
  request: ResolvedHttpJsonRequest,
  hint?: ResourceHint,
) => ResourceKeyResult;

// Security rule: never derive a resource key from a resolved secret (e.g. an
// Authorization header value) -- a caller needing account-scoped limiting
// must supply a stable named credential-profile hint instead, never the
// resolved secret itself. Same risk class as docs/todo.md's "real
// credentials aren't safe yet" item, applied here rather than reopened.
export const defaultResourceKeyResolver: ResourceKeyResolver = (
  request,
  hint,
) => {
  if (hint?.kind === "named") {
    return { ok: true, resourceKey: `named:${hint.name}` };
  }
  try {
    return {
      ok: true,
      resourceKey: `http-origin:${new URL(request.url).origin}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Could not derive resource key from "${request.url}": ${String(err)}`,
    };
  }
};
