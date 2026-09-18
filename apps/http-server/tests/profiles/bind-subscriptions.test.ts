import { describe, expect, it, vi } from "vitest";
import type { MessageRouter } from "@lcase/message-router";
import type { Engine } from "@lcase/engine";
import type { ObservabilityTap } from "@lcase/observability";
import { bindSubscriptions } from "../../src/profiles/api-host/bind-subscriptions.js";

// Cast rather than typed literals: both are classes with private fields, so no
// object literal can satisfy either. Only the two Message-boundary methods are
// read here.
const handleJobTerminal = async () => {};
const engine = { handleJobTerminal } as unknown as Engine;

const ingest = vi.fn();
const tap = { ingest } as unknown as ObservabilityTap;

function recordingRouter() {
  const bind = vi.fn();
  // Annotated, not cast. The compiler checks this double against the real
  // interface every build, so a fourth method on MessageRouter breaks this file
  // instead of leaving it silently testing a shape that no longer exists.
  const router: MessageRouter = {
    publisher: () => {
      throw new Error("bindSubscriptions must not resolve a publisher");
    },
    bind,
    // Refused outright rather than asserted afterwards. Sealing belongs to the
    // composition root, which knows the binding list is complete only because
    // it owns it.
    seal: () => {
      throw new Error("bindSubscriptions must not seal; the profile owns that");
    },
  };
  return { router, bind };
}

describe("bindSubscriptions", () => {
  it("binds Engine's terminal subscription and Observability's, and nothing else", () => {
    const { router, bind } = recordingRouter();

    bindSubscriptions(router, engine, tap);

    expect(bind).toHaveBeenCalledTimes(2);
    expect(
      bind.mock.calls.map(([call]) => call.subscription.id as string),
    ).toEqual(["engine.job-terminal.v1", "observability.job.v1"]);
  });

  it("never binds the Worker command subscription", () => {
    const { router, bind } = recordingRouter();

    bindSubscriptions(router, engine, tap);

    // The router would reject it anyway -- it is not in this role's plan -- but
    // that check lives in another package. This states the intent locally: the
    // work belongs to the other process, and a host quietly taking it over is
    // the specific mistake the split exists to prevent.
    expect(
      bind.mock.calls.map(([call]) => call.subscription.id as string),
    ).not.toContain("worker.job-command.v1");
  });

  it("routes terminals to Engine's own handler", () => {
    const { router, bind } = recordingRouter();

    bindSubscriptions(router, engine, tap);

    expect(bind.mock.calls[0][0].handler).toBe(handleJobTerminal);
  });

  it("holds the observation lane to one handler at a time", () => {
    const { router, bind } = recordingRouter();

    bindSubscriptions(router, engine, tap);

    // Half of the ordering guarantee lives here and nowhere else. The
    // deployment routes both job topics onto one stream, which is what makes
    // arrival order meaningful; running one handler at a time is what carries
    // that order into the tap. Raising or dropping this keeps every other test
    // in the repo green while observation order silently starts racing.
    expect(bind.mock.calls[1][0].maxInFlight).toBe(1);
  });

  it("delivers observed Messages through the tap it was given", () => {
    const { router, bind } = recordingRouter();

    bindSubscriptions(router, engine, tap);
    const message = { type: "job.httpjson.completed" };
    bind.mock.calls[1][0].handler(message);

    // The handler is a closure rather than a method reference, so this is what
    // establishes it still reaches `ingest` with the Message unchanged.
    expect(ingest).toHaveBeenCalledWith(message);
  });
});
