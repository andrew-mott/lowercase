import { buildEvent } from "@lcase/events";
import type {
  EffectHandler,
  EffectHandlerDeps,
  PublishJobHttpSubmittedFx,
} from "../engine.types.js";

/**
 * Publishes the one `job.http.submitted` Message that starts an `http` job.
 *
 * Deliberately a sibling of the httpjson publisher rather than a shared
 * function: `httpjson` may be retired as a step type later, and a shared
 * abstraction built now could become dead weight to unwind.
 */
export const publishJobHttpSubmittedFx: EffectHandler<
  "PublishJobHttpSubmitted"
> = async (effect: PublishJobHttpSubmittedFx, deps: EffectHandlerDeps) => {
  const message = buildEvent("job.http.submitted", effect.data, {
    ...effect.scope,
    source: deps.source,
    traceId: effect.traceId,
  });

  try {
    await deps.jobCommands.publish(message);
  } catch (err) {
    // Effects are invoked fire-and-forget, so an unhandled admission rejection
    // would surface as an unhandled Promise rejection rather than anything
    // readable. Same known gap as the httpjson publisher, tracked in
    // docs/todo.md: a refused command leaves the run stalled.
    console.error(
      `[engine] job.http.submitted for job ${effect.scope.jobid} was not admitted`,
      err,
    );
  }
};
