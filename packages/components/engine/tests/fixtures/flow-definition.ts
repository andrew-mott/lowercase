import type { FlowDefinition } from "@lcase/types";

export const flowDef: FlowDefinition = {
  name: "test-flowname",
  version: "test-flowversion",
  description: "test-flowdescription",
  inputs: {},
  outputs: {},
  start: "parallel",
  steps: {
    parallel: {
      type: "parallel",
      steps: ["b"],
    },
    b: {
      type: "httpjson",
      url: "test-url",
    },
  },
};

export const flowDefWithProblems: FlowDefinition = {
  name: "test-flowname",
  version: "test-flowversion",
  description: "test-flowdescription",
  inputs: {},
  outputs: {},
  start: "parallel",
  steps: {
    parallel: {
      type: "parallel",
      steps: ["c"],
    },
    b: {
      type: "httpjson",
      url: "test-url",
    },
  },
};
