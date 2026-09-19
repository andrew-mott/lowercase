import { describe, expect, it } from "vitest";
import { schemaIssues } from "../src/ajv/schema-issues.js";
import { validateHttpStep } from "../src/http.schema.js";

function issuesFor(step: Record<string, unknown>) {
  const valid = validateHttpStep({ type: "http", url: "http://x", ...step });
  expect(valid).toBe(false);
  return schemaIssues(validateHttpStep);
}

describe("schemaIssues, on the http step schema", () => {
  it("names a missing field", () => {
    const valid = validateHttpStep({ type: "http" });
    expect(valid).toBe(false);
    expect(schemaIssues(validateHttpStep)).toEqual([
      { path: [], message: 'missing required field "url"' },
    ]);
  });

  it("lists allowed values", () => {
    expect(issuesFor({ method: "FETCH" })).toEqual([
      {
        path: ["method"],
        message: "must be one of GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
      },
    ]);
  });

  it("collapses a body that names no kind into one issue", () => {
    expect(issuesFor({ body: { input: "x" } })).toEqual([
      {
        path: ["body"],
        message: "must be one of { json }, { artifact }, { multipart }",
      },
    ]);
  });

  it("collapses a body that names two kinds into one issue", () => {
    expect(issuesFor({ body: { json: {}, artifact: "x" } })).toEqual([
      {
        path: ["body"],
        message: "must be one of { json }, { artifact }, { multipart }",
      },
    ]);
  });

  it("keeps only the named kind's problems", () => {
    expect(issuesFor({ body: { artifact: 5 } })).toEqual([
      { path: ["body", "artifact"], message: "must be string" },
    ]);
  });

  it("reaches a bad part inside a multipart body", () => {
    const body = { multipart: { file: { filename: "a.wav" } } };
    expect(issuesFor({ body })).toEqual([
      {
        path: ["body", "multipart", "file"],
        message: "must be one of a string, { artifact }",
      },
    ]);
  });

  it("reaches an unknown field in a file part", () => {
    const body = { multipart: { file: { artifact: "x", name: "a.wav" } } };
    expect(issuesFor({ body })).toEqual([
      { path: ["body", "multipart", "file"], message: 'unknown field "name"' },
    ]);
  });
});
