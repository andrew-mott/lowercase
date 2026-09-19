import type { ExportRef } from "@lcase/types";
import { describe, expect, it } from "vitest";
import { toHttpWork } from "../src/http-submitted-message.js";
import { makeHttpSubmission } from "./helpers/fixtures.js";

describe("toHttpWork", () => {
  it("turns submitted HTTP fields into one fixed protocol request", () => {
    const work = toHttpWork(
      makeHttpSubmission({
        data: {
          url: "https://example.test/greet",
          method: "POST",
          headers: { "X-Custom": "yes" },
          body: { json: { hello: "world" } },
          refs: [],
        },
      }),
    );

    expect(work.protocol).toEqual({
      kind: "http",
      url: "https://example.test/greet",
      method: "POST",
      headers: { "X-Custom": "yes" },
      body: { json: { hello: "world" } },
    });
  });

  it("omits optional protocol fields the submission did not carry", () => {
    const work = toHttpWork(makeHttpSubmission());

    expect(work.protocol).toEqual({
      kind: "http",
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
    const submission = makeHttpSubmission({ data: { exportRefs } });

    const work = toHttpWork(submission);

    expect(work.refs).toBe(submission.data.refs);
    expect(work.exportRefs).toEqual(exportRefs);
  });

  // No job identity, scope, trace or source reaches JobRunner -- the same
  // separation toHttpJsonWork's own test asserts.
  it("carries no identity, scope, trace or source", () => {
    const work = toHttpWork(makeHttpSubmission());

    expect(Object.keys(work).sort()).toEqual(["protocol", "refs"]);
  });

  it("carries an artifact or multipart body through unwrapped -- no cast needed, unlike httpjson's", () => {
    const artifactWork = toHttpWork(
      makeHttpSubmission({ data: { body: { artifact: "{{params.audio}}" } } }),
    );
    expect(artifactWork.protocol).toMatchObject({
      body: { artifact: "{{params.audio}}" },
    });

    const multipartWork = toHttpWork(
      makeHttpSubmission({
        data: {
          body: {
            multipart: {
              model: "whisper-1",
              file: { artifact: "{{params.audio}}", filename: "input.wav" },
            },
          },
        },
      }),
    );
    expect(multipartWork.protocol).toMatchObject({
      body: {
        multipart: {
          model: "whisper-1",
          file: { artifact: "{{params.audio}}", filename: "input.wav" },
        },
      },
    });
  });
});
