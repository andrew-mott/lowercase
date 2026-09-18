import { describe, expect, it, vi } from "vitest";
import { createHttpJsonExecutor } from "../src/protocol/http-json/http-json.executor.js";
import { Worker } from "../src/worker.js";
import { makeSubmission } from "./helpers/fixtures.js";
import { createFakeArtifactReaderPort } from "./helpers/fake-artifact-reader.js";
import { createFakeArtifactWriterPort } from "./helpers/fake-artifact-writer.js";
import { createFakeLifecycleSink } from "./helpers/fake-lifecycle-sink.js";
import {
  createControllablePermitPort,
  createFakePermitPort,
} from "./helpers/fake-resource-permit.js";
import {
  createFakeTerminalPublisher,
  GENEROUS_CONFIG,
  makeWorker,
  WORKER_SOURCE,
} from "./helpers/worker-fakes.js";
import {
  makeJobExecutionCancelledEvent,
  makeJobExecutionCompletedEvent,
  makeJobExecutionFailedEvent,
} from "../src/worker-lifecycle.events.js";

// Worker's own responsibilities: capacity, the accepted/started/terminal
// lifecycle sequence, and turning JobRunner's modelled outcome into a
// JobResult. The one-job mechanics behind those outcomes are covered by the
// job-runner tests.
describe("Worker", () => {
  it("success: completes and records started+completed facts", async () => {
    const { worker, events } = makeWorker({
      protocolResult: () => ({ ok: true, payload: { foo: "bar" } }),
    });
    const submission = makeSubmission();

    const result = await worker.executeSubmission(submission);

    if (result.status !== "completed") {
      throw new Error(`expected completed, got ${result.status}`);
    }
    expect(result.output.hash).toMatch(/^fake-hash-/);
    expect(result).not.toHaveProperty("jobId");

    expect(events).toHaveLength(2);
    expect(events[0]!.kind).toBe("job-execution-started");
    expect(events[1]).toEqual({
      ...makeJobExecutionCompletedEvent(submission, result.output),
      time: expect.any(String),
    });
    expect(events[1]).not.toHaveProperty("payload");
    expect(events[1]).not.toHaveProperty("body");
  });

  it("expected failure: resolves (not rejects) a failed JobResult and records started+failed facts", async () => {
    const protocolError = {
      code: "HTTP_STATUS_FAILED" as const,
      message: "upstream said no",
      retryable: true,
    };
    const { worker, events } = makeWorker({
      protocolResult: () => ({ ok: false, error: protocolError }),
    });
    const submission = makeSubmission();

    await expect(worker.executeSubmission(submission)).resolves.toMatchObject({
      status: "failed",
      error: protocolError,
    });

    expect(events).toHaveLength(2);
    expect(events[0]!.kind).toBe("job-execution-started");
    expect(events[1]).toEqual({
      ...makeJobExecutionFailedEvent(submission, protocolError),
      time: expect.any(String),
    });
  });

  it("cancellation: records a distinct cancelled fact and returns a CANCELLED result without an output", async () => {
    const permits = createControllablePermitPort();
    const { worker, events } = makeWorker({ permits });
    const submission = makeSubmission();
    const controller = new AbortController();

    const resultPromise = worker.executeSubmission(
      submission,
      controller.signal,
    );
    await vi.waitFor(() => expect(permits.acquire).toHaveBeenCalled());
    controller.abort();
    const result = await resultPromise;

    expect(result).toMatchObject({
      status: "failed",
      error: { code: "CANCELLED", retryable: false },
    });
    expect(result).not.toHaveProperty("output");

    expect(events).toHaveLength(2);
    expect(events[0]!.kind).toBe("job-execution-started");
    expect(events[1]).toEqual({
      ...makeJobExecutionCancelledEvent(submission),
      time: expect.any(String),
    });
  });

  it("thrown invariant failure: rejects before ever touching lifecycle or permits", async () => {
    const { worker, events, acquire, release } = makeWorker();

    await expect(
      worker.executeSubmission(makeSubmission({ scope: { stepid: "" } })),
    ).rejects.toThrow();

    expect(events).toHaveLength(0);
    expect(acquire).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("an unexpected throw from the runner records no terminal fact and propagates", async () => {
    const thrown = new Error("boom");
    const { worker, events } = makeWorker({
      protocolResult: () => {
        throw thrown;
      },
    });

    await expect(worker.executeSubmission(makeSubmission())).rejects.toThrow(
      thrown,
    );

    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("job-execution-started");
  });

  it("end to end: a real HTTP JSON job (fake fetch) completes with an export", async () => {
    const { sink, events } = createFakeLifecycleSink();
    const { port: permits } = createFakePermitPort();
    const { reader } = createFakeArtifactReaderPort();
    const { writer, store } = createFakeArtifactWriterPort();
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ greeting: "hello world" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const worker = new Worker(
      {
        permits,
        lifecycle: sink,
        protocol: createHttpJsonExecutor({
          fetch: fakeFetch as unknown as typeof fetch,
        }),
        artifacts: { ...reader, ...writer },
        terminal: createFakeTerminalPublisher().publisher,
      },
      GENEROUS_CONFIG,
    );
    const submission = makeSubmission({
      data: {
        url: "https://example.test/greet",
        exportRefs: {
          greeting: {
            exportName: "greeting",
            valuePath: ["output", "greeting"],
            scope: "output",
            string: "steps.x.exports.greeting",
            type: "text/plain",
          },
        },
      },
    });

    const result = await worker.executeSubmission(submission);

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    if (result.status !== "completed") {
      throw new Error(`expected completed, got ${JSON.stringify(result)}`);
    }
    expect(store.get(result.output.hash)).toEqual({
      contentType: "application/json",
      content: { greeting: "hello world" },
    });
    expect(store.get(result.exports!.greeting!.hash)).toEqual({
      contentType: "text/plain",
      content: "hello world",
    });
    expect(events.map((e) => e.kind)).toEqual([
      "job-execution-started",
      "job-execution-completed",
    ]);
  });

  // Worker's Message boundary: the handler is what runtime binds, so what it
  // publishes and when it rejects is the contract, not an implementation
  // detail of executeSubmission.
  describe("handleHttpJsonSubmitted", () => {
    it("publishes exactly one terminal Message scoped to the submission", async () => {
      const { worker, published } = makeWorker({
        protocolResult: () => ({ ok: true, payload: { foo: "bar" } }),
      });
      const submission = makeSubmission();

      await worker.handleHttpJsonSubmitted(submission);

      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({
        type: "job.httpjson.completed",
        runid: submission.runid,
        stepid: submission.stepid,
        jobid: submission.jobid,
        traceid: submission.traceid,
        source: WORKER_SOURCE,
      });
    });

    it("publishes one failed terminal for a modelled failure", async () => {
      const { worker, published } = makeWorker({
        protocolResult: () => ({
          ok: false,
          error: {
            code: "HTTP_STATUS_FAILED" as const,
            message: "upstream said no",
            retryable: true,
          },
        }),
      });

      await worker.handleHttpJsonSubmitted(makeSubmission());

      expect(published).toHaveLength(1);
      expect(published[0]!.type).toBe("job.httpjson.failed");
    });

    // A modelled failure is a published fact; an unexpected throw is not. The
    // delivery must fail rather than silently end the job with no terminal.
    it("rejects and publishes nothing when execution throws unexpectedly", async () => {
      const thrown = new Error("boom");
      const { worker, published } = makeWorker({
        protocolResult: () => {
          throw thrown;
        },
      });

      await expect(
        worker.handleHttpJsonSubmitted(makeSubmission()),
      ).rejects.toThrow(thrown);
      expect(published).toHaveLength(0);
    });

    it("rejects when the terminal is refused admission", async () => {
      const { worker, terminal } = makeWorker({
        protocolResult: () => ({ ok: true, payload: null }),
      });
      terminal.failNextPublish(new Error("not admitted"));

      await expect(
        worker.handleHttpJsonSubmitted(makeSubmission()),
      ).rejects.toThrow("not admitted");
    });
  });
});
