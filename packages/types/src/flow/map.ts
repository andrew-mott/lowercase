import type { StepMcp } from "./mcp.step.js";
import type { StepHttp, StepHttpJson } from "../generated/index.js";

export type CapMap = {
  mcp: StepMcp;
  httpjson: StepHttpJson;
  http: StepHttp;
};

export type CapId = keyof CapMap;
