import { buildEvent } from "@lcase/events";
import type {
  EffectHandler,
  EffectHandlerDeps,
  PublishJobHttpJsonSubmittedFx,
} from "../engine.types.js";

/**
 * Publishes the one `job.httpjson.submitted` Message that starts a job.
 *
 * Built with buildEvent() rather than an EmitterFactory emitter: a publisher
 * takes a complete envelope, and building it here is also what gives the
 * Message its derived job span (parented on the step) instead of the random
 * one an emitter would mint.
 *
 * Origin is `{ traceId }` -- a new span in a trace the run already owns. There
 * is no inbound event to derive from; the planner is the origin.
 */
export const publishJobHttpJsonSubmittedFx: EffectHandler<
  "PublishJobHttpJsonSubmitted"
> = async (effect: PublishJobHttpJsonSubmittedFx, deps: EffectHandlerDeps) => {
  const message = buildEvent("job.httpjson.submitted", effect.data, {
    ...effect.scope,
    source: deps.source,
    traceId: effect.traceId,
  });

  try {
    await deps.jobCommands.publish(message);
  } catch (err) {
    // Effects are invoked fire-and-forget, so an unhandled admission rejection
    // would surface as an unhandled Promise rejection rather than anything
    // readable. Known gap, tracked in docs/todo.md: a refused command leaves
    // the run stalled with only this line to say why. Failing the run on
    // admission failure is an engine behaviour decision, not wiring.
    console.error(
      `[engine] job.httpjson.submitted for job ${effect.scope.jobid} was not admitted`,
      err,
    );
  }
};
