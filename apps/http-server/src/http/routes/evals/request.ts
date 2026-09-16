import type { FastifyInstance } from "fastify";
import type { PostEvalsReq, PostEvalsRes } from "@lcase/types";

export const requestEvalsRoute = async (app: FastifyInstance) => {
  app.post<{ Body: PostEvalsReq }>("/", async (req): Promise<PostEvalsRes> => {
    const {
      targets,
      evalFlowId,
      evalFlowVersionId,
      evalFlowDefHash,
      judgeSystemPromptHash,
      experimentId,
    } = req.body;

    if (!Array.isArray(targets) || targets.length === 0) {
      return { ok: false, error: "Invalid targets" };
    }
    if (!isNonEmptyString(evalFlowId)) {
      return { ok: false, error: "Invalid evalFlowId" };
    }
    if (!isNonEmptyString(evalFlowVersionId)) {
      return { ok: false, error: "Invalid evalFlowVersionId" };
    }
    if (!isNonEmptyString(evalFlowDefHash)) {
      return { ok: false, error: "Invalid evalFlowDefHash" };
    }
    if (!isNonEmptyString(judgeSystemPromptHash)) {
      return { ok: false, error: "Invalid judgeSystemPromptHash" };
    }

    const result = await app.services.eval.startEvalRun({
      targets,
      evalFlowId,
      evalFlowVersionId,
      evalFlowDefHash,
      judgeSystemPromptHash,
      experimentId,
      source: "lowercase://http-server",
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return { ok: true, evalRunId: result.value.evalRunId };
  });
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
