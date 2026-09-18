import type { ArtifactListItem } from "@lcase/types";

export function titleFor(item: ArtifactListItem) {
  return (
    item.artifact.label ||
    item.artifact.filename ||
    `${item.artifact.hash.slice(0, 10)}...`
  );
}
