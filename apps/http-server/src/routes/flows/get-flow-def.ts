import type { FastifyInstance } from "fastify";

export const getFlowDefRoute = async (app: FastifyInstance) => {
  app.get<{ Params: { flowId: unknown } }>("/:flowId", async (req) => {
    const { flowId } = req.params;
    if (!isFlowId(flowId)) {
      return { ok: false, error: "Invalid flow id format" };
    }

    return app.services.flow.getFlowDef(flowId);
  });
};

/**
 * Narrows the type of flow id if is a valid flow id string
 * @param flowId unknown
 * @returns
 */
export function isFlowId(flowId: unknown): flowId is string {
  if (typeof flowId !== "string") return false;
  const regex = /^[a-zA-Z0-9]+$/;
  const match = flowId.match(regex);
  if (!match) return false;
  return true;
}
