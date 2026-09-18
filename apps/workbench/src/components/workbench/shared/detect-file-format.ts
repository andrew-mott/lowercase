import type { ArtifactFormat } from "@lcase/types";

const jsonMimeSet = new Set([
  "application/json",
  "text/json",
  "application/octet-stream",
]);

const textMimeSet = new Set(["text/plain"]);
const markdownMimeSet = new Set(["text/markdown", "text/x-markdown"]);

// mirrors apps/http-server/src/routes/artifacts/post-artifact.ts's
// detectUploadFormat -- keep the two tables in sync if either changes.
// Accepts a plain {name, type} rather than requiring a live File, since
// callers deriving format from an already-persisted-to-Redux breadcrumb
// (name + contentType, no File object) need this too
export function detectFileFormat(
  file: Pick<File, "name" | "type">,
): ArtifactFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json") && jsonMimeSet.has(file.type)) return "json";
  if (name.endsWith(".txt") && textMimeSet.has(file.type)) return "text";
  if (name.endsWith(".md") && markdownMimeSet.has(file.type)) return "markdown";
  return "bytes";
}
