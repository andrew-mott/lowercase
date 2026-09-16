import type { FastifyInstance } from "fastify";
import type { GetRunDetailRes } from "@lcase/types";
import { isRunId } from "../../utils/is-run-id.js";

export const getRunDetailRoute = async (app: FastifyInstance) => {
  app.get<{ Params: { runId: unknown } }>(
    "/:runId",
    async (req): Promise<GetRunDetailRes> => {
      const { runId } = req.params;
      if (!isRunId(runId)) return { ok: false, error: "Invalid run id" };

      const runDetail = await app.services.run.getRunDetail(runId);
      if (!runDetail.ok) return { ok: false, error: runDetail.error };

      return { ok: true, value: runDetail.value };
    },
  );
};
