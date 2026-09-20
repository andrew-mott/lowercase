import { describe, expect, it } from "vitest";
import type {
  AnyEvent,
  ExportRef,
  FlowDefinition,
  Ref,
  RunContext,
  StepDefinition,
} from "@lcase/types";
import type {
  EngineState,
  PublishJobHttpSubmittedFx,
} from "../../src/engine.types.js";
import type { StepPlannedMsg } from "../../src/types/message.types.js";
import { stepPlannedPlanner } from "../../src/planners/step-planned.planner.js";
import { flowAnalysisB } from "../fixtures/flow-analysis.state.js";

type StateOptions = {
  step: StepDefinition;
  params?: Record<string, string>;
  paramDefinitions?: FlowDefinition["params"];
  refs?: Ref[];
  exportRefs?: Record<string, ExportRef>;
};

// Reaches the real http dispatch branch: nothing is in runPlan.reuse, unlike
// the shared step-planned.state.ts fixture.
function makeState(options: StateOptions): EngineState {
  const definition: FlowDefinition = {
    name: "test-flowname",
    version: "test-flowversion",
    start: "parallel",
    ...(options.paramDefinitions ? { params: options.paramDefinitions } : {}),
    steps: {
      parallel: { type: "parallel", steps: ["b"] },
      b: options.step,
    },
  };
  return {
    runs: {
      "test-runid": {
        flowId: "test-flowid",
        flowVersionId: "test-flowversionid",
        flowDefHash: "test-flowdefhash",
        forkSpecHash: "test-forkspechash",
        runId: "test-runid",
        traceId: "test-traceid",
        params: options.params ?? {},
        runPlan: { reuse: {} },
        startedSteps: { parallel: true },
        plannedSteps: {},
        completedSteps: {},
        failedSteps: {},
        outstandingSteps: 1,
        input: {},
        status: "started",
        steps: {
          b: {
            status: "initialized",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
          },
          parallel: {
            status: "started",
            attempt: 0,
            output: {},
            outputHash: null,
            exportHashes: {},
            resolved: {},
          },
        },
        flowAnalysis: {
          ...flowAnalysisB,
          refs: options.refs ?? [],
          exportRefsByStep: { b: options.exportRefs ?? {} },
        },
      } satisfies RunContext,
    },
    flows: {
      "test-flowversionid": { definition, runIds: { "test-runid": true } },
    },
  };
}

function makeMessage(): StepPlannedMsg {
  return {
    type: "StepPlanned",
    event: {
      data: { step: { id: "b", name: "b", type: "http" } },
      id: "test-id",
      source: "test-source",
      specversion: "1.0",
      time: "test-time",
      type: "step.planned",
      domain: "step",
      action: "planned",
      traceparent: "test-traceparent",
      traceid: "test-traceid",
      spanid: "test-spanid",
      flowid: "test-flowid",
      flowversionid: "test-flowversionid",
      runid: "test-runid",
      stepid: "b",
      steptype: "http",
    } satisfies AnyEvent<"step.planned">,
  };
}

function plan(options: StateOptions) {
  const state = makeState(options);
  const effects = stepPlannedPlanner(state, state, makeMessage());
  return effects.filter(
    (e) => e.type === "PublishJobHttpSubmitted",
  ) as PublishJobHttpSubmittedFx[];
}

describe("stepPlannedPlanner() -- http step", () => {
  it("pushes one PublishJobHttpSubmitted effect and no httpjson effect", () => {
    const state = makeState({ step: { type: "http", url: "test-url" } });

    const effects = stepPlannedPlanner(state, state, makeMessage());

    expect(
      effects.filter((e) => e.type === "PublishJobHttpSubmitted"),
    ).toHaveLength(1);
    expect(
      effects.filter((e) => e.type === "PublishJobHttpJsonSubmitted"),
    ).toHaveLength(0);
  });

  it("scopes the job to the http capability with a fresh jobid", () => {
    const [published] = plan({ step: { type: "http", url: "test-url" } });

    expect(published!.data.url).toBe("test-url");
    expect(published!.scope).toMatchObject({
      flowid: "test-flowid",
      flowversionid: "test-flowversionid",
      runid: "test-runid",
      stepid: "b",
      capid: "http",
      toolid: "http",
    });
    expect(published!.scope.jobid).toEqual(expect.any(String));
    expect(published!.traceId).toBe("test-traceid");
  });

  it.each([
    ["json", { json: { input: "{{params.text}}" } }],
    ["artifact", { artifact: "{{params.audio}}" }],
    [
      "multipart",
      {
        multipart: {
          file: { artifact: "{{params.audio}}", filename: "input.wav" },
          model: "whisper-1",
        },
      },
    ],
  ] as const)(
    "carries a %s body, method and headers through",
    (_kind, body) => {
      const [published] = plan({
        step: {
          type: "http",
          url: "test-url",
          method: "POST",
          headers: { "X-Custom": "yes" },
          body,
        },
      });

      expect(published!.data).toMatchObject({
        url: "test-url",
        method: "POST",
        headers: { "X-Custom": "yes" },
        body,
      });
    },
  );

  it("omits optional fields the step does not set", () => {
    const [published] = plan({ step: { type: "http", url: "test-url" } });

    expect(Object.keys(published!.data).sort()).toEqual(["refs", "url"]);
  });

  it("includes exportRefs only when the step declares exports", () => {
    const exportRefs: Record<string, ExportRef> = {
      transcript: {
        exportName: "transcript",
        valuePath: ["output", "text"],
        scope: "output",
        string: "steps.b.exports.transcript",
        type: "text/plain",
      },
    };

    const [withExports] = plan({
      step: { type: "http", url: "test-url" },
      exportRefs,
    });
    const [withoutExports] = plan({ step: { type: "http", url: "test-url" } });

    expect(withExports!.data.exportRefs).toEqual(exportRefs);
    expect(withoutExports!.data).not.toHaveProperty("exportRefs");
  });

  it("builds refs for the step, resolving a param's hash and declared type", () => {
    const ref: Ref = {
      valuePath: ["params", "audio"],
      scope: "params",
      stepId: "b",
      bindPath: ["body", "artifact"],
      string: "params.audio",
      interpolated: false,
      hash: null,
    };

    const [published] = plan({
      step: {
        type: "http",
        url: "test-url",
        body: { artifact: "{{params.audio}}" },
      },
      refs: [ref],
      params: { audio: "audio-hash" },
      paramDefinitions: { audio: { type: "audio/wav" } },
    });

    expect(published!.data.refs).toEqual([
      { ...ref, valuePath: [], hash: "audio-hash", paramType: "audio/wav" },
    ]);
  });
});
