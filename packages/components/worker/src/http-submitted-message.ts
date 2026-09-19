import type { AnyEvent } from "@lcase/types";
import type { Work } from "./job.contracts.js";

/**
 * The Message that starts one `http` job -- mirrors HttpJsonSubmission in
 * submitted-message.ts. JobIdentity there is defined structurally, off the
 * shared CloudEvents envelope fields, so it already covers this submission
 * too without any change.
 */
export type HttpSubmission = AnyEvent<"job.http.submitted">;

// http's one inbound interpretation, mirroring toHttpJsonWork: the submitted
// Message's data becomes the work JobRunner executes. Unlike httpjson's, this
// body needs no cast -- JobHttpSubmittedData's `body` is already typed as
// StepHttp's own json/artifact/multipart union, not a bare JsonValue.
export function toHttpWork(submission: HttpSubmission): Work {
  const data = submission.data;
  return {
    protocol: {
      kind: "http",
      url: data.url,
      ...(data.method ? { method: data.method } : {}),
      ...(data.headers ? { headers: data.headers } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
    },
    refs: data.refs,
    ...(data.exportRefs ? { exportRefs: data.exportRefs } : {}),
  };
}
