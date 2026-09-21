import type { FastifyPluginAsync } from "fastify";
import type { ServicesPort } from "@lcase/ports";
import type { PostRunsReq, PostRunsRes } from "@lcase/types";
import { startInlineRun } from "./inline/start-inline-run.js";
import { isNonEmptyString, validateFlowHash } from "./run-request-fields.js";

export const requestRunsRoute: FastifyPluginAsync<{
  waitTimeoutMs?: number;
}> = async (app, options) => {
  app.post<{ Body: PostRunsReq }>("/", async (req, reply) => {
    // A multipart body carries its inputs inline and is answered as a stream;
    // a JSON body is the request as it has always been.
    if (req.isMultipart()) {
      return startInlineRun({
        services: app.services,
        parts: req.parts(),
        reply,
        waitTimeoutMs: options.waitTimeoutMs,
      });
    }
    return requestJsonRun(app.services, req.body);
  });
};

async function requestJsonRun(
  services: ServicesPort,
  body: PostRunsReq,
): Promise<PostRunsRes> {
  const { flowId, flowVersionId, flowDefHash, simId, forkSpecHash, params } =
    body;
  if (!isNonEmptyString(flowId)) {
    return { ok: false, error: "Invalid flowId" };
  }
  if (!isNonEmptyString(flowVersionId)) {
    return { ok: false, error: "Invalid flowVersionId" };
  }
  const validFlowDefHash = validateFlowHash(flowDefHash);

  if (!validFlowDefHash) return { ok: false, error: "Invalid flowDefHash" };
  if (simId !== undefined && !isNonEmptyString(simId)) {
    return { ok: false, error: "Invalid simId" };
  }

  const runId = services.run.makeRunId();

  try {
    await services.run.requestRun({
      flowId,
      flowVersionId,
      flowDefHash: validFlowDefHash,
      source: "lowercase://http-server",
      runId,
      ...(simId ? { simId } : {}),
      forkSpecHash,
      params,
    });
    return { ok: true, runId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
