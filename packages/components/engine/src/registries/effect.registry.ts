import { emitFlowAnalyzedFx } from "../effects/emit-flow-analyzed.effect.js";
import { emitFlowCompletedFx } from "../effects/emit-flow-completed.effect.js";
import { emitFlowFailedFx } from "../effects/emit-flow-failed.effect.js";
import { emitJobMcpSubmittedFx } from "../effects/emit-job-mcp-submitted.effect.js";
import { publishJobHttpJsonSubmittedFx } from "../effects/publish-job-httpjson-submitted.effect.js";
import { emitRunCompletedFx } from "../effects/emit-run-completed.effect.js";
import { emitRunDeniedFx } from "../effects/emit-run-denied.effect.js";
import { emitRunFailedFx } from "../effects/emit-run-failed.effect.js";
import { emitRunStartedFx } from "../effects/emit-run-started.effect.js";
import { emitStepCompletedFx } from "../effects/emit-step-completed.effect.js";
import { emitStepFailedFx } from "../effects/emit-step-failed.effect.js";
import { emitStepPlannedFx } from "../effects/emit-step-planned.effect.js";
import { emitStepReusedFx } from "../effects/emit-step-reused.effect.js";
import { emitStepStartedFx } from "../effects/emit-step-started.effect.js";
import { getFlowDefFx } from "../effects/get-flow-def.effect.js";
import { getForkSpec } from "../effects/get-fork-spec.effect.js";
import { getReusableStepDataFx } from "../effects/get-reusable-step-data.effect.js";
import { makeRunPlanFx } from "../effects/make-run-plan.effect.js";
import { resolveBranchValueFx } from "../effects/resolve-branch-value.effect.js";
import { writeContextToDiskFx } from "../effects/write-context-to-disk.effect.js";
import type {
  EffectHandlerDeps,
  EffectHandlerRegistry,
  EmitFlowAnalyzedFx,
  EmitFlowCompletedFx,
  EmitFlowFailedFx,
  EmitJobMcpSubmittedFx,
  PublishJobHttpJsonSubmittedFx,
  EmitRunCompletedFx,
  EmitRunFailedFx,
  EmitRunStartedFx,
  EmitStepCompletedFx,
  EmitStepFailedFx,
  EmitStepPlannedFx,
  EmitStepStartedFx,
  WriteContextToDiskFx,
} from "../engine.types.js";
import type {
  EmitRunDeniedFx,
  EmitStepReusedFx,
  GetFlowDefFx,
  GetForkSpecFx,
  GetReusableStepDataFx,
  MakeRunPlanFx,
  ResolveBranchValueFx,
} from "../types/effect.types.js";

/**
 * Wires up the effect handlers into an object literal key value methods.
 * Keys are the `type` field in effect objects.
 * Wraps effect handles to provide deps to all functions, but expose a version
 * that only takes an effect after wiring.
 * Used in engine to lookup which effect handlers to execute.
 * @param deps EffectHandlerDeps
 * @returns EffectHandlerRegistry object
 */
export function wireEffectHandlers(deps: EffectHandlerDeps) {
  return {
    // flow
    EmitFlowAnalyzed: async (effect: EmitFlowAnalyzedFx) =>
      emitFlowAnalyzedFx(effect, deps),
    EmitFlowCompleted: async (effect: EmitFlowCompletedFx) =>
      emitFlowCompletedFx(effect, deps),
    EmitFlowFailed: async (effect: EmitFlowFailedFx) =>
      emitFlowFailedFx(effect, deps),
    // run
    EmitRunDenied: async (effect: EmitRunDeniedFx) =>
      emitRunDeniedFx(effect, deps),
    EmitRunStarted: async (effect: EmitRunStartedFx) =>
      emitRunStartedFx(effect, deps),
    EmitRunCompleted: async (effect: EmitRunCompletedFx) =>
      emitRunCompletedFx(effect, deps),
    EmitRunFailed: async (effect: EmitRunFailedFx) =>
      emitRunFailedFx(effect, deps),
    // step
    EmitStepPlanned: async (effect: EmitStepPlannedFx) =>
      emitStepPlannedFx(effect, deps),
    EmitStepReused: async (effect: EmitStepReusedFx) => {
      emitStepReusedFx(effect, deps);
    },
    EmitStepStarted: async (effect: EmitStepStartedFx) =>
      emitStepStartedFx(effect, deps),
    EmitStepCompleted: async (effect: EmitStepCompletedFx) =>
      emitStepCompletedFx(effect, deps),
    EmitStepFailed: async (effect: EmitStepFailedFx) =>
      emitStepFailedFx(effect, deps),
    // job
    PublishJobHttpJsonSubmitted: async (
      effect: PublishJobHttpJsonSubmittedFx,
    ) => publishJobHttpJsonSubmittedFx(effect, deps),
    EmitJobMcpSubmitted: async (effect: EmitJobMcpSubmittedFx) =>
      emitJobMcpSubmittedFx(effect, deps),
    // write to disk
    WriteContextToDisk: async (effect: WriteContextToDiskFx) =>
      writeContextToDiskFx(effect, deps),
    // CAS + store lookups
    GetFlowDef: async (effect: GetFlowDefFx) => getFlowDefFx(effect, deps),
    GetForkSpec: async (effect: GetForkSpecFx) => getForkSpec(effect, deps),
    GetReusableStepData: async (effect: GetReusableStepDataFx) =>
      getReusableStepDataFx(effect, deps),
    MakeRunPlan: async (effect: MakeRunPlanFx) => makeRunPlanFx(effect, deps),
    ResolveBranchValue: async (effect: ResolveBranchValueFx) =>
      resolveBranchValueFx(effect, deps),
  } satisfies EffectHandlerRegistry;
}
