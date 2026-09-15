import type { GetSimSpecReq, GetSimSpecRes } from "@lcase/types";
import type { FastifyInstance } from "fastify";
import { isHash } from "../../utils/is-hash.js";

export const getSimSpecRoute = async (app: FastifyInstance) => {
  app.get<{ Params: GetSimSpecReq }>(
    "/:simId",
    async (req): Promise<GetSimSpecRes> => {
      const { simId } = req.params;
      if (!isHash(simId)) return { ok: false, error: "Invalid sim id" };
      return app.services.sim.getSim(simId);
    },
  );
};
