// stub for console.log output for observability

import type { EventSink } from "@lcase/ports";
import { hasRunId } from "@lcase/run-history";
import type { AnyEvent, EventType } from "@lcase/types";

export type ConsoleSinkContext = {
  allVerbose: boolean;
  verboseEvents: Set<EventType>;
};
export class ConsoleSink implements EventSink {
  readonly id = "console-log-sink";
  #enableSink = false;
  #s = "\x1b[0m";
  #c = {
    red: "\x1b[38;2;255;100;50m",
    job: "\x1b[38;2;230;224;64m",
    worker: "\x1b[38;2;252;131;226m",
    step: "\x1b[38;2;218;131;252m",
    engine: "\x1b[38;2;157;131;252m",
    tool: "\x1b[38;2;64;230;130m",
    flow: "\x1b[38;2;255;106;146m",
    run: "\x1b[38;2;235;172;106m",
    system: "\x1b[38;2;170;170;190m",
    replay: "\x1b[38;2;170;170;190m",
    scheduler: "\x1b[38;2;170;170;190m",
    limiter: "\x1b[38;2;170;170;190m",
  };

  constructor(private readonly ctx: ConsoleSinkContext) {}

  async start(): Promise<void> {
    this.#enableSink = true;
  }
  async stop(): Promise<void> {
    this.#enableSink = false;
  }
  handle(event: AnyEvent): void {
    if (!this.#enableSink) return;

    let ok = "\x1b[38;2;108;235;106m[✔]\x1b[0m";
    if (event.action !== "completed") ok = "";
    if (event.type === "run.completed" || event.type === "run.failed") {
      if (hasRunId(event)) console.log(`runId: ${event.runid}`);
    }

    let log = "";
    if (event.type === "system.logged") {
      const l = event as AnyEvent<"system.logged">;
      log = l.data.log;
    } else if (event.type === "step.started") {
      const l = event as AnyEvent<"step.started">;
      log = l.data.step.id + " | " + l.data.step.type;
    } else if (event.type === "run.denied") {
      const l = event as AnyEvent<"run.denied">;
      log = l.data.error;
    }
    console.log(
      `${this.#c[event.domain]}[${event.type}]${this.#s}${ok} ${log}`,
    );

    if (this.ctx.allVerbose || this.ctx.verboseEvents.has(event.type)) {
      // console.log("data:", event.data);
    }
  }
}
