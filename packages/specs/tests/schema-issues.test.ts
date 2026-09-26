import { describe, expect, it } from "vitest";
import {
  flowValidationIssues,
  validateFlowDefinition,
} from "../src/flow-validator.js";

function issuesFor(step: Record<string, unknown>) {
  const valid = validateFlowDefinition({
    name: "test",
    version: "1",
    start: "step",
    steps: { step: { type: "http", url: "http://x", ...step } },
  });
  expect(valid).toBe(false);
  return flowValidationIssues();
}

describe("flow validation issues", () => {
  it("names a missing field", () => {
    const valid = validateFlowDefinition({
      name: "test",
      version: "1",
      start: "step",
      steps: { step: { type: "http" } },
    });
    expect(valid).toBe(false);
    expect(flowValidationIssues()).toEqual([
      { path: ["steps", "step"], message: 'missing required field "url"' },
    ]);
  });

  it("lists allowed values", () => {
    expect(issuesFor({ method: "FETCH" })).toEqual([
      {
        path: ["steps", "step", "method"],
        message: "must be one of GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
      },
    ]);
  });

  it("uses the shared routing-field contract", () => {
    expect(
      validateFlowDefinition({
        name: "test",
        version: "1",
        start: "step",
        steps: {
          step: {
            type: "http",
            url: "http://x",
            on: { success: "next", failure: "recover" },
          },
        },
      }),
    ).toBe(true);
    expect(
      validateFlowDefinition({
        name: "test",
        version: "1",
        start: "step",
        steps: {
          step: {
            type: "http",
            url: "http://x",
            on: { success: "next", retry: "again" },
          },
        },
      }),
    ).toBe(false);
  });

  it("collapses a body that names no kind into one issue", () => {
    expect(issuesFor({ body: { input: "x" } })).toEqual([
      {
        path: ["steps", "step", "body"],
        message: "must be one of { json }, { artifact }, { multipart }",
      },
    ]);
  });

  it("collapses a body that names two kinds into one issue", () => {
    expect(issuesFor({ body: { json: {}, artifact: "x" } })).toEqual([
      {
        path: ["steps", "step", "body"],
        message: "must be one of { json }, { artifact }, { multipart }",
      },
    ]);
  });

  it("keeps only the named kind's problems", () => {
    expect(issuesFor({ body: { artifact: 5 } })).toEqual([
      {
        path: ["steps", "step", "body", "artifact"],
        message: "must be string",
      },
    ]);
  });

  it("reaches a bad part inside a multipart body", () => {
    const body = { multipart: { file: { filename: "a.wav" } } };
    expect(issuesFor({ body })).toEqual([
      {
        path: ["steps", "step", "body", "multipart", "file"],
        message: "must be one of a string, { artifact }",
      },
    ]);
  });

  it("reaches an unknown field in a file part", () => {
    const body = { multipart: { file: { artifact: "x", name: "a.wav" } } };
    expect(issuesFor({ body })).toEqual([
      {
        path: ["steps", "step", "body", "multipart", "file"],
        message: 'unknown field "name"',
      },
    ]);
  });

  it("keeps the selected external step branch's errors", () => {
    const valid = validateFlowDefinition({
      name: "test",
      version: "1",
      start: "step",
      steps: {
        step: {
          type: "mcp",
          transport: "http",
          feature: { primitive: "tool", name: "search" },
        },
      },
    });
    expect(valid).toBe(false);
    expect(flowValidationIssues()).toEqual([
      { path: ["steps", "step"], message: 'missing required field "url"' },
    ]);
  });
});
