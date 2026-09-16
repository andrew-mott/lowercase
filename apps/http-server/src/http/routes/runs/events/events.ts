import type { GetRunEventsReq, GetRunEventsRes } from "@lcase/types";
import type { FastifyInstance } from "fastify";
import { isRunId } from "../../../utils/is-run-id.js";

export const getRunsEventsListRoute = async (app: FastifyInstance) => {
  app.get<{ Querystring: GetRunEventsReq }>(
    "/",
    async (req): Promise<GetRunEventsRes> => {
      const { runId } = req.query;
      if (!isRunId(runId)) return { ok: false, error: "Invalid Run ID" };

      try {
        const result = await app.services.replay.getAllEvents(runId);
        return { ok: true, events: result.events };
      } catch (err) {
        console.error(err);
        return { ok: false, error: `Error getting events` };
      }
    },
  );
};
