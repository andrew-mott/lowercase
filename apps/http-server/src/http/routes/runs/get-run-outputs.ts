import type { FastifyInstance } from "fastify";
import type { GetRunOutputsRes } from "@lcase/types";
import { isRunId } from "../../utils/is-run-id.js";

export const getRunOutputsRoute = async (app: FastifyInstance) => {
  app.get<{ Params: { runId: unknown } }>(
    "/:runId/outputs",
    async (req): Promise<GetRunOutputsRes> => {
      const { runId } = req.params;
      if (!isRunId(runId)) return { ok: false, error: "Invalid run id" };

      const outputs = await app.services.run.getRunOutputs(runId);
      if (!outputs.ok) return { ok: false, error: outputs.error };

      return { ok: true, outputs: outputs.value };
    },
  );
};
