import type {
  ArtifactReaderPort,
  EmitterFactoryPort,
  EventBusPort,
  RunQueryPort,
} from "@lcase/ports";
import type { MessagePublisher } from "@lcase/ports";
import type {
  AnyEvent,
  CloudScope,
  FlowAnalyzedData,
  FlowCompletedData,
  FlowDefinition,
  FlowFailedData,
  FlowScope,
  JobCompletedEvent,
  JobFailedEvent,
  JobHttpJsonSubmittedData,
  JobMcpSubmittedData,
  JobScope,
  RunCompletedData,
  RunFailedData,
  RunScope,
  RunStartedData,
  StepCompletedData,
  StepFailedData,
  StepPlannedData,
  StepScope,
  StepStartedData,
} from "@lcase/types";
import type { RunContext } from "@lcase/types";
import type {
  BranchValueResolvedMsg,
  FlowDefResultMsg,
  ForkSpecResultMsg,
  MakeRunPlanMsg,
  ReusableStepDataResultMsg,
  RunRequestedMsg,
  StepFinishedMsg,
  StepPlannedMsg,
  StepStartedMsg,
} from "./types/message.types.js";
import type {
  EmitRunDeniedFx,
  EmitStepReusedFx,
  GetFlowDefFx,
  GetForkSpecFx,
  GetReusableStepDataFx,
  MakeRunPlanFx,
  ResolveBranchValueFx,
} from "./types/effect.types.js";

type FlowId = string;
export type EngineState = {
  runs: Record<string, RunContext>;
  flows: Record<FlowId, FlowContext>;
};

export type FlowContext = {
  runIds: Record<string, boolean>;
  definition: FlowDefinition;
};
export type Patch = Partial<EngineState>;

// messages
export type FlowSubmittedMsg = {
  type: "FlowSubmitted";
  event: AnyEvent<"flow.submitted">;
};

export type RunStartedMsg = {
  type: "RunStarted";
  event: AnyEvent<"run.started">;
};

export type StepReadyToStartMsg = {
  type: "StepReadyToStart";
  runId: string;
  stepId: string;
};

export type StartHttpJsonStepMsg = {
  type: "StartHttpjsonStep";
  runId: string;
  stepId: string;
};
export type StartMcpStepMsg = {
  type: "StartMcpStep";
  runId: string;
  stepId: string;
};

export type StartParallelMsg = {
  type: "StartParallel";
  runId: string;
  stepId: string;
};

export type JobCompletedMsg = {
  type: "JobCompleted";
  event: JobCompletedEvent;
};
export type JobFinishedMsg = {
  type: "JobFinished";
  event: JobCompletedEvent | JobFailedEvent;
};

export type JobFailedMsg = {
  type: "JobFailed";
  event: JobFailedEvent;
};
export type FlowCompletedMsg = {
  type: "FlowCompleted";
  event: AnyEvent<"flow.completed"> | AnyEvent<"flow.failed">;
};
export type RunFinishedMsg = {
  type: "RunFinished";
  event: AnyEvent<"run.completed"> | AnyEvent<"run.failed">;
};
export type FlowFailedMsg = {
  type: "FlowFailed";
  runId: string;
  stepId: string;
};
export type StartJoinMsg = {
  type: "StartJoin";
  event: AnyEvent<"step.started">;
  runId: string;
  stepId: string;
  joinStepId: string;
};
export type UpdateJoinMsg = {
  type: "UpdateJoin";
  runId: string;
  stepId: string;
  joinStepId: string;
};

export type EngineMessage =
  | FlowDefResultMsg
  | ForkSpecResultMsg
  | ReusableStepDataResultMsg
  | MakeRunPlanMsg
  | RunRequestedMsg
  | RunStartedMsg
  | RunFinishedMsg
  | StepPlannedMsg
  | StepStartedMsg
  | StepFinishedMsg
  | JobFinishedMsg
  | BranchValueResolvedMsg;

export type MessageType = EngineMessage["type"];

// effects
export type EmitEventFx = {
  type: "EmitEvent";
  eventType: string;
  data: unknown;
};
export type EmitFlowAnalyzedFx = {
  type: "EmitFlowAnalyzed";
  scope: FlowScope & CloudScope;
  data: FlowAnalyzedData;
  traceId: string;
};
export type EmitRunStartedFx = {
  type: "EmitRunStarted";
  scope: RunScope & CloudScope;
  data: RunStartedData;
  traceId: string;
};
export type EmitStepPlannedFx = {
  type: "EmitStepPlanned";
  scope: StepScope & Omit<CloudScope, "source">;
  data: StepPlannedData;
  traceId: string;
};
export type EmitStepStartedFx = {
  type: "EmitStepStarted";
  scope: StepScope & Omit<CloudScope, "source">;
  data: StepStartedData;
  traceId: string;
};

export type EmitJoinStepStartedFx = {
  type: "EmitJoinStepStarted";
  scope: StepScope & CloudScope;
  data: StepStartedData;
  traceId: string;
};
export type EmitStepCompletedFx = {
  type: "EmitStepCompleted";
  scope: StepScope & CloudScope;
  data: StepCompletedData;
  traceId: string;
};
export type EmitStepFailedFx = {
  type: "EmitStepFailed";
  scope: StepScope & CloudScope;
  data: StepFailedData;
  traceId: string;
};
// "Publish", not "Emit": everywhere else in this package Emit means putting an
// event on the bus through an EmitterFactory emitter. This builds one canonical
// Message and hands it to a topic, which is a different act with a
// different failure mode -- admission can be refused.
//
// One effect, not a pair. The submitted Message is both the observability
// record and the dispatch, so there is nothing left for a second effect to keep
// correlated with the first.
export type PublishJobHttpJsonSubmittedFx = {
  type: "PublishJobHttpJsonSubmitted";
  scope: JobScope & Omit<CloudScope, "source">;
  data: JobHttpJsonSubmittedData;
  traceId: string;
};

export type EmitJobMcpSubmittedFx = {
  type: "EmitJobMcpSubmitted";
  scope: Omit<JobScope, "jobid"> & Omit<CloudScope, "source">;
  data: JobMcpSubmittedData;
  traceId: string;
};

export type EmitRunCompletedFx = {
  type: "EmitRunCompleted";
  scope: RunScope & CloudScope;
  data: RunCompletedData;
  traceId: string;
};
export type EmitRunFailedFx = {
  type: "EmitRunFailed";
  scope: RunScope & CloudScope;
  data: RunFailedData;
  traceId: string;
};

export type EmitFlowFailedFx = {
  type: "EmitFlowFailed";
  scope: FlowScope & CloudScope;
  data: FlowFailedData;
  traceId: string;
};
export type EmitFlowCompletedFx = {
  type: "EmitFlowCompleted";
  scope: FlowScope & CloudScope;
  data: FlowCompletedData;
  traceId: string;
};
export type WriteContextToDiskFx = {
  type: "WriteContextToDisk";
  context: RunContext;
  runId: string;
};
export type DispatchInternalFx = {
  type: "DispatchInternal";
  message: EngineMessage;
};

export type EngineEffect =
  | EmitRunStartedFx
  | PublishJobHttpJsonSubmittedFx
  | EmitJobMcpSubmittedFx
  | EmitRunDeniedFx
  | EmitRunCompletedFx
  | EmitRunFailedFx
  | EmitStepPlannedFx
  | EmitStepReusedFx
  | EmitStepStartedFx
  | EmitStepCompletedFx
  | EmitStepFailedFx
  | EmitFlowAnalyzedFx
  | EmitFlowCompletedFx
  | EmitFlowFailedFx
  | WriteContextToDiskFx
  | GetFlowDefFx
  | GetForkSpecFx
  | GetReusableStepDataFx
  | MakeRunPlanFx
  | ResolveBranchValueFx;

// reducers
export type Reducer<M extends EngineMessage = EngineMessage> = (
  state: EngineState,
  message: M,
) => EngineState;

export type ReducerRegistry = {
  [T in EngineMessage["type"]]: Reducer<Extract<EngineMessage, { type: T }>>;
};

// planners
export type Planner<M extends EngineMessage = EngineMessage> = (
  oldState: EngineState,
  newState: EngineState,
  message: M,
) => EngineEffect[];

export type PlannerRegistry = {
  [T in EngineMessage["type"]]?: Planner<Extract<EngineMessage, { type: T }>>;
};

// handlers
export type EffectHandler<T extends EngineEffect["type"]> = (
  effect: Extract<EngineEffect, { type: T }>,
  deps: EffectHandlerDeps,
) => void | Promise<void>;

export type EffectHandlerWrapped<T extends EngineEffect["type"]> = (
  effect: Extract<EngineEffect, { type: T }>,
) => void | Promise<void>;

export type EffectHandlerRegistry = {
  [T in EngineEffect["type"]]: EffectHandlerWrapped<T>;
};
export type EffectHandlerDeps = {
  ef: EmitterFactoryPort;
  bus: EventBusPort;
  runQuery: RunQueryPort;
  enqueue: (message: EngineMessage) => void;
  processAll: () => void;
  artifacts: ArtifactReaderPort;
  jobCommands: MessagePublisher<"job.httpjson.submitted">;
  source: string;
};
