import { describe, it, expect } from "vitest";
import { buildEvent } from "../src/core/emit.js";
import type { JobCompletedData, JobFailedData } from "@lcase/types";

const jobScope = {
  flowid: "flow-1",
  flowversionid: "flowversion-1",
  runid: "run-1",
  stepid: "step-a",
  jobid: "job-1",
  capid: "http" as const,
  toolid: "http",
  source: "test",
};

describe("job.http.* events", () => {
  it("builds a job.http.submitted event with a JSON body", () => {
    const event = buildEvent(
      "job.http.submitted",
      { url: "https://example.com", body: { json: { foo: "bar" } }, refs: [] },
      jobScope,
    );

    expect(event.type).toBe("job.http.submitted");
    expect(event.entity).toBe("http");
    expect(event.capid).toBe("http");
  });

  it("builds a job.http.submitted event with an artifact body", () => {
    const event = buildEvent(
      "job.http.submitted",
      {
        url: "https://example.com",
        body: { artifact: "{{params.audio}}" },
        refs: [],
      },
      jobScope,
    );

    expect(event.data.body).toEqual({ artifact: "{{params.audio}}" });
  });

  it("builds a job.http.submitted event with a multipart body", () => {
    const event = buildEvent(
      "job.http.submitted",
      {
        url: "https://example.com",
        body: {
          multipart: {
            file: { artifact: "{{params.audio}}", filename: "input.wav" },
            model: "whisper-1",
          },
        },
        refs: [],
      },
      jobScope,
    );

    expect(event.data.body).toEqual({
      multipart: {
        file: { artifact: "{{params.audio}}", filename: "input.wav" },
        model: "whisper-1",
      },
    });
  });

  it("builds job.http.completed and job.http.failed, reusing the generic job terminal data", () => {
    const completedData: JobCompletedData = {
      status: "success",
      output: "hash-1",
    };
    const completed = buildEvent("job.http.completed", completedData, jobScope);
    expect(completed.type).toBe("job.http.completed");

    const failedData: JobFailedData = {
      status: "failure",
      output: null,
      message: "boom",
    };
    const failed = buildEvent("job.http.failed", failedData, jobScope);
    expect(failed.type).toBe("job.http.failed");
  });
});
