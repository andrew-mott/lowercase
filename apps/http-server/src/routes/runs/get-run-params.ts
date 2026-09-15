import type { FastifyInstance } from "fastify";
import type { GetRunParamsRes } from "@lcase/types";
import { isRunId } from "../../utils/is-run-id.js";

export const getRunParamsRoute = async (app: FastifyInstance) => {
  app.get<{ Params: { runId: unknown } }>(
    "/:runId/params",
    async (req): Promise<GetRunParamsRes> => {
      const { runId } = req.params;
      if (!isRunId(runId)) return { ok: false, error: "Invalid run id" };

      const runParams = await app.services.run.getRunParams(runId);
      if (!runParams.ok) return { ok: false, error: runParams.error };

      return { ok: true, value: runParams.value };
    },
  );
};
