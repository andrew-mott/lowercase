import { describe, expect, it } from "vitest";
import type { FlowDefinition, Ref } from "@lcase/types";
import {
  artifactFormatToLanguage,
  buildRefUsage,
  findParamRefs,
  findStepRefs,
  foldResolvedField,
  formatBindPath,
  interpolateRefLocal,
  renderParamRefReport,
  resolveRefHash,
  type ResolvedRef,
} from "@/components/workbench/shared/ref-resolution";

function makeRef(overrides: Partial<Ref>): Ref {
  return {
    valuePath: ["params", "userWeatherQuery"],
    scope: "params",
    stepId: "one",
    bindPath: ["body"],
    string: "params.userWeatherQuery",
    interpolated: false,
    hash: null,
    ...overrides,
  };
}

const flowDef: FlowDefinition = {
  name: "test",
  version: "1.0.0",
  start: "one",
  steps: {
    one: {
      type: "httpjson",
      url: "https://example.com",
      body: {
        model: "local-mistral",
        messages: [
          { role: "system", content: "{{params.systemParser}}" },
          {
            role: "user",
            content: "Question: {{params.userWeatherQuery}} please",
          },
        ],
      },
    },
  },
};

describe("findParamRefs", () => {
  it("filters refs by scope and param name", () => {
    const refs: Ref[] = [
      makeRef({ valuePath: ["params", "userWeatherQuery"] }),
      makeRef({ valuePath: ["params", "systemParser"] }),
      makeRef({ scope: "steps", valuePath: ["steps", "one", "output"] }),
    ];
    expect(findParamRefs(refs, "userWeatherQuery")).toHaveLength(1);
    expect(findParamRefs(refs, "systemParser")).toHaveLength(1);
    expect(findParamRefs(refs, "nonexistent")).toHaveLength(0);
  });
});

describe("interpolateRefLocal", () => {
  it("returns the value as-is for whole-value (non-string) refs", () => {
    const ref = makeRef({ interpolated: false });
    const value = { location: "Seattle" };
    expect(interpolateRefLocal("{{params.userWeatherQuery}}", value, ref)).toBe(
      value,
    );
  });

  it("returns the value as-is for whole-value string refs", () => {
    const ref = makeRef({ interpolated: false });
    expect(
      interpolateRefLocal("{{params.userWeatherQuery}}", "hello", ref),
    ).toBe("hello");
  });

  it("substitutes a single embedded ref into a larger string", () => {
    const ref = makeRef({
      interpolated: true,
      string: "params.userWeatherQuery",
    });
    const result = interpolateRefLocal(
      "Question: {{params.userWeatherQuery}} please",
      "will it rain",
      ref,
    );
    expect(result).toBe("Question: will it rain please");
  });

  it("JSON-stringifies non-string values when interpolated into a larger string", () => {
    const ref = makeRef({
      interpolated: true,
      string: "params.userWeatherQuery",
    });
    const result = interpolateRefLocal(
      "data: {{params.userWeatherQuery}}",
      { a: 1 },
      ref,
    );
    expect(result).toBe('data: {"a":1}');
  });

  it("substitutes multiple refs joined in one string, one call per ref", () => {
    const ref1 = makeRef({ interpolated: true, string: "params.a" });
    const ref2 = makeRef({ interpolated: true, string: "params.b" });
    let field: unknown = "{{params.a}}-{{params.b}}";
    field = interpolateRefLocal(field, "x", ref1);
    field = interpolateRefLocal(field, "y", ref2);
    expect(field).toBe("x-y");
  });
});

describe("buildRefUsage", () => {
  it("resolves a whole-value JSON param ref", () => {
    const ref = makeRef({
      stepId: "one",
      bindPath: ["body", "messages", 0, "content"],
      string: "params.systemParser",
      interpolated: false,
    });
    const usage = buildRefUsage(ref, flowDef, {
      format: "json",
      value: { role: "system" },
    });
    expect(usage.resolved).toBe(true);
    expect(usage.interpolatedResult).toEqual({ role: "system" });
  });

  it("resolves an interpolated text param ref embedded in a larger string", () => {
    const ref = makeRef({
      stepId: "one",
      bindPath: ["body", "messages", 1, "content"],
      string: "params.userWeatherQuery",
      interpolated: true,
    });
    const usage = buildRefUsage(ref, flowDef, {
      format: "text",
      value: "will it rain",
    });
    expect(usage.resolved).toBe(true);
    expect(usage.interpolatedResult).toBe("Question: will it rain please");
  });

  it("marks a usage unresolved when the JSON sub-path doesn't exist on the artifact", () => {
    const ref = makeRef({
      stepId: "one",
      bindPath: ["body", "messages", 0, "content"],
      valuePath: ["params", "foo", "bar"],
      string: "params.foo.bar",
      interpolated: false,
    });
    const usage = buildRefUsage(ref, flowDef, {
      format: "json",
      value: { notBar: true },
    });
    expect(usage.resolved).toBe(false);
  });
});

describe("renderParamRefReport", () => {
  it("reports no usages when the list is empty", () => {
    expect(renderParamRefReport("userWeatherQuery", [])).toContain("No usages");
  });

  it("includes a could-not-resolve marker for unresolved usages", () => {
    const ref = makeRef({ string: "params.foo.bar" });
    const report = renderParamRefReport("foo", [
      {
        ref,
        resolved: false,
        resolvedValue: undefined,
        originalField: "{{params.foo.bar}}",
        interpolatedResult: "{{params.foo.bar}}",
      },
    ]);
    expect(report).toContain("could not resolve");
    expect(report).toContain("params.foo.bar");
  });

  it("renders resolved usages with the interpolated result", () => {
    const ref = makeRef({
      stepId: "one",
      bindPath: ["body", "messages", 1, "content"],
    });
    const report = renderParamRefReport("userWeatherQuery", [
      {
        ref,
        resolved: true,
        resolvedValue: "will it rain",
        originalField: "Question: {{params.userWeatherQuery}} please",
        interpolatedResult: "Question: will it rain please",
      },
    ]);
    expect(report).toContain("Question: will it rain please");
    expect(report).toContain('Step "one"');
  });
});

describe("artifactFormatToLanguage", () => {
  it("maps json to json", () => {
    expect(artifactFormatToLanguage("json")).toBe("json");
  });

  it("maps markdown to markdown", () => {
    expect(artifactFormatToLanguage("markdown")).toBe("markdown");
  });

  it("maps text to plaintext", () => {
    expect(artifactFormatToLanguage("text")).toBe("plaintext");
  });
});

describe("formatBindPath", () => {
  it("joins string segments with dots", () => {
    expect(formatBindPath(["body", "content"])).toBe("body.content");
  });

  it("renders a numeric segment as a bracket accessor, not dot-joined", () => {
    expect(formatBindPath(["body", "messages", 0, "content"])).toBe(
      "body.messages[0].content",
    );
  });

  it("composes consecutive numeric segments for multi-dimensional arrays", () => {
    expect(formatBindPath(["body", "matrix", 0, 1])).toBe("body.matrix[0][1]");
  });

  it("handles a single top-level segment", () => {
    expect(formatBindPath(["body"])).toBe("body");
  });
});

describe("findStepRefs", () => {
  it("filters refs by containing stepId across all scopes", () => {
    const refs: Ref[] = [
      makeRef({ stepId: "one", scope: "params", valuePath: ["params", "a"] }),
      makeRef({
        stepId: "one",
        scope: "steps",
        valuePath: ["steps", "other", "output"],
      }),
      makeRef({ stepId: "two", scope: "params", valuePath: ["params", "b"] }),
    ];
    expect(findStepRefs(refs, "one")).toHaveLength(2);
    expect(findStepRefs(refs, "two")).toHaveLength(1);
    expect(findStepRefs(refs, "nonexistent")).toHaveLength(0);
  });
});

describe("resolveRefHash", () => {
  it("resolves a params-scope ref from the run's param hashes", () => {
    const ref = makeRef({
      scope: "params",
      valuePath: ["params", "userWeatherQuery"],
    });
    const hash = resolveRefHash(ref, {
      paramHashes: { userWeatherQuery: "hash-param" },
      stepArtifacts: {},
    });
    expect(hash).toBe("hash-param");
  });

  it("resolves a steps-scope output ref from the referenced step's outputHash", () => {
    const ref = makeRef({
      scope: "steps",
      valuePath: ["steps", "other", "output"],
    });
    const hash = resolveRefHash(ref, {
      paramHashes: {},
      stepArtifacts: { other: { outputHash: "hash-output" } },
    });
    expect(hash).toBe("hash-output");
  });

  it("resolves a steps-scope export ref from the referenced step's exportHashes", () => {
    const ref = makeRef({
      scope: "steps",
      valuePath: ["steps", "other", "exports", "foo"],
    });
    const hash = resolveRefHash(ref, {
      paramHashes: {},
      stepArtifacts: { other: { exportHashes: { foo: "hash-foo" } } },
    });
    expect(hash).toBe("hash-foo");
  });

  it("returns null for input/env scopes (genuinely unimplemented upstream)", () => {
    const inputRef = makeRef({ scope: "input", valuePath: ["input", "x"] });
    const envRef = makeRef({ scope: "env", valuePath: ["env", "x"] });
    const ctx = { paramHashes: {}, stepArtifacts: {} };
    expect(resolveRefHash(inputRef, ctx)).toBeNull();
    expect(resolveRefHash(envRef, ctx)).toBeNull();
  });

  it("returns null when the referenced step hasn't produced that hash yet", () => {
    const ref = makeRef({
      scope: "steps",
      valuePath: ["steps", "other", "output"],
    });
    expect(
      resolveRefHash(ref, { paramHashes: {}, stepArtifacts: {} }),
    ).toBeNull();
  });
});

describe("foldResolvedField", () => {
  const multiRefFlowDef: FlowDefinition = {
    name: "test",
    version: "1.0.0",
    start: "one",
    steps: {
      one: {
        type: "httpjson",
        url: "https://example.com",
        body: {
          prompt: "System: {{params.a}} User: {{steps.other.exports.b}}",
        },
      },
    },
  };

  it("composes a field's final value from two resolved refs sharing one field", () => {
    const refA = makeRef({
      stepId: "one",
      bindPath: ["body", "prompt"],
      scope: "params",
      valuePath: ["params", "a"],
      string: "params.a",
      interpolated: true,
    });
    const refB = makeRef({
      stepId: "one",
      bindPath: ["body", "prompt"],
      scope: "steps",
      valuePath: ["steps", "other", "exports", "b"],
      string: "steps.other.exports.b",
      interpolated: true,
    });
    const group: ResolvedRef[] = [
      {
        ref: refA,
        hash: "hash-a",
        artifact: { format: "text", value: "hello" },
        usage: buildRefUsage(refA, multiRefFlowDef, {
          format: "text",
          value: "hello",
        }),
      },
      {
        ref: refB,
        hash: "hash-b",
        artifact: { format: "text", value: "world" },
        usage: buildRefUsage(refB, multiRefFlowDef, {
          format: "text",
          value: "world",
        }),
      },
    ];

    const result = foldResolvedField(
      multiRefFlowDef,
      "one",
      ["body", "prompt"],
      group,
    );
    expect(result.value).toBe("System: hello User: world");
    expect(result.anyUnresolved).toBe(false);
    expect(result.anyLoading).toBe(false);
  });

  it("marks anyUnresolved when one ref in the field has no resolvable hash, but still substitutes the other", () => {
    const refA = makeRef({
      stepId: "one",
      bindPath: ["body", "prompt"],
      scope: "params",
      valuePath: ["params", "a"],
      string: "params.a",
      interpolated: true,
    });
    const refB = makeRef({
      stepId: "one",
      bindPath: ["body", "prompt"],
      scope: "env",
      valuePath: ["env", "b"],
      string: "steps.other.exports.b",
      interpolated: true,
    });
    const group: ResolvedRef[] = [
      {
        ref: refA,
        hash: "hash-a",
        artifact: { format: "text", value: "hello" },
        usage: buildRefUsage(refA, multiRefFlowDef, {
          format: "text",
          value: "hello",
        }),
      },
      { ref: refB, hash: null, artifact: undefined, usage: undefined },
    ];

    const result = foldResolvedField(
      multiRefFlowDef,
      "one",
      ["body", "prompt"],
      group,
    );
    expect(result.value).toBe("System: hello User: {{steps.other.exports.b}}");
    expect(result.anyUnresolved).toBe(true);
  });

  it("marks anyLoading when a hash resolved but the artifact hasn't loaded yet", () => {
    const refA = makeRef({
      stepId: "one",
      bindPath: ["body", "prompt"],
      scope: "params",
      valuePath: ["params", "a"],
      string: "params.a",
      interpolated: true,
    });
    const group: ResolvedRef[] = [
      { ref: refA, hash: "hash-a", artifact: undefined, usage: undefined },
    ];

    const result = foldResolvedField(
      multiRefFlowDef,
      "one",
      ["body", "prompt"],
      group,
    );
    expect(result.anyLoading).toBe(true);
    expect(result.value).toBe(
      "System: {{params.a}} User: {{steps.other.exports.b}}",
    );
  });
});
