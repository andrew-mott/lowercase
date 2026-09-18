import type { FlowParamContentType } from "@lcase/types";

// mirrors apps/http-server/src/routes/artifacts/post-artifact.ts's
// detectAuthoredFormat -- keep the two in sync if either changes. Return
// type is deliberately narrower than ArtifactFormat -- "bytes" is never a
// possible outcome here, unlike the upload path's detectFileFormat
export function detectAuthoredFormat(
  contentType: FlowParamContentType,
): "json" | "text" | "markdown" {
  switch (contentType) {
    case "application/json":
      return "json";
    case "text/plain":
      return "text";
    case "text/markdown":
      return "markdown";
  }
}
