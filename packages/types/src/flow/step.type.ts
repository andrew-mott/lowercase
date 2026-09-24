import type { StepMcp } from "./mcp.step.js";
import type {
  StepBranch,
  StepHttp,
  StepHttpJson,
  StepJoin,
  StepParallel,
} from "../generated/index.js";

export type StepDefinition =
  StepMcp | StepHttpJson | StepHttp | StepParallel | StepJoin | StepBranch;
