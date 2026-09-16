import path from "path";
import type {
  ArtifactReaderPort,
  EvalResultRepositoryPort,
  EventBusPort,
  RunQueryPort,
  RunRepositoryPort,
  RunStepProjectionRepositoryPort,
} from "@lcase/ports";
import {
  ConsoleSink,
  ObservabilityTap,
  ReplaySink,
  SqlRunProjectionSink,
  EvalResultProjectionSink,
  WebSocketServerSink,
} from "@lcase/observability";
import { JsonlEventLog } from "@lcase/adapters/event-store";
import type { ObservabilityConfig } from "./observability.config.js";

export type SinkMap = {
  "console-log-sink"?: ConsoleSink;
  "websocket-sink"?: WebSocketServerSink;
  "replay-jsonl-sink"?: ReplaySink;
};

/**
 * The repositories the projection sinks write through.
 *
 * Passed in rather than constructed here, because they have to be the same
 * instances the services use: one selected client is shared by every repository
 * in the process, and this function used to be the one place that quietly
 * reached for a different one.
 */
export type ObservabilityRepositories = {
  runs: RunRepositoryPort;
  steps: RunStepProjectionRepositoryPort;
  evalResults: EvalResultRepositoryPort;
};

// Identical to the embedded profile's builder, copied for the same reason as
// buildEngine. The sinks that matter to a distributed deployment are the two
// attached unconditionally: both projection sinks write to the shared database,
// so what this host observes over Redis is what the read paths can query.
//
// The replay sink writes a per-run JSONL file under this process's working
// directory, which is local state a second process cannot see. That is a real
// limitation of the file-backed event log rather than of this host, and it is
// already recorded in docs/todo.md as likely to move into CAS.
export function buildObservability(
  config: ObservabilityConfig,
  bus: EventBusPort,
  artifacts: ArtifactReaderPort,
  runQuery: RunQueryPort,
  repositories: ObservabilityRepositories,
): { tap: ObservabilityTap; sinks: SinkMap } {
  const tap = new ObservabilityTap(bus);
  const sinks: SinkMap = {};
  tap.attachSink(
    new SqlRunProjectionSink(repositories.runs, repositories.steps),
  );
  tap.attachSink(
    new EvalResultProjectionSink(repositories.evalResults, artifacts, runQuery),
  );
  if (config.sinks) {
    for (const sink of config.sinks) {
      // TODO: move sink settings to config, not hardcoded
      switch (sink) {
        case "console-log-sink": {
          const consoleSink = new ConsoleSink({
            allVerbose: false,
            verboseEvents: new Set([
              "job.httpjson.started",
              "tool.failed",
              "tool.completed",
            ]),
          });
          sinks["console-log-sink"] = consoleSink;
          tap.attachSink(consoleSink);
          break;
        }
        case "websocket-sink":
          if (config.webSocketPort !== undefined) {
            const webSocketServerSink = new WebSocketServerSink(
              config.webSocketPort,
            );
            sinks["websocket-sink"] = webSocketServerSink;
            tap.attachSink(webSocketServerSink);
          }
          break;
        case "replay-jsonl-sink": {
          const absoluteDirPath = path.resolve(
            process.cwd(),
            "lcase-db/replay",
          );
          const replaySink = new ReplaySink(new JsonlEventLog(absoluteDirPath));
          sinks["replay-jsonl-sink"] = replaySink;
          tap.attachSink(replaySink);
          break;
        }
        default:
          break;
      }
    }
  }
  return { tap, sinks };
}
