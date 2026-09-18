import { describe, expect, it } from "vitest";
import { parseDraftFlow } from "@/components/workbench/shared/flow-graph/use-flow-draft-analysis";

describe("parseDraftFlow", () => {
  it("reports a parseError for invalid JSON, with no flowDef", () => {
    const result = parseDraftFlow("{ not json");
    expect(result.flowDef).toBeNull();
    expect(result.parseError).not.toBeNull();
  });

  it("reports a parseError for valid JSON that fails the flow schema, with no flowDef", () => {
    const result = parseDraftFlow(JSON.stringify({ foo: "bar" }));
    expect(result.flowDef).toBeNull();
    expect(result.parseError).not.toBeNull();
  });

  it("returns the parsed flowDef with no parseError for a schema-valid flow", () => {
    const flow = {
      name: "My Flow",
      version: "1",
      start: "a",
      steps: {
        a: {
          type: "httpjson",
          url: "https://example.com",
          method: "GET",
          pipe: {},
        },
      },
    };
    const result = parseDraftFlow(JSON.stringify(flow));
    expect(result.parseError).toBeNull();
    expect(result.flowDef).toEqual(flow);
  });

  it("still returns a flowDef for a schema-valid flow with a graph-level problem (self-reference) -- that's analyzeFlow's concern, not parseFlow's", () => {
    const flow = {
      name: "My Flow",
      version: "1",
      start: "a",
      steps: {
        a: {
          type: "httpjson",
          url: "https://example.com",
          method: "GET",
          pipe: {},
          on: { success: "a" },
        },
      },
    };
    const result = parseDraftFlow(JSON.stringify(flow));
    expect(result.parseError).toBeNull();
    expect(result.flowDef).toEqual(flow);
  });
});
