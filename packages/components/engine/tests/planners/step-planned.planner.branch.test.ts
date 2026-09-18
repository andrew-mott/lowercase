import { describe, expect, it } from "vitest";
import { stepPlannedPlanner } from "../../src/planners/step-planned.planner.js";
import type { EngineState } from "../../src/engine.types.js";
import type { ResolveBranchValueFx } from "../../src/types/effect.types.js";
import type { StepPlannedMsg } from "../../src/types/message.types.js";
import type { AnyEvent, FlowDefinition, Ref } from "@lcase/types";

const flowDef: FlowDefinition = {
  name: "test-flow",
  version: "v1",
  start: "llmweather",
  steps: {
    llmweather: {
      type: "httpjson",
      url: "test-url",
      exports: {
        data: { ref: "{{output.body}}", type: "application/json" },
      },
    },
    routeintent: {
      type: "branch",
      value: "{{steps.llmweather.exports.data.intent}}",
      cases: { forecast: "getforecast" },
      default: "unknownintent",
    },
    getforecast: { type: "httpjson", url: "test-url" },
    unknownintent: { type: "httpjson", url: "test-url" },
  },
};

const valueRef: Ref = {
  valuePath: ["steps", "llmweather", "exports", "data", "intent"],
  scope: "steps",
  stepId: "routeintent",
  bindPath: ["value"],
  string: "steps.llmweather.exports.data.intent",
  interpolated: false,
  hash: null,
};

function makeState(): EngineState {
  return {
    runs: {
      "test-runid": {
        flowId: "test-flowid",
        flowVersionId: "test-flowversionid",
        flowDefHash: "test-flowdefhash",
        runId: "test-runid",
        traceId: "test-traceid",
        params: {},
        input: {},
        runPlan: { reuse: {} },
        startedSteps: {},
        plannedSteps: { routeintent: true },
        completedSteps: {},
        failedSteps: {},
        outstandingSteps: 1,
        status: "started",
        steps: {
          llmweather: {
            status: "completed",
            attempt: 0,
            output: {},
            outputHash: "test-output-hash",
            exportHashes: { data: "test-data-hash" },
            resolved: {},
          },
          routeintent: {
            status: "planned",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
          },
        },
        flowAnalysis: {
          inEdges: {},
          outEdges: {},
          nodes: [],
          joinDeps: {},
          problems: [],
          refs: [valueRef],
        },
      },
    },
    flows: {
      "test-flowversionid": {
        definition: flowDef,
        runIds: { "test-runid": true },
      },
    },
  };
}

function makeMessage(): StepPlannedMsg {
  return {
    type: "StepPlanned",
    event: {
      type: "step.planned",
      runid: "test-runid",
      stepid: "routeintent",
      steptype: "branch",
      flowid: "test-flowid",
      flowversionid: "test-flowversionid",
      traceid: "test-traceid",
      source: "lowercase://test",
      data: {
        step: { id: "routeintent", name: "routeintent", type: "branch" },
      },
    } as unknown as AnyEvent<"step.planned">,
  };
}

describe("stepPlannedPlanner() branch arm", () => {
  it("emits ResolveBranchValue with the resolved ref and declared cases", () => {
    const state = makeState();
    const message = makeMessage();

    const effects = stepPlannedPlanner(state, state, message);

    const resolveFx = effects.find((e) => e.type === "ResolveBranchValue") as
      ResolveBranchValueFx | undefined;

    expect(resolveFx).toBeDefined();
    expect(resolveFx?.cases).toEqual({ forecast: "getforecast" });
    expect(resolveFx?.ref.hash).toBe("test-data-hash");
    expect(resolveFx?.ref.valuePath).toEqual(["intent"]);
    expect(resolveFx?.runId).toBe("test-runid");
    expect(resolveFx?.stepId).toBe("routeintent");
  });

  it("does not emit a job-submitted effect for a branch step", () => {
    const state = makeState();
    const message = makeMessage();

    const effects = stepPlannedPlanner(state, state, message);

    expect(
      effects.some(
        (e) =>
          e.type === "PublishJobHttpJsonSubmitted" ||
          e.type === "EmitJobMcpSubmitted",
      ),
    ).toBe(false);
  });
});
