import type { ExportRef } from "@lcase/types";
import { describe, expect, it } from "vitest";
import { toHttpJsonWork } from "../src/submitted-message.js";
import { makeSubmission } from "./helpers/fixtures.js";

describe("toHttpJsonWork", () => {
  it("turns submitted HTTP fields into one fixed protocol request", () => {
    const work = toHttpJsonWork(
      makeSubmission({
        data: {
          url: "https://example.test/greet",
          method: "POST",
          headers: { "X-Custom": "yes" },
          body: { hello: "world" },
          refs: [],
        },
      }),
    );

    expect(work.protocol).toEqual({
      kind: "httpjson",
      url: "https://example.test/greet",
      method: "POST",
      headers: { "X-Custom": "yes" },
      body: { hello: "world" },
    });
  });

  it("omits optional protocol fields the submission did not carry", () => {
    const work = toHttpJsonWork(makeSubmission());

    expect(work.protocol).toEqual({
      kind: "httpjson",
      url: "https://example.test/resource",
    });
    expect(work).not.toHaveProperty("exportRefs");
  });

  it("carries refs and export declarations through unchanged", () => {
    const exportRefs: Record<string, ExportRef> = {
      greeting: {
        exportName: "greeting",
        valuePath: ["output", "greeting"],
        scope: "output",
        string: "steps.x.exports.greeting",
        type: "text/plain",
      },
    };
    const submission = makeSubmission({ data: { exportRefs } });

    const work = toHttpJsonWork(submission);

    expect(work.refs).toBe(submission.data.refs);
    expect(work.exportRefs).toEqual(exportRefs);
  });

  // No job identity, scope, trace or source reaches JobRunner. This is the
  // separation the whole boundary exists for, so it is asserted rather than
  // left to inspection.
  it("carries no identity, scope, trace or source", () => {
    const work = toHttpJsonWork(makeSubmission());

    expect(Object.keys(work).sort()).toEqual(["protocol", "refs"]);
  });

  // `args` exists in the submitted schema and nothing has ever read it.
  // Preserved deliberately: a producer would need a consumer first.
  it("ignores args", () => {
    const work = toHttpJsonWork(
      makeSubmission({ data: { args: { anything: "at all" } } }),
    );

    expect(work).not.toHaveProperty("args");
    expect(work.protocol).not.toHaveProperty("args");
  });
});
