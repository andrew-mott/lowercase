import type { FastifyInstance } from "fastify";
import type { PostRunsReq, PostRunsRes } from "@lcase/types";

export const requestRunsRoute = async (app: FastifyInstance) => {
  app.post<{ Body: PostRunsReq }>("/", async (req): Promise<PostRunsRes> => {
    const { flowId, flowVersionId, flowDefHash, simId, forkSpecHash, params } =
      req.body;
    if (!isNonEmptyString(flowId)) {
      return { ok: false, error: "Invalid flowId" };
    }
    if (!isNonEmptyString(flowVersionId)) {
      return { ok: false, error: "Invalid flowVersionId" };
    }
    const validFlowDefHash = validateFlowHash(flowDefHash);

    if (!validFlowDefHash) return { ok: false, error: "Invalid flowDefHash" };
    if (simId !== undefined && !isNonEmptyString(simId)) {
      return { ok: false, error: "Invalid simId" };
    }

    const runId = app.services.run.makeRunId();

    try {
      await app.services.run.requestRun({
        flowId,
        flowVersionId,
        flowDefHash: validFlowDefHash,
        source: "lowercase://http-server",
        runId,
        ...(simId ? { simId } : {}),
        forkSpecHash,
        params,
      });
      return { ok: true, runId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
};

export function validateFlowHash(hash: unknown) {
  if (typeof hash !== "string") return;
  const regex = /^[a-zA-Z0-9]+$/;
  const match = hash.match(regex);
  if (!match) return;
  return match[0];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
