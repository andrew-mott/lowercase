import type { SqlClient } from "@lcase/db-prisma";
import type {
  ArtifactIndex,
  ArtifactListFilter,
  ArtifactListItem,
  ArtifactUpdateMetadata,
  ArtifactWriteContent,
  ArtifactWriteMetadata,
  Result,
} from "@lcase/types";
import type { ArtifactRepositoryPort } from "@lcase/ports";

export type PrismaArtifactRepositoryDb = {
  artifact: Pick<
    SqlClient["artifact"],
    "findUnique" | "findMany" | "update" | "upsert"
  >;
  artifactParamCuration: Pick<SqlClient["artifactParamCuration"], "findMany">;
};

function definedFields<T extends Record<string, unknown>>(
  input: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function toArtifactIndex(artifact: {
  hash: string;
  time: Date;
  label: string | null;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  format: "json" | "text" | "markdown" | "bytes" | null;
  flowId: string | null;
  flowVersionId: string | null;
  curated: boolean;
}): ArtifactIndex {
  return {
    hash: artifact.hash,
    time: artifact.time.toISOString(),
    label: artifact.label ?? undefined,
    filename: artifact.filename ?? undefined,
    contentType: artifact.contentType ?? undefined,
    size: artifact.size ?? undefined,
    format: artifact.format ?? undefined,
    flowId: artifact.flowId ?? undefined,
    flowVersionId: artifact.flowVersionId ?? undefined,
    curated: artifact.curated,
  };
}

function toArtifactListItem(row: {
  hash: string;
  time: Date;
  label: string | null;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  format: "json" | "text" | "markdown" | "bytes" | null;
  flowId: string | null;
  flowVersionId: string | null;
  curated: boolean;
  paramCurations?: { flowVersionId: string; paramName: string }[];
}): ArtifactListItem {
  return {
    artifact: {
      hash: row.hash,
      time: row.time.toISOString(),
      label: row.label ?? undefined,
      filename: row.filename ?? undefined,
      contentType: row.contentType ?? undefined,
      size: row.size ?? undefined,
      format: row.format ?? undefined,
    },
    associations: {
      flowId: row.flowId ?? undefined,
      flowVersionId: row.flowVersionId ?? undefined,
      curated: row.curated,
      paramCurations: (row.paramCurations ?? []).map((c) => ({
        flowVersionId: c.flowVersionId,
        paramName: c.paramName,
      })),
    },
  };
}

export class PrismaArtifactRepository implements ArtifactRepositoryPort {
  constructor(private readonly db: PrismaArtifactRepositoryDb) {}

  async getArtifact(hash: string): Promise<ArtifactIndex | undefined> {
    try {
      const artifact = await this.db.artifact.findUnique({ where: { hash } });
      return artifact ? toArtifactIndex(artifact) : undefined;
    } catch {
      return undefined;
    }
  }

  async getArtifacts(hashes: string[]): Promise<ArtifactIndex[]> {
    if (hashes.length === 0) return [];
    const artifacts = await this.db.artifact.findMany({
      where: { hash: { in: hashes } },
    });
    return artifacts.map(toArtifactIndex);
  }

  async listArtifactHashes(): Promise<string[]> {
    const artifacts = await this.db.artifact.findMany({
      orderBy: [{ time: "desc" }, { hash: "desc" }],
      select: { hash: true },
    });
    return artifacts.map((artifact) => artifact.hash);
  }

  async listArtifacts(
    filter?: ArtifactListFilter,
  ): Promise<ArtifactListItem[]> {
    // `hash`, when given, takes over row-selection entirely -- finds this
    // exact artifact regardless of its own flowId/flowVersionId/curated
    // columns (a worker-produced artifact never has those set). flowId/
    // curated are ignored for row-selection in that case; flowVersionId
    // still independently scopes which paramCurations get included below,
    // same as always.
    const where = filter?.hash
      ? { hash: filter.hash }
      : filter
        ? definedFields(filter)
        : undefined;
    const rows = await this.db.artifact.findMany({
      where,
      orderBy: [{ time: "desc" }, { hash: "desc" }],
      include: {
        paramCurations: filter?.flowVersionId
          ? { where: { flowVersionId: filter.flowVersionId } }
          : false,
      },
    });
    return rows.map(toArtifactListItem);
  }

  /**
   * insert/upsert path -- content-put (worker/system, metadata omitted) and
   * a future user-creation flow (real ArtifactWriteMetadata) both funnel
   * through here. When metadata is omitted, the create/update payload simply
   * has no label/flowId/flowVersionId/curated keys -- Prisma treats a
   * missing key the same as undefined (skip on update, schema-default of
   * curated:false on create), which is what guarantees a worker re-putting
   * byte-identical content can never touch an existing curation.
   *
   * Uses one upsert() with paramCurations expressed as a Prisma nested write
   * (deleteMany + createMany on the relation) rather than a separate
   * $transaction -- Prisma wraps nested writes in their own implicit
   * transaction, and nested writes are Prisma's own documented default for
   * "atomically write a parent plus related rows," not something to reach
   * past. Deliberately keeps Prisma's nested-write vocabulary
   * (deleteMany/createMany) written inline at the call site -- curationRows
   * below stays plain data, never itself shaped like a Prisma instruction.
   */
  async writeArtifact(
    content: ArtifactWriteContent,
    metadata?: ArtifactWriteMetadata,
  ): Promise<Result<ArtifactIndex, string>> {
    try {
      const bareData = {
        time: content.time ? new Date(content.time) : new Date(),
        size: content.size,
        contentType: content.contentType,
        format: content.format,
        filename: content.filename,
      };
      const metadataData = metadata
        ? {
            label: metadata.label,
            flowId: metadata.flowId,
            flowVersionId: metadata.flowVersionId,
            curated: metadata.curated,
          }
        : {};

      let curationFlowVersionId: string | undefined;
      let curationRows:
        { flowVersionId: string; paramName: string }[] | undefined;
      if (metadata?.curated && metadata.paramCurations) {
        const flowVersionId = metadata.flowVersionId;
        curationFlowVersionId = flowVersionId;
        curationRows = metadata.paramCurations.map((paramName) => ({
          flowVersionId,
          paramName,
        }));
      }

      const artifact = await this.db.artifact.upsert({
        where: { hash: content.hash },
        create: {
          hash: content.hash,
          ...bareData,
          ...metadataData,
          ...(curationRows
            ? { paramCurations: { createMany: { data: curationRows } } }
            : {}),
        },
        update: {
          ...bareData,
          ...metadataData,
          ...(curationRows
            ? {
                paramCurations: {
                  deleteMany: { flowVersionId: curationFlowVersionId },
                  createMany: { data: curationRows },
                },
              }
            : {}),
        },
      });
      return { ok: true, value: toArtifactIndex(artifact) };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to write artifact: ${String(error)}`,
      };
    }
  }

  async updateMetadata(
    hash: string,
    metadata: ArtifactUpdateMetadata,
  ): Promise<Result<ArtifactIndex, string>> {
    try {
      const data = {
        label: metadata.label,
        flowId: metadata.flowId,
        flowVersionId: metadata.flowVersionId,
        curated: true,
      };

      if (!metadata.paramCurations) {
        const updated = await this.db.artifact.update({
          where: { hash },
          data,
        });
        return { ok: true, value: toArtifactIndex(updated) };
      }

      const flowVersionId = metadata.flowVersionId;
      const paramCurations = metadata.paramCurations;
      const updated = await this.db.artifact.update({
        where: { hash },
        data: {
          ...data,
          paramCurations: {
            deleteMany: { flowVersionId },
            ...(paramCurations.length > 0
              ? {
                  createMany: {
                    data: paramCurations.map((paramName) => ({
                      flowVersionId,
                      paramName,
                    })),
                  },
                }
              : {}),
          },
        },
      });
      return { ok: true, value: toArtifactIndex(updated) };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to update artifact metadata: ${String(error)}`,
      };
    }
  }

  async listCuratedArtifacts(
    flowVersionId: string,
    paramName: string,
  ): Promise<ArtifactIndex[]> {
    const entries = await this.db.artifactParamCuration.findMany({
      where: { flowVersionId, paramName },
    });
    return this.getArtifacts(entries.map((entry) => entry.artifactHash));
  }
}
