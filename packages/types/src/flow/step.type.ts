import type { StepHttpJson } from "./http-json.step.js";
import type { StepJoin } from "./join.step.js";
import type { StepMcp } from "./mcp.step.js";
import type { StepParallel } from "./parallel.step.js";
import type { StepBranch } from "./branch.step.js";
import type { StepHttp } from "../generated/http.step.gen.js";

export type StepDefinition =
  StepMcp | StepHttpJson | StepHttp | StepParallel | StepJoin | StepBranch;
