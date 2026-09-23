import type { ContentType } from "./content-type.js";
import type { StepDefinition } from "./step.type.js";

export type FlowParamDefinition = {
  type: ContentType;
  optional?: true;
};

/**
 * One named result of a flow. `payload` is a reference to a step's whole
 * output or one of its exports, e.g. `{{steps.tts.output}}`. It is an object,
 * not a bare string, so a later output can be a JSON structure with
 * references inside it.
 */
export type FlowOutputDefinition = {
  payload: string;
};

export type FlowKind = "business" | "eval";

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
