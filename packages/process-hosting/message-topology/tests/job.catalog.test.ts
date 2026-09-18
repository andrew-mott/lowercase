import { describe, expect, it } from "vitest";
import {
  engineJobTerminalSubscription,
  jobCommandTopic,
  jobSubscriptions,
  jobTerminalTopic,
  observabilityJobSubscription,
  workerJobCommandSubscription,
} from "../src/catalogs/job.catalog.js";

// Near-identical declarations are exactly where a copy-paste puts the engine on
// the command topic. The completeness of each type list is already proven
// by the compiler; what is worth asserting at runtime is that each subscription
// selects the topics it is named for.
describe("job catalog", () => {
  it("declares one command topic and one terminal topic", () => {
    expect(jobCommandTopic).toEqual({
      id: "job-command.v1",
      types: ["job.httpjson.submitted"],
    });
    expect(jobTerminalTopic).toEqual({
      id: "job-terminal.v1",
      types: ["job.httpjson.completed", "job.httpjson.failed"],
    });
  });

  it("subscribes worker to commands, engine to terminals, and observability to both", () => {
    const bound = [
      workerJobCommandSubscription,
      engineJobTerminalSubscription,
      observabilityJobSubscription,
    ];

    expect(bound.map((s) => [s.id, s.topics.map((p) => p.id)])).toEqual([
      ["worker.job-command.v1", ["job-command.v1"]],
      ["engine.job-terminal.v1", ["job-terminal.v1"]],
      ["observability.job.v1", ["job-command.v1", "job-terminal.v1"]],
    ]);
    expect(new Set(bound.map((s) => s.id)).size).toBe(bound.length);
    expect(jobSubscriptions).toEqual(bound);
  });

  // Recording a Worker job is one purpose, so it is one subscription and one
  // lane. Two would let a terminal be recorded while the command that produced
  // it was still being recorded.
  it("gives observability one subscription spanning both topics, not one each", () => {
    expect(observabilityJobSubscription.topics).toHaveLength(2);
    expect(
      jobSubscriptions.filter((s) => s.id.startsWith("observability.")),
    ).toHaveLength(1);
  });
});
