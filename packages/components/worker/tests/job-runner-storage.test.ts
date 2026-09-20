import { describe, expect, it, vi } from "vitest";
import { JobRunner } from "../src/job-runner.js";
import { makeContext, makeWork } from "./helpers/fixtures.js";
import {
  GENEROUS_CONFIG,
  makeJobRunner,
  makeWorkerFakes,
} from "./helpers/worker-fakes.js";

describe("JobRunner output storage", () => {
  it("translates a primary output storage failure into a failed outcome", async () => {
    const fakes = makeWorkerFakes({
      protocolResult: () => ({ ok: true, payload: { foo: "bar" } }),
    });
    // Spied before runnerDeps() captures the writer, which is why the runner
    // is constructed here rather than through makeJobRunner().
    vi.spyOn(fakes.writer, "save").mockResolvedValueOnce({
      status: "failed",
      error: { code: "STORE_PUT_FAILED", message: "disk full" },
    });
    const runner = new JobRunner(fakes.runnerDeps(), GENEROUS_CONFIG);

    const outcome = await runner.run(makeWork(), makeContext());

    expect(outcome).toEqual({
      kind: "failed",
      error: {
        code: "OUTPUT_STORE_FAILED",
        message: "disk full",
        retryable: false,
      },
      output: undefined,
    });
  });

  it("a parseable failure payload from the protocol becomes the failed outcome's optional output", async () => {
    const { runner, store } = makeJobRunner({
      protocolResult: () => ({
        ok: false,
        error: { code: "HTTP_STATUS_FAILED", message: "500", retryable: true },
        payload: { detail: "server exploded" },
      }),
    });

    const outcome = await runner.run(makeWork(), makeContext());
    if (outcome.kind !== "failed") throw new Error("expected failed");

    expect(outcome.output).toBeDefined();
    expect(store.get(outcome.output!.hash)).toEqual({
      contentType: "application/json",
      content: { detail: "server exploded" },
    });
  });

  it("resolves, validates, and stores a text/plain export alongside the primary output", async () => {
    const { runner, store } = makeJobRunner({
      protocolResult: () => ({
        ok: true,
        payload: { message: "hello", count: 3 },
      }),
    });
    const work = makeWork({
      exportRefs: {
        summary: {
          exportName: "summary",
          valuePath: ["output", "message"],
          scope: "output",
          string: "steps.x.exports.summary",
          type: "text/plain",
        },
      },
    });

    const outcome = await runner.run(work, makeContext());
    if (outcome.kind !== "completed") {
      throw new Error(`expected completed, got ${outcome.kind}`);
    }

    expect(outcome.outputs.exports?.summary).toBeDefined();
    expect(store.get(outcome.outputs.exports!.summary!.hash)).toEqual({
      contentType: "text/plain",
      content: "hello",
    });
  });

  it("resolves, validates, and stores an application/json export with a schema", async () => {
    const { runner, store } = makeJobRunner({
      protocolResult: () => ({
        ok: true,
        payload: { message: "hello", count: 3 },
      }),
    });
    const work = makeWork({
      exportRefs: {
        full: {
          exportName: "full",
          valuePath: ["output"],
          scope: "output",
          string: "steps.x.exports.full",
          type: "application/json",
          schema: {
            type: "object",
            required: ["message", "count"],
            properties: {
              message: { type: "string" },
              count: { type: "number" },
            },
          },
        },
      },
    });

    const outcome = await runner.run(work, makeContext());
    if (outcome.kind !== "completed") {
      throw new Error(`expected completed, got ${outcome.kind}`);
    }

    expect(store.get(outcome.outputs.exports!.full!.hash)).toEqual({
      contentType: "application/json",
      content: { message: "hello", count: 3 },
    });
  });

  it("stores a successful protocol result under its own real content type, not application/json", async () => {
    const { runner, store } = makeJobRunner({
      protocolResult: () => ({
        ok: true,
        payload: "plain text result",
        contentType: "text/plain",
      }),
    });

    const outcome = await runner.run(makeWork(), makeContext());
    if (outcome.kind !== "completed") {
      throw new Error(`expected completed, got ${outcome.kind}`);
    }

    expect(store.get(outcome.outputs.output.hash)).toEqual({
      contentType: "text/plain",
      content: "plain text result",
    });
  });

  it("stores a genuinely binary protocol result and fails any declared export against it", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { runner, store } = makeJobRunner({
      protocolResult: () => ({
        ok: true,
        payload: bytes,
        contentType: "audio/wav",
      }),
    });
    const work = makeWork({
      exportRefs: {
        summary: {
          exportName: "summary",
          valuePath: ["output", "message"],
          scope: "output",
          string: "steps.x.exports.summary",
          type: "text/plain",
        },
      },
    });

    const outcome = await runner.run(work, makeContext());

    expect(outcome).toMatchObject({
      kind: "failed",
      error: { code: "EXPORT_RESOLUTION_FAILED", retryable: false },
    });
    const output = (outcome as { output?: { hash: string } }).output;
    expect(output).toBeDefined();
    expect(store.get(output!.hash)).toEqual({
      contentType: "audio/wav",
      content: bytes,
    });
  });

  it("a schema-invalid export fails the job while retaining the already-stored primary output", async () => {
    const { runner } = makeJobRunner({
      protocolResult: () => ({ ok: true, payload: { message: "hello" } }),
    });
    const work = makeWork({
      exportRefs: {
        full: {
          exportName: "full",
          valuePath: ["output"],
          scope: "output",
          string: "steps.x.exports.full",
          type: "application/json",
          schema: {
            type: "object",
            required: ["count"],
            properties: { count: { type: "number" } },
          },
        },
      },
    });

    const outcome = await runner.run(work, makeContext());

    expect(outcome).toMatchObject({
      kind: "failed",
      error: { code: "EXPORT_VALIDATION_FAILED", retryable: false },
    });
    expect((outcome as { output?: unknown }).output).toBeDefined();
  });
});
