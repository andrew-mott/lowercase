import type { StepHttpJson } from "./http-json.step.js";
import type { StepMcp } from "./mcp.step.js";
import type { StepHttp } from "../generated/http.step.gen.js";

export type CapMap = {
  mcp: StepMcp;
  httpjson: StepHttpJson;
  http: StepHttp;
};

export type CapId = keyof CapMap;
