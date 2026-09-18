import { Engine } from "@lcase/engine";
import type {
  ArtifactReaderPort,
  EventBusPort,
  JobParserPort,
  MessagePublisher,
  RunQueryPort,
} from "@lcase/ports";
import type { EmitterFactory } from "@lcase/events";

// Identical to the embedded profile's builder, and copied rather than imported
// so that this host's import graph does not reach into the profile package for
// the complete embedded graph. Engine takes the same collaborators either way;
// what differs between the two hosts is which publisher `jobCommands` is, and
// that is decided by the caller.
export function buildEngine(
  bus: EventBusPort,
  ef: EmitterFactory,
  jobParser: JobParserPort,
  runQuery: RunQueryPort,
  artifacts: ArtifactReaderPort,
  jobCommands: MessagePublisher<"job.httpjson.submitted">,
): Engine {
  return new Engine({
    bus,
    ef,
    jobParser,
    runQuery,
    artifacts,
    jobCommands,
  });
}
