import { describe, expect, it } from "vitest";
import {
  validateBinaryRefPosition,
  validateExportRefPath,
  validateRefTargetStep,
} from "../src/analyze-references.js";
import type {
  FlowAnalysis,
  FlowDefinition,
  InvalidRefStepIdProblem,
  Ref,
  StepHttpJson,
} from "@lcase/types";

describe("validateRefTargetStep()", () => {
  it("validates a correct step reference", () => {
    const ref: Ref = {
      valuePath: ["steps", "foo"],
      scope: "steps",
      bindPath: ["url"],
      stepId: "bar",
      string: "steps.foo",
      hash: null,
      interpolated: false,
    };
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "{{steps.foo}}",
    };
    const flowDef = {
      steps: {
        foo: {
          type: "httpjson",
          url: "url",
        },
        bar: httpStep,
      },
    } as unknown as FlowDefinition;

    const flowAnalysis: FlowAnalysis = {
      nodes: ["foo", "bar"],
      inEdges: {},
      outEdges: {
        foo: [
          {
            endStepId: "bar",
            startStepId: "foo",
            gate: "always",
            type: "control",
          },
        ],
      },
      joinDeps: {},
      refs: [],
      problems: [],
    };
    const problem = validateRefTargetStep(ref, flowDef, flowAnalysis);
    expect(problem).toBe(undefined);
  });
  it("invalidates an incorrect step reference", () => {
    const ref: Ref = {
      valuePath: ["steps", "foo"],
      scope: "steps",
      bindPath: ["url"],
      stepId: "bar",
      string: "steps.foo",
      hash: null,
      interpolated: false,
    };
    const httpStep: StepHttpJson = {
      type: "httpjson",
      url: "{{steps.foo}}",
    };
    const flowDef = {
      steps: {
        other: {
          type: "httpjson",
          url: "url",
        },
        bar: httpStep,
      },
    } as unknown as FlowDefinition;

    const flowAnalysis: FlowAnalysis = {
      nodes: ["foo", "bar"],
      inEdges: {},
      outEdges: {
        foo: [
          {
            endStepId: "bar",
            startStepId: "foo",
            gate: "always",
            type: "control",
          },
        ],
      },
      joinDeps: {},
      refs: [],
      problems: [],
    };
    const expectedProblem: InvalidRefStepIdProblem = {
      type: "InvalidRefStepId",
      ref: {
        valuePath: ["steps", "foo"],
        scope: "steps",
        stepId: "bar",
        bindPath: ["url"],
        string: "steps.foo",
        hash: null,
        interpolated: false,
      },
      targetStepId: "foo",
    };
    const problem = validateRefTargetStep(ref, flowDef, flowAnalysis);
    expect(problem).toEqual(expectedProblem);
  });
});

describe("validateExportRefPath()", () => {
  function makeFlowDef(
    exportType: "text/plain" | "application/json",
  ): FlowDefinition {
    return {
      steps: {
        upstream: {
          type: "httpjson",
          url: "url",
          exports: {
            summary: {
              ref: "{{output.message}}",
              type: exportType,
            },
          },
        },
      },
    } as unknown as FlowDefinition;
  }

  it("rejects a nested path into a text/plain export", () => {
    const ref: Ref = {
      valuePath: ["steps", "upstream", "exports", "summary", "nested"],
      scope: "steps",
      stepId: "bar",
      bindPath: ["url"],
      string: "steps.upstream.exports.summary.nested",
      hash: null,
      interpolated: false,
    };

    const problem = validateExportRefPath(ref, makeFlowDef("text/plain"));

    expect(problem).toEqual({
      type: "InvalidExportRefPath",
      ref,
      exportName: "summary",
      sourceStepId: "upstream",
    });
  });

  it("allows the whole-value path into a text/plain export", () => {
    const ref: Ref = {
      valuePath: ["steps", "upstream", "exports", "summary"],
      scope: "steps",
      stepId: "bar",
      bindPath: ["url"],
      string: "steps.upstream.exports.summary",
      hash: null,
      interpolated: false,
    };

    const problem = validateExportRefPath(ref, makeFlowDef("text/plain"));

    expect(problem).toBeUndefined();
  });

  it("allows arbitrary depth into an application/json export", () => {
    const ref: Ref = {
      valuePath: ["steps", "upstream", "exports", "summary", "nested"],
      scope: "steps",
      stepId: "bar",
      bindPath: ["url"],
      string: "steps.upstream.exports.summary.nested",
      hash: null,
      interpolated: false,
    };

    const problem = validateExportRefPath(ref, makeFlowDef("application/json"));

    expect(problem).toBeUndefined();
  });
});

describe("validateBinaryRefPosition()", () => {
  function makeRef(bindPath: string[], interpolated = false): Ref {
    return {
      valuePath: ["params", "audio"],
      scope: "params",
      stepId: "transcribe",
      bindPath,
      string: "params.audio",
      hash: null,
      interpolated,
    };
  }

  function makeFlowDef(
    stepType: "http" | "httpjson",
    body: unknown,
  ): FlowDefinition {
    return {
      params: { audio: { type: "audio/wav" } },
      steps: {
        transcribe: { type: stepType, url: "url", body },
      },
    } as unknown as FlowDefinition;
  }

  it("allows a binary param as the whole value of body.artifact", () => {
    const ref = makeRef(["body", "artifact"]);
    const fd = makeFlowDef("http", { artifact: "{{params.audio}}" });

    expect(validateBinaryRefPosition(ref, fd)).toBeUndefined();
  });

  it("allows a binary param as the whole value of a multipart file's artifact field", () => {
    const ref = makeRef(["body", "multipart", "file", "artifact"]);
    const fd = makeFlowDef("http", {
      multipart: { file: { artifact: "{{params.audio}}" } },
    });

    expect(validateBinaryRefPosition(ref, fd)).toBeUndefined();
  });

  it("rejects a binary param inside a body.json field", () => {
    const ref = makeRef(["body", "json", "prompt"]);
    const fd = makeFlowDef("http", { json: { prompt: "{{params.audio}}" } });

    expect(validateBinaryRefPosition(ref, fd)).toEqual({
      type: "InvalidBinaryRefPosition",
      ref,
      paramName: "audio",
    });
  });

  it("rejects a binary param inside a multipart string part", () => {
    const ref = makeRef(["body", "multipart", "model"]);
    const fd = makeFlowDef("http", {
      multipart: { model: "{{params.audio}}" },
    });

    expect(validateBinaryRefPosition(ref, fd)).toEqual({
      type: "InvalidBinaryRefPosition",
      ref,
      paramName: "audio",
    });
  });

  it("rejects a binary param in body.artifact when the string has surrounding text", () => {
    const ref = makeRef(["body", "artifact"], true);
    const fd = makeFlowDef("http", { artifact: "prefix-{{params.audio}}" });

    expect(validateBinaryRefPosition(ref, fd)).toEqual({
      type: "InvalidBinaryRefPosition",
      ref,
      paramName: "audio",
    });
  });

  it("rejects a binary param on a non-http step, even with a field named artifact", () => {
    const ref = makeRef(["body", "artifact"]);
    const fd = makeFlowDef("httpjson", { artifact: "{{params.audio}}" });

    expect(validateBinaryRefPosition(ref, fd)).toEqual({
      type: "InvalidBinaryRefPosition",
      ref,
      paramName: "audio",
    });
  });

  it("leaves a text-safe param unaffected, in any position", () => {
    const ref: Ref = {
      valuePath: ["params", "note"],
      scope: "params",
      stepId: "transcribe",
      bindPath: ["body", "json", "prompt"],
      string: "params.note",
      hash: null,
      interpolated: true,
    };
    const fd = {
      params: { note: { type: "text/plain" } },
      steps: {
        transcribe: { type: "http", url: "url", body: { json: {} } },
      },
    } as unknown as FlowDefinition;

    expect(validateBinaryRefPosition(ref, fd)).toBeUndefined();
  });
});
