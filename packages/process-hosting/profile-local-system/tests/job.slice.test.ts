import { buildEvent } from "@lcase/events";
import type { AnyEvent } from "@lcase/types";
import { describe, expect, it } from "vitest";
import { buildHttpJobGraph } from "./helpers/http-job-graph.js";
import { createInProcessMessageRouter } from "@lcase/message-router";
import { localSystemPlan } from "./helpers/local-system-plan.js";

// Constructed here rather than inside the helper so this test keeps the
// in-process router's concrete type -- whenIdle() is a local diagnostic that
// no log-backed carrier can answer, so it is not on the shared interface.
function inProcessRouter() {
  return createInProcessMessageRouter({ plan: localSystemPlan() });
}

function submitted(): AnyEvent<"job.httpjson.submitted"> {
  return buildEvent(
    "job.httpjson.submitted",
    { url: "https://example.test/greet", refs: [] },
    {
      flowid: "flow-1",
      flowversionid: "flowversion-1",
      runid: "run-1",
      stepid: "step-1",
      jobid: "job-1",
      capid: "httpjson",
      toolid: "httpjson",
      source: "lowercase://engine",
    },
  );
}

// One submitted Message in, one terminal out, through the real router and the
// real component roots. What the router's own tests already prove about carrier
// semantics -- admission-time resolution, snapshot isolation between
// recipients -- is not re-asserted through the whole graph here.
describe("HTTP JSON job vertical slice", () => {
  it("routes a completion: worker executes once, publishes one terminal, engine advances from it", async () => {
    const router = inProcessRouter();
    const graph = buildHttpJobGraph({ router });
    const command = submitted();

    await graph.jobCommands.publish(command);
    await router.whenIdle();

    expect(graph.fetchSpy).toHaveBeenCalledTimes(1);

    const terminals = graph.observed.filter((e) =>
      e.type.startsWith("job.httpjson.completed"),
    );
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({
      runid: "run-1",
      stepid: "step-1",
      jobid: "job-1",
      traceid: command.traceid,
      source: "lowercase://worker",
    });

    // Engine advanced exactly once, from the Message worker published rather
    // than from anything it rebuilt: same Message id, not a new one. Not the
    // same *object* as observability's copy -- each subscription is delivered
    // its own snapshot, which is the router's isolation guarantee.
    expect(graph.enqueued).toHaveLength(1);
    expect(graph.enqueued[0]).toMatchObject({
      type: "JobFinished",
      event: { type: "job.httpjson.completed", jobid: "job-1" },
    });
    expect(graph.enqueued[0]!.event).toEqual(terminals[0]);

    // Observability holds one subscription across both topics, so it sees the
    // command and the terminal as a peer subscriber rather than by receiving a
    // privileged wildcard copy -- and through one lane, so it sees them in the
    // order they happened. Asserted in order rather than sorted: two
    // independent lanes could deliver the terminal first, which is the defect
    // one subscription exists to remove.
    expect(graph.observed.map((e) => e.type)).toEqual([
      "job.httpjson.submitted",
      "job.httpjson.completed",
    ]);

    // Not a single one of the three migrated types touched the bus.
    expect(graph.bus.publish).not.toHaveBeenCalled();
  });

  it("routes a failure: one failed terminal, engine advances from it, fidelity limit holds", async () => {
    const router = inProcessRouter();
    const graph = buildHttpJobGraph({
      router,
      respond: () => new Response("nope", { status: 500 }),
    });

    await graph.jobCommands.publish(submitted());
    await router.whenIdle();

    const terminals = graph.observed.filter(
      (e) => e.type === "job.httpjson.failed",
    );
    expect(terminals).toHaveLength(1);

    expect(graph.enqueued).toHaveLength(1);
    expect(graph.enqueued[0]).toMatchObject({
      type: "JobFinished",
      event: { type: "job.httpjson.failed" },
    });

    // JobFailedData carries neither the modelled error code nor retryability,
    // so what reaches a subscriber is status, output and a message. Asserted
    // here too because the slice is where someone would assume otherwise.
    expect(terminals[0]!.data).not.toHaveProperty("code");
    expect(terminals[0]!.data).not.toHaveProperty("retryable");

    expect(graph.bus.publish).not.toHaveBeenCalled();
  });
});
