import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKER_SRC_DIR = join(import.meta.dirname, "..", "src");
// `AnyEvent` was banned here when Messages were not yet the universal
// protocol and worker's translation layer existed to keep it off the event
// schema. Worker now constructs its own terminal Message, so that separation
// is gone deliberately -- and the ban would have passed on a technicality
// anyway, since the envelope arrives as MessageOf. Dropped explicitly rather
// than left to rot.
//
// What must never enter worker is transport: worker holds a publisher or is
// handed a Message, and knows nothing about how either travels.
const BANNED_IDENTIFIERS = [
  "EventBusPort",
  "QueuePort",
  "EmitterFactoryPort",
  "@lcase/message-router",
  "@lcase/profile-local-system",
  "InProcessMessageRouter",
  "SubscriptionMailbox",
  "redis",
];

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("worker core dependency boundary", () => {
  it("no worker source file imports a bus, queue, emitter factory, router, mailbox, or Redis client", () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(WORKER_SRC_DIR)) {
      const contents = readFileSync(file, "utf8");
      // Import lines only, not the full file text -- a doc comment is
      // allowed to *mention* AnyEvent (e.g. to explain a deliberate
      // divergence from it) without that counting as a real dependency.
      const importLines = contents
        .split("\n")
        .filter((line) => /^\s*import\b/.test(line));
      for (const identifier of BANNED_IDENTIFIERS) {
        if (importLines.some((line) => line.includes(identifier))) {
          offenders.push(`${file}: ${identifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
