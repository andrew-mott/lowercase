import type {
  StepOtelAttributesMap,
  FlowOtelAttributesMap,
  EngineOtelAttributesMap,
  RunOtelAttributesMap,
  JobOtelAttributesMap,
  ToolOtelAttributesMap,
  WorkerOtelAttributesMap,
  SystemOtelAttributesMap,
} from "@lcase/types";

export const stepOtelAttributes = {
  "step.planned": {
    action: "planned",
    domain: "step",
    entity: undefined,
  },
  "step.reused": {
    action: "reused",
    domain: "step",
    entity: undefined,
  },

  "step.started": {
    action: "started",
    domain: "step",
    entity: undefined,
  },
  "step.completed": {
    action: "completed",
    domain: "step",
    entity: undefined,
  },
  "step.failed": {
    action: "failed",
    domain: "step",
    entity: undefined,
  },
} satisfies StepOtelAttributesMap;

export const flowOtelAttributes = {
  "flow.queued": {
    action: "queued",
    domain: "flow",
    entity: undefined,
  },
  "flow.submitted": {
    action: "submitted",
    domain: "flow",
    entity: undefined,
  },
  "flow.analyzed": {
    action: "analyzed",
    domain: "flow",
    entity: undefined,
  },
  "flow.started": {
    action: "started",
    domain: "flow",
    entity: undefined,
  },
  "flow.completed": {
    action: "completed",
    domain: "flow",
    entity: undefined,
  },
  "flow.failed": {
    action: "failed",
    domain: "flow",
    entity: undefined,
  },
} satisfies FlowOtelAttributesMap;

export const engineOtelAttributesMap = {
  "engine.started": {
    action: "started",
    domain: "engine",
    entity: undefined,
  },
  "engine.stopped": {
    action: "stopped",
    domain: "engine",
    entity: undefined,
  },
} satisfies EngineOtelAttributesMap;

export const runOtelAttributesMap = {
  "run.requested": {
    action: "requested",
    domain: "run",
    entity: undefined,
  },
  "run.denied": {
    action: "denied",
    domain: "run",
    entity: undefined,
  },
  "run.completed": {
    action: "completed",
    domain: "run",
    entity: undefined,
  },
  "run.started": {
    action: "started",
    domain: "run",
    entity: undefined,
  },
  "run.failed": {
    action: "failed",
    domain: "run",
    entity: undefined,
  },
} satisfies RunOtelAttributesMap;

export const jobOtelAttributesMap = {
  "job.mcp.submitted": {
    action: "submitted",
    domain: "job",
    entity: "mcp",
  },
  "job.mcp.delayed": {
    action: "delayed",
    domain: "job",
    entity: "mcp",
  },
  "job.mcp.queued": {
    action: "queued",
    domain: "job",
    entity: "mcp",
  },
  "job.mcp.resumed": {
    action: "resumed",
    domain: "job",
    entity: "mcp",
  },
  "job.mcp.started": {
    action: "started",
    domain: "job",
    entity: "mcp",
  },
  "job.mcp.completed": {
    action: "completed",
    domain: "job",
    entity: "mcp",
  },
  "job.mcp.failed": {
    action: "failed",
    domain: "job",
    entity: "mcp",
  },
  "job.httpjson.submitted": {
    action: "submitted",
    domain: "job",
    entity: "httpjson",
  },
  "job.httpjson.delayed": {
    action: "delayed",
    domain: "job",
    entity: "httpjson",
  },
  "job.httpjson.resumed": {
    action: "resumed",
    domain: "job",
    entity: "httpjson",
  },
  "job.httpjson.queued": {
    action: "queued",
    domain: "job",
    entity: "httpjson",
  },
  "job.httpjson.started": {
    action: "started",
    domain: "job",
    entity: "httpjson",
  },
  "job.httpjson.completed": {
    action: "completed",
    domain: "job",
    entity: "httpjson",
  },
  "job.httpjson.failed": {
    action: "failed",
    domain: "job",
    entity: "httpjson",
  },
} satisfies JobOtelAttributesMap;

export const toolOtelAttributesMap = {
  "tool.completed": {
    action: "completed",
    domain: "tool",
    entity: undefined,
  },
  "tool.started": {
    action: "started",
    domain: "tool",
    entity: undefined,
  },
  "tool.failed": {
    action: "failed",
    domain: "tool",
    entity: undefined,
  },
} satisfies ToolOtelAttributesMap;

export const workerOtelAttributesMap = {
  "worker.stopped": {
    action: "stopped",
    domain: "worker",
    entity: undefined,
  },
  "worker.started": {
    action: "started",
    domain: "worker",
    entity: undefined,
  },
  "worker.profile.submitted": {
    action: "submitted",
    domain: "worker",
    entity: "profile",
  },
  "worker.profile.added": {
    action: "added",
    domain: "worker",
    entity: "profile",
  },
  "worker.job.dequeued": {
    action: "dequeued",
    domain: "worker",
    entity: "job",
  },
  "worker.slot.requested": {
    action: "requested",
    domain: "worker",
    entity: "slot",
  },
  "worker.slot.finished": {
    action: "finished",
    domain: "worker",
    entity: "slot",
  },
} satisfies WorkerOtelAttributesMap;

export const systemOtelAttributesMap = {
  "system.logged": {
    action: "logged",
    domain: "system",
    entity: undefined,
  },
} satisfies SystemOtelAttributesMap;
