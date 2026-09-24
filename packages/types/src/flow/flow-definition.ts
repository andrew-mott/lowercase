import type {
  FlowKind,
  FlowOutputDefinition,
  FlowParamDefinition,
} from "../generated/index.js";
import type { StepDefinition } from "./step.type.js";

export type FlowDefinition = {
  name: string;
  version: string;
  description?: string;
  kind?: FlowKind;
  params?: Record<string, FlowParamDefinition>;
  outputs?: Record<string, FlowOutputDefinition>;
  start: string;
  steps: Record<string, StepDefinition>;
};
