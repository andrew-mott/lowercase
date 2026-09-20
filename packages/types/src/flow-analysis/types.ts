import type { ContentType, TextSafeContentType } from "../flow/content-type.js";
import type { Result } from "../result.type.js";

type StepId = string;

export type EdgeType = "control" | "join" | "parallel" | "branch";
export type EdgeGate = "always" | "onSuccess" | "onFailure";

export type Edge = {
  startStepId: StepId;
  endStepId: StepId;
  type: EdgeType;
  gate: EdgeGate;
  // only set on "branch" edges: the case key this edge routes on,
  // or isDefault for the mandatory fallback edge
  caseValue?: string;
  isDefault?: true;
};

export type OutEdges = Record<StepId, Edge[]>;
export type InEdges = Record<StepId, Edge[]>;

export type FlowAnalysis = {
  nodes: StepId[];

  inEdges: InEdges;
  outEdges: OutEdges;
  toposort?: string[];

  joinDeps: Record<StepId, StepId[]>;

  problems: FlowProblem[];
  refs: Ref[];
  exportRefsByStep?: Record<StepId, Record<string, ExportRef>>;
};

/*-- problem types for flow analysis to surface in UI/validation --*/
export type UnknownStepReferenceProblem = {
  type: "UnknownStepReference";
  startStepId: StepId;
  endStepId: StepId;
};

export type DuplicateStepIdProblem = {
  type: "DuplicateStepId";
  stepId: StepId;
};

export type SelfReferencedProblem = {
  type: "SelfReferenced";
  stepId: StepId;
};

export type InvalidRefScopeProblem = {
  type: "InvalidRefScope";
  stepId: StepId;
  bindPath: Path;
  refString: string;
};
export type InvalidRefParamNameProblem = {
  type: "InvalidRefParamName";
  ref: Ref;
  paramName: string;
};
export type InvalidExportRefProblem = {
  type: "InvalidExportRef";
  stepId: StepId;
  exportName: string;
  exportValue: string;
};
export type InvalidExportRefPathProblem = {
  type: "InvalidExportRefPath";
  ref: Ref;
  exportName: string;
  sourceStepId: StepId;
};
export type InvalidRefStepIdProblem = {
  type: "InvalidRefStepId";
  ref: Ref;
  targetStepId: StepId;
};
export type InvalidBinaryRefPositionProblem = {
  type: "InvalidBinaryRefPosition";
  ref: Ref;
  paramName: string;
};
// an output's payload isn't a single whole-value reference to a step's
// `output` or `exports.<name>`
export type InvalidFlowOutputPayloadProblem = {
  type: "InvalidFlowOutputPayload";
  outputName: string;
  // the payload exactly as the flow definition wrote it
  payloadDefinition: string;
};
export type InvalidFlowOutputTargetProblem = {
  type: "InvalidFlowOutputTarget";
  outputName: string;
  targetStepId: StepId;
  reason: "unknown-step" | "undeclared-export" | "no-output";
};
export type UnreachableRefProblem = {
  type: "UnreachableRef";
  ref: Ref;
  targetStepId: StepId;
};

// a cycle exists somewhere among the flow's steps; which steps make up the
// cycle isn't determined yet, just that toposort couldn't fully order them
export type CycleDetectedProblem = {
  type: "CycleDetected";
};

export type FlowProblem =
  | UnknownStepReferenceProblem
  | DuplicateStepIdProblem
  | SelfReferencedProblem
  | InvalidRefParamNameProblem
  | InvalidExportRefProblem
  | InvalidExportRefPathProblem
  | InvalidRefStepIdProblem
  | UnreachableRefProblem
  | CycleDetectedProblem
  | InvalidRefScopeProblem
  | InvalidBinaryRefPositionProblem
  | InvalidFlowOutputPayloadProblem
  | InvalidFlowOutputTargetProblem;

export type ProblemType = FlowProblem["type"];

export type Path = Array<string | number>;
export type Ref = {
  valuePath: Path; // path to the value inside the json object
  scope: "steps" | "input" | "env" | "params"; // type of reference
  stepId: StepId; // step id this reference is found in
  bindPath: Path; // path inside the step for where the reference is found
  string: string; // the actual string reference without {{}} characters
  interpolated: boolean; // whether it should be interpolated as a string or not
  hash: string | null;
  // later more robust tranforms should be implemented
  json?: true; // whether to parse this as json, simple transform flag
  paramType?: ContentType;
  exportType?: TextSafeContentType;
};

export type ExportRef = {
  exportName: string;
  valuePath: Path;
  scope: "output";
  string: string;
  type: TextSafeContentType;
  schema?: Record<string, unknown>;
};

/*-- what a flow output resolved to for one run --*/
export type FlowOutputSuccess = { hash: string };
export type FlowOutputError = { reason: "not-produced" | "step-failed" };
export type FlowOutputResult = Result<FlowOutputSuccess, FlowOutputError>;
