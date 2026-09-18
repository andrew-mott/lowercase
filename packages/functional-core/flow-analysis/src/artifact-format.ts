import type { ArtifactFormat } from "@lcase/types";

// Inverse of inferFormatFromContentType below. Used wherever a real
// contentType isn't reliably available up front (an authored artifact's
// declared format, a browser-sniffed upload) but a compatibility check
// still needs a concrete contentType to compare against.
export function defaultContentTypeForFormat(format: ArtifactFormat): string {
  switch (format) {
    case "json":
      return "application/json";
    case "markdown":
      return "text/markdown";
    case "text":
      return "text/plain";
    case "bytes":
      return "application/octet-stream";
  }
}

// Inverse of defaultContentTypeForFormat above. Used to translate a real,
// already-known contentType (e.g. from ArtifactReaderPort's AutoLoadResult)
// back into the legacy ArtifactFormat bucket some callers still expect.
export function inferFormatFromContentType(
  contentType: string,
): ArtifactFormat {
  if (contentType === "application/json") return "json";
  if (contentType === "text/markdown") return "markdown";
  if (contentType.startsWith("text/")) return "text";
  return "bytes";
}
