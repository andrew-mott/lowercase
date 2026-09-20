import type {
  ContentKind,
  ContentType,
  TextSafeContentType,
} from "@lcase/types";

// A declared type ending in `/*` (`audio/*`) stands for a family of content
// types rather than one. Only that whole-subtype form is a pattern; anything
// fancier (`audio/x-*`, `*/*`) is deliberately not supported until a flow
// needs it.
export function isContentTypePattern(type: ContentType): boolean {
  return type.length > 2 && type.endsWith("/*") && !type.startsWith("*");
}

// Content-type matching only -- no format-based fallback. Callers that only
// have a categorical format (upload MIME sniffing, an authored artifact's
// declared format) resolve a concrete contentType up front via
// defaultContentTypeForFormat() instead of relying on this function to
// infer one. A declared pattern matches any subtype of its type; anything
// else is exact equality.
export function isArtifactCompatible(
  contentType: string | undefined,
  type: ContentType,
): boolean {
  if (contentType === undefined) return false;
  if (isContentTypePattern(type)) {
    // keep the slash in the prefix so `audio/*` can't match `audiobook/x`
    return contentType.startsWith(type.slice(0, -1));
  }
  return contentType === type;
}

// A plain `===` chain against a ContentType doesn't narrow reliably -- the
// `string & {}` branch makes TS's control-flow analysis give up -- so this
// is a real type guard, not just a convenience wrapper.
export function isTextSafeContentType(
  contentType: ContentType,
): contentType is TextSafeContentType {
  return (
    contentType === "application/json" ||
    contentType === "text/plain" ||
    contentType === "text/markdown"
  );
}

// Exact match on application/json; prefix match on text/ for text, which
// follows MIME convention and needs no whitelist as new text subtypes show
// up; everything else binary. A real application/* text format
// (application/xml, application/x-yaml) stays binary until something
// actually needs it, the same way application/json earned its own case.
export function classifyContentType(contentType: string): ContentKind {
  if (contentType === "application/json") return "json";
  if (contentType.startsWith("text/")) return "text";
  return "binary";
}
