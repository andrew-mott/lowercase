import type { ArtifactReaderPort } from "../artifacts/artifact-reader.port.js";
import type { EventBusPort } from "../bus/event-bus.port.js";
import type { EmitterFactoryPort } from "../events/emitter-factory.port.js";
import type { JobParserPort } from "../events/job-parser.port.js";
import type { RunQueryPort } from "../run/run-query.port.js";
import type { MessagePublisher } from "../messaging/message-publisher.port.js";

export type EngineDeps = {
  bus: EventBusPort;
  ef: EmitterFactoryPort;
  // flowParser: FlowParserPort;
  jobParser: JobParserPort;
  runQuery: RunQueryPort;
  artifacts: ArtifactReaderPort;
  // The engine's half of the HTTP JSON job conversation: it publishes one
  // submitted Message and hears the outcome back on its own subscription. A
  // publisher bound to one topic, not a capability it calls -- the
  // engine has no way to name, reach, or await whoever executes the job.
  jobCommands: MessagePublisher<"job.httpjson.submitted">;
};
