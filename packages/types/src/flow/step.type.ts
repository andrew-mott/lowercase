import type {
  StepBranch,
  StepHttp,
  StepHttpJson,
  StepJoin,
  StepMcp,
  StepParallel,
} from "../generated/index.js";

export type StepDefinition =
  StepMcp | StepHttpJson | StepHttp | StepParallel | StepJoin | StepBranch;
