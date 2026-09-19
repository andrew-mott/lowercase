import type { StepHttp } from "@lcase/types";
import { ajv } from "./ajv/ajv.js";
import httpStepSchema from "./schemas/http.step.schema.json" with { type: "json" };

// The http step is defined by its JSON Schema rather than in Zod. StepSchema in
// flow.types.ts hands an http step to this validator.
export const validateHttpStep = ajv.compile<StepHttp>(httpStepSchema);
