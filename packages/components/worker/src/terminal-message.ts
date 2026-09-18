import { buildEvent } from "@lcase/events";
import type { MessageOf } from "@lcase/ports";
import type { JobCompletedData, JobFailedData } from "@lcase/types";
import type { JobResult } from "./job.contracts.js";
import type { HttpJsonSubmission } from "./submitted-message.js";

export type JobTerminalType = "job.httpjson.completed" | "job.httpjson.failed";

// MessageOf, not AnyEvent<JobTerminalType>: the latter collapses into one
// envelope whose `type` is the union and whose `data` is the union of both
// data shapes, which loses the correspondence between them. MessageOf
// distributes into two complete envelopes, which is what a publisher accepts.
export type JobTerminalMessage = MessageOf<JobTerminalType>;

// Worker's one outbound construction path: a modelled JobResult plus the
// submission it came from becomes exactly one terminal Message. Deliberately a
// plain function rather than a scoped reporting facet -- the first slice needs
// only a terminal, and methods for events that do not exist yet would be
// speculation.
//
// buildEvent() carries the mandatory schema validation, which is why worker
// depends on @lcase/events directly rather than being handed an emitter or a
// bus. Construction is where validation belongs; publishing is someone else's
// concern.
export function buildJobTerminal(
  submitted: HttpJsonSubmission,
  result: JobResult,
  source: string,
): JobTerminalMessage {
  // Selected field by field, never spread: the submission carries refs, export
  // declarations, and its own id/time/span, none of which belong on the
  // terminal. Spreading would leak all of it and would only be noticed by a
  // schema that happens to be strict.
  const options = {
    flowid: submitted.flowid,
    flowversionid: submitted.flowversionid,
    runid: submitted.runid,
    stepid: submitted.stepid,
    jobid: submitted.jobid,
    capid: submitted.capid,
    toolid: submitted.toolid,
    source,
    // Trace continuity comes from the submission, and the registered job span
    // policy derives this Message's own span and its parent step's. `id` and
    // `time` are minted fresh by buildEvent, so terminal identity is new by
    // construction.
    fromEvent: submitted,
  };

  // Built per branch rather than through a union-typed type/data pair:
  // buildEvent's generic cannot correlate a union type with a union data shape
  // across a call boundary, so narrowing inside each branch is what avoids a
  // cast.
  return result.status === "completed"
    ? buildEvent("job.httpjson.completed", toCompletedData(result), options)
    : buildEvent("job.httpjson.failed", toFailedData(result), options);
}

function toCompletedData(
  result: Extract<JobResult, { status: "completed" }>,
): JobCompletedData {
  const entries = Object.entries(result.exports ?? {});
  const exportHashes =
    entries.length > 0
      ? Object.fromEntries(entries.map(([name, ref]) => [name, ref.hash]))
      : undefined;
  return {
    status: "success",
    output: result.output.hash,
    ...(exportHashes ? { exportHashes } : {}),
  };
}

// Known fidelity limit, preserved rather than fixed: JobFailedData carries no
// `code` or `retryable`, so JobExecutionError's code -- CANCELLED included --
// does not survive into the published fact. A cancelled job is therefore
// indistinguishable from any other failure to anyone reading the Message.
// Expanding the schema is a separate decision, tied to the cancellation
// protocol that does not exist yet.
function toFailedData(
  result: Extract<JobResult, { status: "failed" }>,
): JobFailedData {
  return {
    status: "failure",
    output: result.output ? result.output.hash : null,
    message: result.error.message,
  };
}
