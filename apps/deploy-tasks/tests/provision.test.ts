import { describe, expect, it } from "vitest";
import type { MessageLogPort } from "@lcase/ports";
import { runProvision } from "../src/tasks/provision.js";

/**
 * Records what provisioning asks for and nothing more. What those calls do to
 * a real Redis is the integration suite's claim; this one is about the task's
 * own wiring -- which manifest, which prefix, and that the connection closes.
 */
function recordingLog(options: { failOn?: string } = {}) {
  const calls: string[] = [];
  let closed = false;
  const unused = async (): Promise<never> => {
    throw new Error("provisioning should not call this");
  };

  const log: MessageLogPort = {
    ensureStream: unused,
    async ensureConsumerGroup(stream, group, { startAt }) {
      if (stream === options.failOn) throw new Error("redis went away");
      calls.push(`${stream}|${group}|${startAt}`);
    },
    publish: unused,
    readGroup: unused,
    ack: unused,
    claimPending: unused,
    async close() {
      closed = true;
    },
  };

  return {
    log,
    calls,
    get closed() {
      return closed;
    },
  };
}

describe("runProvision", () => {
  it("provisions the remote-worker deployment under the default prefix", async () => {
    const recording = recordingLog();
    let connectedTo = "";

    await runProvision(
      { messaging: { url: "redis://example:6379" } },
      async (url) => {
        connectedTo = url;
        return recording.log;
      },
    );

    expect(connectedTo).toBe("redis://example:6379");
    // The route ids both hosts derive from the same manifest; a change there
    // fails here by name.
    expect(recording.calls).toEqual([
      "lcase:job.command-work.v1|worker.job-command.v1|latest",
      "lcase:job.observation.v1|observability.job.v1|latest",
      "lcase:job.terminal-work.v1|engine.job-terminal.v1|latest",
    ]);
    expect(recording.closed).toBe(true);
  });

  it("uses a configured prefix", async () => {
    const recording = recordingLog();

    const result = await runProvision(
      { messaging: { url: "redis://example:6379", keyPrefix: "staging:" } },
      async () => recording.log,
    );

    expect(result.streams).toEqual([
      "staging:job.command-work.v1",
      "staging:job.observation.v1",
      "staging:job.terminal-work.v1",
    ]);
  });

  it("closes the connection when provisioning fails", async () => {
    const recording = recordingLog({ failOn: "lcase:job.observation.v1" });

    await expect(
      runProvision(
        { messaging: { url: "redis://example:6379" } },
        async () => recording.log,
      ),
    ).rejects.toThrow("redis went away");
    expect(recording.closed).toBe(true);
  });
});
