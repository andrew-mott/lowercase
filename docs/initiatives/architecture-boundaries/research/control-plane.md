# Control Plane — Research Toward a Future ADR

## Purpose

This is pre-ADR research, not a decision record. It's explicitly a **fragment**, not a full treatment of event-driven architecture — it covers the _control plane_ half of the `components` tier (see [`package-tier-taxonomy.md`](./package-tier-taxonomy.md)'s data-plane/control-plane distinction), not the data plane, which is already built and described in `CLAUDE.md`'s run-execution-flow section. A genuinely complete "event-driven architecture" doc, if one ever gets written, would cover both; this one doesn't try to yet.

Motivated by the out-of-process extraction vision: a `components`-tier piece peeled off into its own `apps/<name>` deployable should stay controllable the same way — over the bus — regardless of which side of a process boundary it ends up on.

## Current mechanics, grounded in real code, not assumed

Today's control plane is entirely code-driven and imperative, in two distinct shapes:

- **Global startup/shutdown**: `WorkflowRuntime.startRuntime()`/`stopRuntime()` (`packages/runtime/src/workflow.runtime.ts`) calls `.start()`/`.stop()` directly on each component in a hardcoded sequence — `router` → `sinks` → `tap` → `engine` → `worker` → `limiter` (roughly reversed for stop) — once per process lifetime.
- **Dynamic sink attach/detach**: `ObservabilityTap.attachSink()`/`detachSink()` (`packages/observability/src/core/tap.ts`) is already a real, live, runtime-mutable mechanism — the `/events` SSE route (`apps/http-server/src/routes/events-route.ts`) creates a fresh `EventSink` per HTTP connection, attaches it via `app.services.system.attachSink(sink)` on connect, detaches on close. The capability already exists; only the _trigger_ is a direct method-call chain instead of an event.

`.start()`/`.stop()` don't mean one consistent thing across these today: for global components it means "begin/stop actively subscribing to the bus" (real data-plane activation); for the per-connection SSE sink, `start()` is a no-op and `stop()` just closes the HTTP response — a much narrower per-request cleanup concern wearing the same method names.

This was a deliberate, self-aware scope cut made early on — avoiding inventing this layer before it was needed — not an oversight.

## Shutdown vs. quiescing — a real distinction, not fully resolved into vocabulary until now

Two genuinely different actions were being conflated under "start/stop":

- **Shutdown** — terminal. The process actually stops; there's no "waking it back up" the same way.
- **Quiescing / draining** — the standard distributed-systems term for the other thing being described: stop accepting new work, remain alive and subscribed to the bus, so a later resume command still reaches it.

This resolves the apparent chicken-and-egg problem with making control event-driven: quiescing needs no bootstrap, since the component never stops listening. Shutdown _can_ still be event-triggered (subscribe to a shutdown command, clean up, then actually terminate) — its one-wayness is a property of the action itself, not a reason it has to bypass events.

## Scope decision: event-driven now, in-process; out-of-process extraction stays deferred

Explicit: "we aren't to the point of building the peeled-off version." The near-term, actually-scoped work is making control-plane commands travel over the same bus abstraction the data plane already uses, even while everything still runs in one process — the same shape as the data plane's own in-memory-today/swappable-later design (see the `swappable-infrastructure` initiative). Not designing or building the actual out-of-process deployment here.

## HTTP vs. events — resolved, not left open

An HTTP admin route should emit the same control-plane event any other trigger would, never bypass it with a direct synchronous call — mirroring the data plane's already-settled pattern: `POST /runs` doesn't reach into the engine directly, it calls `RunService.requestRun()`, which emits `run.requested`; the engine reacts identically regardless of what triggered it. Applying the same rule to control keeps "the bus is the one true way to affect a component's behavior" true everywhere, not just for data.

## Explicitly out of scope, deferred, deliberately not conflated with this

- **Observability sink registration specifics** — how `attachSink`/`detachSink` actually becomes event-driven needs its own look, separate from this doc.
- **The `/events` SSE route's delivery mechanism** — a delivery-only reuse of the `EventSink` shape, not a real observability sink in the `SqlRunProjectionSink` sense. Expected to change independently once data plane and control plane genuinely diverge; not something to redesign as a side effect of this work.
- **The data plane** — not discussed here at all; see Purpose above.

## Open questions, explicitly not yet resolved

- The actual event/command vocabulary (topic names, payload shapes) for start / quiesce / resume / shutdown.
- Whether shutdown should be event-triggered at all, or stays a direct process-level concern (e.g. `SIGTERM` handling) rather than a bus event.
- How observability sink registration actually becomes event-driven, independent of the SSE mechanism — needs closer investigation before any design commitment.
- **Real risk surfaced by reading the actual startup sequence, not just reasoning abstractly**: today's hardcoded order (`tap` starts before `engine`) exists so the tap is already subscribed before events start flowing — otherwise early events (like `run.requested`) could be silently missed. A naive event-driven conversion (broadcast one "start" event, every component reacts independently, no guaranteed order) would lose that ordering guarantee for free and could reintroduce exactly this race. Whatever the real design ends up being, it needs an explicit answer for ordering dependencies like this one, not just "everything listens for its own start command."
