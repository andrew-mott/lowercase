import type { StepHttp, StepHttpJson, StepMcp } from "../generated/index.js";

export type CapMap = {
  mcp: StepMcp;
  httpjson: StepHttpJson;
  http: StepHttp;
};

export type CapId = keyof CapMap;
