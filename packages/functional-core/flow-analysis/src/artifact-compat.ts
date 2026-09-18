import type { FlowParamContentType } from "@lcase/types";

// Pure contentType equality -- no format-based fallback. Callers that only
// have a categorical format (upload MIME sniffing, an authored artifact's
// declared format) resolve a concrete contentType up front via
// defaultContentTypeForFormat() instead of relying on this function to
// infer one.
export function isArtifactCompatible(
  contentType: string | undefined,
  type: FlowParamContentType,
): boolean {
  return contentType === type;
}
