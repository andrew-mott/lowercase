import type { ArtifactRepositoryPort } from "@lcase/ports";
import type {
  ArtifactIndex,
  ArtifactListItem,
  ArtifactUpdateMetadata,
  ArtifactWriteContent,
  ArtifactWriteMetadata,
} from "@lcase/types";

// A genuine in-memory ArtifactRepositoryPort -- implements every method for
// real, even ones a given test doesn't exercise, matching this codebase's
// newer no-`as unknown as X` bar. Simplified where the writer's own tests
// never touch a method's real business rules (e.g. paramCurations tracking),
// but every method is still a real function satisfying the real signature.
export function createFakeArtifactRepositoryPort() {
  const rows = new Map<string, ArtifactIndex>();

  function toIndex(
    content: ArtifactWriteContent,
    metadata?: ArtifactWriteMetadata,
  ): ArtifactIndex {
    const base: ArtifactIndex = {
      hash: content.hash,
      time: content.time ?? new Date().toISOString(),
      size: content.size,
      contentType: content.contentType,
      format: content.format,
      filename: content.filename,
    };
    if (!metadata) return base;
    return {
      ...base,
      curated: metadata.curated,
      label: metadata.label ?? undefined,
      flowId: metadata.flowId ?? undefined,
      flowVersionId: metadata.curated
        ? (metadata.flowVersionId ?? undefined)
        : undefined,
    };
  }

  function toListItem(index: ArtifactIndex): ArtifactListItem {
    const { flowId, flowVersionId, curated, ...artifact } = index;
    return {
      artifact,
      associations: {
        flowId,
        flowVersionId,
        curated: !!curated,
        paramCurations: [],
      },
    };
  }

  const repository: ArtifactRepositoryPort = {
    writeArtifact(content, metadata) {
      const index = toIndex(content, metadata);
      rows.set(content.hash, index);
      return Promise.resolve({ ok: true, value: index });
    },
    getArtifact(hash) {
      return Promise.resolve(rows.get(hash));
    },
    getArtifacts(hashes) {
      return Promise.resolve(
        hashes
          .map((hash) => rows.get(hash))
          .filter((row): row is ArtifactIndex => row !== undefined),
      );
    },
    listArtifactHashes() {
      return Promise.resolve([...rows.keys()]);
    },
    listArtifacts(filter) {
      let values = [...rows.values()];
      if (filter?.hash) {
        values = values.filter((row) => row.hash === filter.hash);
      } else {
        if (filter?.flowId) {
          values = values.filter((row) => row.flowId === filter.flowId);
        }
        if (filter?.flowVersionId) {
          values = values.filter(
            (row) => row.flowVersionId === filter.flowVersionId,
          );
        }
        if (filter?.curated !== undefined) {
          values = values.filter((row) => !!row.curated === filter.curated);
        }
      }
      return Promise.resolve(values.map(toListItem));
    },
    updateMetadata(hash, metadata: ArtifactUpdateMetadata) {
      const existing = rows.get(hash);
      if (!existing) {
        return Promise.resolve({ ok: false, error: `not found: ${hash}` });
      }
      const updated: ArtifactIndex = {
        ...existing,
        ...(metadata.label !== undefined
          ? { label: metadata.label ?? undefined }
          : {}),
        ...(metadata.flowId !== undefined
          ? { flowId: metadata.flowId ?? undefined }
          : {}),
        ...(metadata.flowVersionId !== undefined
          ? { flowVersionId: metadata.flowVersionId ?? undefined }
          : {}),
      };
      rows.set(hash, updated);
      return Promise.resolve({ ok: true, value: updated });
    },
    listCuratedArtifacts(flowVersionId, _paramName) {
      return Promise.resolve(
        [...rows.values()].filter(
          (row) => row.curated && row.flowVersionId === flowVersionId,
        ),
      );
    },
  };

  return { repository, rows };
}
