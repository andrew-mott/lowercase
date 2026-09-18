import type { AnyEvent } from "@lcase/types";
import type { EventStorePort } from "@lcase/ports/event-store";
import type { WriteStream } from "fs";
import fs from "fs";
import path from "path";
import readline from "readline";

type RunScopedEvent = AnyEvent & { runid: string };

/**
 * jsonl implementation of an event store
 * write is append only
 * read is only an async generator from the beginning
 *
 * constructor requires absolute path to the directory to read/write files
 */
export class JsonlEventLog implements EventStorePort {
  private writeStreams = new Map<string, WriteStream>();

  constructor(public dir: string) {
    if (!path.isAbsolute(dir)) {
      throw new Error("[json-event-log] dir must be absolute");
    }
    // Recursive because the path is nested (`lcase-db/replay`) and nothing
    // guarantees the parent exists -- a fresh checkout or a deployment that
    // starts somewhere other than the repo has neither level.
    fs.mkdirSync(dir, { recursive: true });
  }

  async getEvent(_eventId: string) {
    throw new Error("not yet implemented");
    return {} as AnyEvent;
  }

  async recordEvent(
    event: AnyEvent,
    runId?: string,
  ): Promise<boolean | undefined> {
    runId = runId ?? (this.hasRunId(event) ? event.runid : undefined);
    if (!runId) return;

    const writeStream = this.getWriteStream(runId);

    try {
      // TODO: later handle situations where the node internal buffer is
      // full.  at that point, implement an internal queue that then flushes
      // in some way
      return writeStream.write(JSON.stringify(event) + "\n");
    } catch (err) {
      throw new Error(`could not write  event ${event}: error:${err}`);
    }
  }

  async *iterateAllEvents(runId: string): AsyncGenerator<AnyEvent> {
    const stream = fs.createReadStream(this.getFilePath(runId));
    const rl = readline.createInterface({ input: stream });

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;
        yield JSON.parse(line) as AnyEvent;
      }
    } catch (err) {
      throw new Error("unable to read file", { cause: err });
    } finally {
      rl.close();
      await new Promise<void>((resolve, reject) => {
        stream.close((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  getFilePath(runId: string) {
    const fileName = `${runId}.events.jsonl`;
    return path.join(this.dir, fileName);
  }

  getWriteStream(runId: string): WriteStream {
    const writeStream = this.writeStreams.get(runId);
    if (!writeStream) return this.setWriteStream(runId);
    return writeStream;
  }

  setWriteStream(runId: string): WriteStream {
    const stream = fs.createWriteStream(this.getFilePath(runId), {
      flags: "a",
      encoding: "utf8",
      autoClose: true,
    });
    this.writeStreams.set(runId, stream);
    return stream;
  }

  stopRecording(runId: string) {
    const writeStream = this.getWriteStream(runId);
    if (!writeStream) return;
    writeStream.close();
  }

  /**
   * Returns true if the event has a runId, false if not.
   * The return type predicate narrows the type to a RunScoped event, meaning
   * and event with a runid property;
   * @param event AnyEvent
   * @returns boolean
   */
  hasRunId(event: AnyEvent): event is RunScopedEvent {
    const e = event as unknown as Record<string, unknown>;
    return typeof e.runid === "string";
  }
}
