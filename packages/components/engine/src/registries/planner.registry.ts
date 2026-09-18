import type { PlannerRegistry } from "../engine.types.js";
import { branchValueResolvedPlanner } from "../planners/branch-value-resolved.planner.js";
import { flowDefResultPlanner } from "../planners/flow-def-result.planner.js";
import { forkSpecResultPlanner } from "../planners/fork-spec-result.planner.js";
import { jobFinishedPlanner } from "../planners/job-finished.planner.js";
import { makeRunPlanPlanner } from "../planners/make-run-plan.planner.js";
import { runFinishedPlanner } from "../planners/run-finished.planner.js";
import { reusableStepDataResultPlanner } from "../planners/reusable-step-data-result.planner.js";
import { runRequestedPlanner } from "../planners/run-requested.planner.js";
import { runStartedPlanner } from "../planners/run-started.planner.js";
import { stepFinishedPlanner } from "../planners/step-finished.planner.js";
import { stepPlannedPlanner } from "../planners/step-planned.planner.js";
import { stepStartedPlanner } from "../planners/step-started.planner.js";

/**
 * Simple object literal for mapping message `type` fields to planner functions.
 * Used in engine to pull the correct function for a message type.
 */
export const planners: PlannerRegistry = {
  FlowDefResult: flowDefResultPlanner,
  ForkSpecResult: forkSpecResultPlanner,
  MakeRunPlan: makeRunPlanPlanner,
  ReusableStepDataResult: reusableStepDataResultPlanner,
  RunRequested: runRequestedPlanner,
  RunStarted: runStartedPlanner,
  RunFinished: runFinishedPlanner,
  StepPlanned: stepPlannedPlanner,
  StepStarted: stepStartedPlanner,
  StepFinished: stepFinishedPlanner,
  JobFinished: jobFinishedPlanner,
  BranchValueResolved: branchValueResolvedPlanner,
};
