import type { FastifyInstance } from "fastify";
import type { PostSimsReq, PostSimsRes } from "@lcase/types";

export const postSimsRoute = async (app: FastifyInstance) => {
  app.post<{ Body: PostSimsReq }>("/", async (req): Promise<PostSimsRes> => {
    const { flowId, flowVersionId, parentRunId, reuse, name, description } =
      req.body;
    if (!flowId) return { ok: false, error: "Must specify a flow id" };
    if (!flowVersionId) {
      return { ok: false, error: "Must specify a flow version id" };
    }
    if (!reuse) return { ok: false, error: "Must specific steps to reuse" };
    if (!parentRunId)
      return { ok: false, error: "Must specify a parent run id." };

    const result = await app.services.sim.saveSim({
      flowId,
      flowVersionId,
      name,
      description,
      forkSpec: { parentRunId, reuse },
    });

    return result;
  });
};
