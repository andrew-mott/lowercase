import type {
  CloudScope,
  Ref,
  RunDeniedData,
  RunScope,
  StepReusedData,
  StepScope,
} from "@lcase/types";

export type ResolveBranchValueFx = {
  type: "ResolveBranchValue";
  runId: string;
  stepId: string;
  ref: Ref;
  cases: Record<string, string>;
};

export type GetFlowDefFx = {
  type: "GetFlowDef";
  hash: string;
  runId: string;
};
export type GetForkSpecFx = {
  type: "GetForkSpec";
  hash: string;
  runId: string;
};

export type GetReusableStepDataFx = {
  type: "GetReusableStepData";
  parentRunId: string;
  stepIds: string[];
  runId: string;
};

export type MakeRunPlanFx = {
  type: "MakeRunPlan";
  runId: string;
};

export type EmitStepReusedFx = {
  type: "EmitStepReused";
  scope: StepScope & Omit<CloudScope, "source">;
  data: StepReusedData;
  traceId: string;
};

export type EmitRunDeniedFx = {
  type: "EmitRunDenied";
  scope: RunScope & CloudScope;
  data: RunDeniedData;
  traceId: string;
};
