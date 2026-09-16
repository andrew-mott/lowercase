import type { FastifyInstance } from "fastify";
import type { GetEvalsReq, GetEvalsRes } from "@lcase/types";

export const listEvalsRoute = async (app: FastifyInstance) => {
  app.get<{ Querystring: GetEvalsReq }>(
    "/",
    async (req): Promise<GetEvalsRes> => {
      const { flowId, stepId, exportName, experimentId } = req.query;

      if (isNonEmptyString(experimentId)) {
        const value = await app.services.eval.listByExperimentId(experimentId);
        return { ok: true, value };
      }

      if (
        isNonEmptyString(flowId) &&
        isNonEmptyString(stepId) &&
        isNonEmptyString(exportName)
      ) {
        const value = await app.services.eval.listByTargetShape({
          flowId,
          stepId,
          exportName,
        });
        return { ok: true, value };
      }

      return {
        ok: false,
        error: "Provide either experimentId, or flowId + stepId + exportName",
      };
    },
  );
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
