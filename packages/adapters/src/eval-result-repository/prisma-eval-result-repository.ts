import type { SqlClient } from "@lcase/db-prisma";
import type {
  CreateEvalResultInput,
  EvalResultRecord,
  EvalScorePayload,
  Result,
} from "@lcase/types";
import type { EvalResultRepositoryPort } from "@lcase/ports";

export type PrismaEvalResultRepositoryDb = {
  evalResult: Pick<SqlClient["evalResult"], "create" | "findMany">;
};

function toEvalResultRecord(row: {
  id: string;
  targetRunId: string;
  targetStepId: string | null;
  targetExportName: string | null;
  evalRunId: string;
  evalFlowId: string | null;
  evalFlowVersionId: string | null;
  experimentId: string | null;
  overall: number;
  passed: boolean;
  payload: string;
  createdAt: Date;
  targetRun?: { flowVersionId: string | null } | null;
}): EvalResultRecord {
  return {
    id: row.id,
    targetRunId: row.targetRunId,
    targetStepId: row.targetStepId ?? undefined,
    targetExportName: row.targetExportName ?? undefined,
    targetFlowVersionId: row.targetRun?.flowVersionId ?? undefined,
    evalRunId: row.evalRunId,
    evalFlowId: row.evalFlowId ?? undefined,
    evalFlowVersionId: row.evalFlowVersionId ?? undefined,
    experimentId: row.experimentId ?? undefined,
    overall: row.overall,
    passed: row.passed,
    payload: JSON.parse(row.payload) as EvalScorePayload,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PrismaEvalResultRepository implements EvalResultRepositoryPort {
  constructor(private readonly db: PrismaEvalResultRepositoryDb) {}

  async createEvalResult(
    input: CreateEvalResultInput,
  ): Promise<Result<EvalResultRecord, string>> {
    try {
      const created = await this.db.evalResult.create({
        data: {
          targetRunId: input.targetRunId,
          targetStepId: input.targetStepId,
          targetExportName: input.targetExportName,
          evalRunId: input.evalRunId,
          evalFlowId: input.evalFlowId,
          evalFlowVersionId: input.evalFlowVersionId,
          experimentId: input.experimentId,
          overall: input.overall,
          passed: input.passed,
          payload: JSON.stringify(input.payload),
        },
      });
      return { ok: true, value: toEvalResultRecord(created) };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to create eval result: ${String(error)}`,
      };
    }
  }

  async listByExperimentId(experimentId: string): Promise<EvalResultRecord[]> {
    const rows = await this.db.evalResult.findMany({
      where: { experimentId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toEvalResultRecord);
  }

  async listByTargetRunId(targetRunId: string): Promise<EvalResultRecord[]> {
    const rows = await this.db.evalResult.findMany({
      where: { targetRunId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toEvalResultRecord);
  }

  async listByTargetShape(shape: {
    flowId: string;
    stepId: string;
    exportName: string;
  }): Promise<EvalResultRecord[]> {
    const rows = await this.db.evalResult.findMany({
      where: {
        targetStepId: shape.stepId,
        targetExportName: shape.exportName,
        targetRun: { flowId: shape.flowId },
      },
      include: { targetRun: { select: { flowVersionId: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toEvalResultRecord);
  }
}
