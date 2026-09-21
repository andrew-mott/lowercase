import type { FastifyPluginAsync } from "fastify";
import { isRunId } from "../../utils/is-run-id.js";
import { DEFAULT_RUN_WAIT_TIMEOUT_MS, streamRun } from "./stream-run.js";

// Attaches to a run that already exists, whether it is still going or long
// finished. This is how a caller picks the result up again after a dropped
// connection or a timeout.
export const getRunStreamRoute: FastifyPluginAsync<{
  waitTimeoutMs?: number;
}> = async (app, options) => {
  app.get<{ Params: { runId: unknown } }>(
    "/:runId/stream",
    async (req, reply) => {
      const { runId } = req.params;
      if (!isRunId(runId)) {
        return reply.code(400).send({ ok: false, error: "Invalid run id" });
      }

      const detail = await app.services.run.getRunDetail(runId);
      if (!detail.ok) {
        return reply.code(404).send({ ok: false, error: detail.error });
      }

      await streamRun({
        reply,
        run: app.services.run,
        runId,
        timeoutMs: options.waitTimeoutMs ?? DEFAULT_RUN_WAIT_TIMEOUT_MS,
      });
    },
  );
};
