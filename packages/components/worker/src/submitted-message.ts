import type { AnyEvent, JsonValue } from "@lcase/types";
import type { HttpJsonWork } from "./job.contracts.js";

/**
 * The Message that starts one HTTP JSON job, and worker's only origin for one.
 * Worker retains the whole envelope for as long as the job runs -- identity,
 * scope and trace all come from here, and terminal construction reads it again
 * at the end.
 */
export type HttpJsonSubmission = AnyEvent<"job.httpjson.submitted">;

/**
 * A read-only structural view of the submission, not a constructed DTO --
 * nothing anywhere builds one of these. Capacity accounting and lifecycle
 * recording need job identity, not the envelope, and a submitted Message
 * satisfies this shape as it stands, so no mapping step sits between them.
 */
export type JobIdentity = Pick<
  HttpJsonSubmission,
  "jobid" | "runid" | "stepid" | "traceid"
>;

// Worker's one inbound interpretation: the submitted Message's data becomes
// the work JobRunner executes. This is a projection that changes meaning --
// loose HTTP fields become a single fixed protocol request -- not a spelling
// translation, which is why it survives where the old command mapper did not.
//
// Nothing about job identity, scope, trace or source appears in the result.
// That is the whole point: JobRunner executes work, and only Worker knows
// which job the work belongs to.
export function toHttpJsonWork(submission: HttpJsonSubmission): HttpJsonWork {
  const data = submission.data;
  return {
    protocol: {
      kind: "httpjson",
      url: data.url,
      ...(data.method ? { method: data.method } : {}),
      ...(data.headers ? { headers: data.headers } : {}),
      // ShallowJsonValue -> JsonValue: correct by construction (a step's body
      // is only ever JSON.parse'd/authored JSON), but not structurally
      // assignable -- same precedent as materialize-http-json-request.ts.
      ...(data.body !== undefined ? { body: data.body as JsonValue } : {}),
    },
    refs: data.refs,
    ...(data.exportRefs ? { exportRefs: data.exportRefs } : {}),
  };
}
