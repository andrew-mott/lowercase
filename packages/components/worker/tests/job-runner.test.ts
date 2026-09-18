import { describe, expect, it, vi } from "vitest";
import { makeContext, makeWork } from "./helpers/fixtures.js";
import { createControllablePermitPort } from "./helpers/fake-resource-permit.js";
import type { ResourceKeyResolver } from "../src/resource-key-resolver.js";
import { makeJobRunner } from "./helpers/worker-fakes.js";

describe("JobRunner", () => {
  it("stores the resolved output and reports a completed outcome", async () => {
    const { runner, acquire, release, protocolExecute } = makeJobRunner({
      protocolResult: () => ({ ok: true, payload: { foo: "bar" } }),
    });
    const work = makeWork();

    const outcome = await runner.run(work, makeContext());

    if (outcome.kind !== "completed") {
      throw new Error(`expected completed, got ${outcome.kind}`);
    }
    expect(outcome.outputs.output.hash).toMatch(/^fake-hash-/);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("grant-1");

    // The executor receives the *resolved* request (materialized, defaulted),
    // not the raw template, and none of worker's own identity fields.
    expect(protocolExecute).toHaveBeenCalledTimes(1);
    const [requestArg] = protocolExecute.mock.calls[0]!;
    expect(requestArg).toEqual({
      url: work.protocol.url,
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(requestArg).not.toHaveProperty("jobId");
    expect(requestArg).not.toHaveProperty("runId");
  });

  it("reports an expected protocol failure as a failed outcome rather than throwing", async () => {
    const protocolError = {
      code: "HTTP_STATUS_FAILED" as const,
      message: "upstream said no",
      retryable: true,
    };
    const { runner, release } = makeJobRunner({
      protocolResult: () => ({ ok: false, error: protocolError }),
    });

    const outcome = await runner.run(makeWork(), makeContext());

    expect(outcome).toEqual({ kind: "failed", error: protocolError });
    expect(release).toHaveBeenCalledTimes(1);
  });

  describe("HTTP request invariants surfaced as typed failures, not thrown errors", () => {
    it("GET with a body is rejected before the protocol executor is ever called", async () => {
      const { runner, protocolExecute } = makeJobRunner();
      const work = makeWork({
        protocol: {
          kind: "httpjson",
          url: "https://example.test",
          method: "GET",
          body: { not: "allowed" },
        },
      });

      const outcome = await runner.run(work, makeContext());

      expect(outcome).toMatchObject({
        kind: "failed",
        error: { code: "HTTP_REQUEST_INVALID", retryable: false },
      });
      expect(protocolExecute).not.toHaveBeenCalled();
    });

    it("a non-http(s) URL scheme is rejected before the protocol executor is ever called", async () => {
      const { runner, protocolExecute } = makeJobRunner();
      const work = makeWork({
        protocol: { kind: "httpjson", url: "file:///etc/passwd" },
      });

      const outcome = await runner.run(work, makeContext());

      expect(outcome).toMatchObject({
        kind: "failed",
        error: { code: "HTTP_REQUEST_INVALID" },
      });
      expect(protocolExecute).not.toHaveBeenCalled();
    });
  });

  it("resource-key resolution failure short-circuits before any permit or protocol interaction", async () => {
    const resourceKeyResolver = vi.fn(() => ({
      ok: false as const,
      message: "no policy configured",
    }));
    const { runner, acquire, protocolExecute } = makeJobRunner({
      resourceKeyResolver,
    });

    const outcome = await runner.run(makeWork(), makeContext());

    expect(outcome).toMatchObject({
      kind: "failed",
      error: { code: "RESOURCE_KEY_RESOLUTION_FAILED", retryable: false },
    });
    expect(acquire).not.toHaveBeenCalled();
    expect(protocolExecute).not.toHaveBeenCalled();
  });

  // JobRunner no longer forwards a ResourceHint, because nothing has ever
  // produced one. Asserted at this level rather than on the resolver, since
  // it is JobRunner's call site that decides no hint exists to pass.
  it("resolves the resource key from the materialized request alone, passing no hint", async () => {
    const resourceKeyResolver = vi.fn<ResourceKeyResolver>(() => ({
      ok: true,
      resourceKey: "named:whatever",
    }));
    const { runner } = makeJobRunner({ resourceKeyResolver });

    await runner.run(makeWork(), makeContext());

    expect(resourceKeyResolver).toHaveBeenCalledTimes(1);
    const call = resourceKeyResolver.mock.calls[0]!;
    expect(call).toHaveLength(1);
    expect(call[0]).toMatchObject({ url: "https://example.test/resource" });
  });

  it("a protocol call exceeding protocolTimeoutMs produces a distinct TIMEOUT failure, never a cancellation", async () => {
    const { runner, release } = makeJobRunner({
      protocolTimeoutMs: 20,
      // Never resolves on its own -- only the worker's own timeout signal
      // firing settles this call.
      protocolResult: () =>
        new Promise(() => {
          // intentionally never settles
        }),
    });

    const outcome = await runner.run(makeWork(), makeContext());

    expect(outcome).toMatchObject({
      kind: "failed",
      error: { code: "TIMEOUT", retryable: false },
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("aborting the caller signal mid-wait-for-permit reports cancelled and never calls the protocol", async () => {
    const permits = createControllablePermitPort();
    const { runner, protocolExecute, release } = makeJobRunner({ permits });
    const controller = new AbortController();

    const outcomePromise = runner.run(
      makeWork(),
      makeContext({ signal: controller.signal }),
    );
    await vi.waitFor(() => expect(permits.acquire).toHaveBeenCalled());
    controller.abort();

    expect(await outcomePromise).toEqual({ kind: "cancelled" });
    expect(protocolExecute).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  // Real ref-resolution coverage: every other test here uses an empty `refs`
  // array, so #resolveOneRef's actual reader.load() calls would otherwise be
  // exercised nowhere.
  describe("ref resolution through the reader", () => {
    it("resolves a params-scope text/plain ref into the materialized request", async () => {
      const fakes = makeJobRunner();
      fakes.seed("hash-param", "text/plain", "42");
      const work = makeWork({
        protocol: {
          kind: "httpjson",
          url: "https://example.test/users/{{params.id}}",
        },
        refs: [
          {
            valuePath: ["url"],
            scope: "params",
            stepId: "step-1",
            bindPath: ["url"],
            string: "params.id",
            interpolated: true,
            hash: "hash-param",
            paramType: "text/plain",
          },
        ],
      });

      await fakes.runner.run(work, makeContext());

      expect(fakes.protocolExecute).toHaveBeenCalledTimes(1);
      const [requestArg] = fakes.protocolExecute.mock.calls[0]!;
      expect(requestArg).toMatchObject({
        url: "https://example.test/users/42",
      });
    });

    it("resolves a steps-scope JSON ref into the materialized request via its valuePath", async () => {
      const fakes = makeJobRunner();
      fakes.seed("hash-step", "application/json", { output: { id: "99" } });
      const work = makeWork({
        protocol: {
          kind: "httpjson",
          url: "https://example.test/users/{{steps.step-0.output.id}}",
        },
        refs: [
          {
            valuePath: ["output", "id"],
            scope: "steps",
            stepId: "step-0",
            bindPath: ["url"],
            string: "steps.step-0.output.id",
            interpolated: true,
            hash: "hash-step",
          },
        ],
      });

      await fakes.runner.run(work, makeContext());

      expect(fakes.protocolExecute).toHaveBeenCalledTimes(1);
      const [requestArg] = fakes.protocolExecute.mock.calls[0]!;
      expect(requestArg).toMatchObject({
        url: "https://example.test/users/99",
      });
    });
  });
});
