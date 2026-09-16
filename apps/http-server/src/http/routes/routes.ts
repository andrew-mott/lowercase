import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { listFlowsRoute } from "./flows/get.js";
import { postFlowsRoute } from "./flows/post.js";
import { listRunsRoute } from "./runs/list.js";
import { postFlowsFilesRoute } from "./flows/files/post.js";
import { getFlowDefRoute } from "./flows/get-flow-def.js";
import { requestRunsRoute } from "./runs/request.js";
import { getRunsEventsListRoute } from "./runs/events/events.js";
import { simsListRoute } from "./sims/list.js";
import { postSimsRoute } from "./sims/post.js";
import { getSimSpecRoute } from "./sims/get-sim-spec.js";
import { getRunDetailRoute } from "./runs/get-run-detail.js";
import { getRunParamsRoute } from "./runs/get-run-params.js";
import { getArtifactRoute } from "./artifacts/get-artifact.js";
import { postArtifactRoute } from "./artifacts/post-artifact.js";
import { listArtifactsRoute } from "./artifacts/list-artifacts.js";
import { patchArtifactRoute } from "./artifacts/patch-artifact.js";
import {
  getFlowVersionRoute,
  listFlowVersionsRoute,
} from "./flows/get-versions.js";
import { getCuratedArtifactsForParamRoute } from "./flows/curated-artifacts.js";
import { requestEvalsRoute } from "./evals/request.js";
import { listEvalsRoute } from "./evals/list.js";

export const routes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // api/flows
  await app.register(listFlowsRoute, { prefix: "/api/flows" });
  await app.register(getFlowDefRoute, { prefix: "/api/flows" });
  await app.register(getFlowVersionRoute, { prefix: "/api/flows" });
  await app.register(listFlowVersionsRoute, { prefix: "/api/flows" });
  await app.register(postFlowsRoute, { prefix: "/api/flows" });
  await app.register(postFlowsFilesRoute, { prefix: "/api/flows/files" });
  await app.register(getCuratedArtifactsForParamRoute, {
    prefix: "/api/flows",
  });

  // api/runs
  await app.register(listRunsRoute, { prefix: "/api/runs" }); // get
  await app.register(getRunDetailRoute, { prefix: "/api/runs" });
  await app.register(getRunParamsRoute, { prefix: "/api/runs" });
  await app.register(requestRunsRoute, { prefix: "/api/runs" }); // post

  // api/runs/details
  await app.register(getRunsEventsListRoute, { prefix: "/api/runs/details" }); // get

  // api/evals
  await app.register(requestEvalsRoute, { prefix: "/api/evals" }); // post
  await app.register(listEvalsRoute, { prefix: "/api/evals" }); // get

  // api/sims
  await app.register(simsListRoute, { prefix: "/api/sims" });
  await app.register(postSimsRoute, { prefix: "/api/sims" });
  await app.register(getSimSpecRoute, { prefix: "/api/sims" });

  // api/artifacts
  await app.register(listArtifactsRoute, { prefix: "/api/artifacts" });
  await app.register(getArtifactRoute, { prefix: "/api/artifacts" });
  await app.register(postArtifactRoute, { prefix: "/api/artifacts" });
  await app.register(patchArtifactRoute, { prefix: "/api/artifacts" });
};
