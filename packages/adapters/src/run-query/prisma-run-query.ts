import type { SqlClient } from "@lcase/db-prisma";
import type { ArtifactRepositoryPort, RunQueryPort } from "@lcase/ports";
import type {
  FlowRecord,
  FlowVersionRecord,
  ReusableRunStepData,
  Result,
  RunDetail,
  RunListItem,
  RunParamSelection,
  RunRecord,
  RunStatus,
  RunStepExportRecord,
  RunStepProjectionRecord,
} from "@lcase/types";

export type PrismaRunQueryDb = {
  run: Pick<SqlClient["run"], "findUnique" | "findMany">;
  runStepProjection: Pick<SqlClient["runStepProjection"], "findMany">;
  runStepExport: Pick<SqlClient["runStepExport"], "findMany">;
  runParam: Pick<SqlClient["runParam"], "findMany">;
  flowVersion: Pick<
    SqlClient["flowVersion"],
    "findUnique" | "findFirst" | "findMany"
  >;
};

function toRunStatus(status: string): RunStatus {
  switch (status) {
    case "requested":
    case "started":
    case "completed":
    case "failed":
      return status;
    default:
      throw new Error(`Unknown run status: ${status}`);
  }
}

function toRunRecord(run: {
  id: string;
  traceId: string;
  status: string;
  source: string;
  flowId: string | null;
  flowVersionId: string | null;
  flowDefHash: string;
  simId: string | null;
  parentRunId: string | null;
  forkSpecHash: string | null;
  startTime: Date | null;
  endTime: Date | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
}): RunRecord {
  return {
    id: run.id,
    traceId: run.traceId,
    status: toRunStatus(run.status),
    source: run.source,
    flowId: run.flowId ?? undefined,
    flowVersionId: run.flowVersionId ?? undefined,
    flowDefHash: run.flowDefHash,
    simId: run.simId ?? undefined,
    parentRunId: run.parentRunId ?? undefined,
    forkSpecHash: run.forkSpecHash ?? undefined,
    startTime: run.startTime?.toISOString(),
    endTime: run.endTime?.toISOString(),
    duration: run.duration ?? undefined,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function toFlowRecord(flow: {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
}): FlowRecord {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description ?? undefined,
    kind: flow.kind === "eval" ? "eval" : "business",
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  };
}

function toFlowVersionRecord(version: {
  id: string;
  flowId: string;
  sequence: number;
  definitionHash: string;
  versionLabel: string | null;
  description: string | null;
  createdAt: Date;
}): FlowVersionRecord {
  return {
    id: version.id,
    flowId: version.flowId,
    sequence: version.sequence,
    definitionHash: version.definitionHash,
    versionLabel: version.versionLabel ?? undefined,
    description: version.description ?? undefined,
    createdAt: version.createdAt.toISOString(),
  };
}

function toRunStepProjectionRecord(
  step: {
    runId: string;
    stepId: string;
    status: string | null;
    startTime: Date | null;
    endTime: Date | null;
    duration: number | null;
    reusedTime: Date | null;
    wasReused: boolean | null;
    outputHash: string | null;
  },
  exports: RunStepExportRecord[],
): RunStepProjectionRecord {
  return {
    runId: step.runId,
    stepId: step.stepId,
    status: step.status ?? undefined,
    startTime: step.startTime?.toISOString(),
    endTime: step.endTime?.toISOString(),
    duration: step.duration ?? undefined,
    reusedTime: step.reusedTime?.toISOString(),
    wasReused: step.wasReused ?? undefined,
    outputHash: step.outputHash ?? undefined,
    exports: exports.length > 0 ? exports : undefined,
  };
}

type FlowVersionLookup = {
  id: string;
  flowId: string;
  sequence: number;
  definitionHash: string;
  versionLabel: string | null;
  description: string | null;
  createdAt: Date;
  flow: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
};

function toRunListItem(
  run: RunRecord,
  flowVersion: FlowVersionLookup | undefined,
): RunListItem {
  return {
    runId: run.id,
    flowName: flowVersion?.flow.name ?? "Unknown Flow",
    flowVersion: flowVersion?.versionLabel ?? "unknown",
    flowDefHash: run.flowDefHash,
    startTime: run.startTime,
    endTime: run.endTime,
    duration: run.duration,
    forkSpecHash: run.forkSpecHash,
    parentId: run.parentRunId,
  };
}

export class PrismaRunQuery implements RunQueryPort {
  constructor(
    private readonly db: PrismaRunQueryDb,
    private readonly artifactRepository: ArtifactRepositoryPort,
  ) {}

  async listRuns(): Promise<RunListItem[]> {
    return this.#listWhere({});
  }

  async listByFlowVersionId(flowVersionId: string): Promise<RunListItem[]> {
    return this.#listWhere({ flowVersionId });
  }

  async #listWhere(
    where: NonNullable<
      Parameters<PrismaRunQueryDb["run"]["findMany"]>[0]
    >["where"],
  ): Promise<RunListItem[]> {
    const runs = await this.db.run.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const flowDefHashes = [...new Set(runs.map((run) => run.flowDefHash))];
    const flowVersionIds = [
      ...new Set(
        runs
          .map((run) => run.flowVersionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const flowVersions = await this.db.flowVersion.findMany({
      where:
        flowVersionIds.length > 0
          ? {
              OR: [
                { id: { in: flowVersionIds } },
                { definitionHash: { in: flowDefHashes } },
              ],
            }
          : { definitionHash: { in: flowDefHashes } },
      include: { flow: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const byDefinitionHash = new Map<string, FlowVersionLookup>();
    const byId = new Map<string, FlowVersionLookup>();
    for (const version of flowVersions) {
      if (!byId.has(version.id)) {
        byId.set(version.id, version);
      }
      if (!byDefinitionHash.has(version.definitionHash)) {
        byDefinitionHash.set(version.definitionHash, version);
      }
    }

    return runs.map((run) =>
      toRunListItem(
        toRunRecord(run),
        (run.flowVersionId ? byId.get(run.flowVersionId) : undefined) ??
          byDefinitionHash.get(run.flowDefHash),
      ),
    );
  }

  async getRunDetail(runId: string): Promise<Result<RunDetail, string>> {
    try {
      const run = await this.db.run.findUnique({ where: { id: runId } });
      if (!run) return { ok: false, error: `Run not found: ${runId}` };

      const steps = await this.db.runStepProjection.findMany({
        where: { runId },
        orderBy: [{ stepId: "asc" }],
      });

      const flowVersion = run.flowVersionId
        ? await this.db.flowVersion.findUnique({
            where: { id: run.flowVersionId },
            include: { flow: true },
          })
        : await this.db.flowVersion.findFirst({
            where: { definitionHash: run.flowDefHash },
            include: { flow: true },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });

      const [paramRows, exportRows] = await Promise.all([
        this.db.runParam.findMany({ where: { runId } }),
        this.db.runStepExport.findMany({ where: { runId } }),
      ]);

      const allHashes = [
        ...new Set([
          ...paramRows.map((row) => row.artifactHash),
          ...exportRows.map((row) => row.artifactHash),
        ]),
      ];
      const artifacts = await this.artifactRepository.getArtifacts(allHashes);
      const artifactByHash = new Map(
        artifacts.map((artifact) => [artifact.hash, artifact] as const),
      );

      const params: RunParamSelection[] = paramRows
        .map((row) => ({
          name: row.name,
          artifactHash: row.artifactHash,
          artifact: artifactByHash.get(row.artifactHash),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const exportsByStepId = new Map<string, RunStepExportRecord[]>();
      for (const row of exportRows) {
        const list = exportsByStepId.get(row.stepId) ?? [];
        list.push({
          name: row.name,
          artifactHash: row.artifactHash,
          artifact: artifactByHash.get(row.artifactHash),
        });
        exportsByStepId.set(row.stepId, list);
      }
      for (const list of exportsByStepId.values()) {
        list.sort((a, b) => a.name.localeCompare(b.name));
      }

      return {
        ok: true,
        value: {
          run: toRunRecord(run),
          steps: steps.map((step) =>
            toRunStepProjectionRecord(
              step,
              exportsByStepId.get(step.stepId) ?? [],
            ),
          ),
          params: params.length > 0 ? params : undefined,
          flow: flowVersion ? toFlowRecord(flowVersion.flow) : undefined,
          flowVersion: flowVersion
            ? toFlowVersionRecord(flowVersion)
            : undefined,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to read run detail: ${String(error)}`,
      };
    }
  }

  async getReusableStepData(
    parentRunId: string,
    stepIds: string[],
  ): Promise<Result<Record<string, ReusableRunStepData>, string>> {
    try {
      const run = await this.db.run.findUnique({
        where: { id: parentRunId },
        select: { id: true },
      });
      if (!run) {
        return { ok: false, error: `Run not found: ${parentRunId}` };
      }

      const uniqueStepIds = [...new Set(stepIds)];
      const steps = await this.db.runStepProjection.findMany({
        where: {
          runId: parentRunId,
          stepId: { in: uniqueStepIds },
        },
        orderBy: [{ stepId: "asc" }],
      });

      if (steps.length !== uniqueStepIds.length) {
        const foundStepIds = new Set(steps.map((step) => step.stepId));
        const missingStepId = uniqueStepIds.find(
          (stepId) => !foundStepIds.has(stepId),
        );
        return {
          ok: false,
          error: `Reusable step data not found for stepId: ${missingStepId ?? "unknown"}`,
        };
      }

      const exportRows = await this.db.runStepExport.findMany({
        where: { runId: parentRunId, stepId: { in: uniqueStepIds } },
      });
      const exportHashesByStepId = new Map<string, Record<string, string>>();
      for (const row of exportRows) {
        const map = exportHashesByStepId.get(row.stepId) ?? {};
        map[row.name] = row.artifactHash;
        exportHashesByStepId.set(row.stepId, map);
      }

      return {
        ok: true,
        value: Object.fromEntries(
          steps.map((step) => [
            step.stepId,
            {
              stepId: step.stepId,
              status: step.status ?? undefined,
              outputHash: step.outputHash ?? undefined,
              exportHashes: exportHashesByStepId.get(step.stepId),
            } satisfies ReusableRunStepData,
          ]),
        ),
      };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to read reusable step data: ${String(error)}`,
      };
    }
  }
}
