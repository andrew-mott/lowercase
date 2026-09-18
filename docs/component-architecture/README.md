# Component Architecture

What's in this folder, not the reasoning behind it. For the current, plain package
map, see [`docs/architecture.md`](../architecture.md); for accepted decisions, see
[`docs/adr/`](../adr/). This folder is where a bigger architecture question gets
worked out _before_ it's settled enough to become either of those — a draft model,
ongoing scrutiny of it, and the concrete build plans that put it into practice.

## [`model.md`](./model.md)

The draft itself: a candidate port-driven component-interaction model (separating
commands, lifecycle facts, replies, and telemetry) for running components
in-process or out-of-process without rewriting their core logic. Status: draft
design note, not yet an ADR.

## [`research/`](./research/)

Scrutiny and refinement of the model above, done at different points as real
implementation gave real evidence to check it against:

- [`review-results.md`](./research/review-results.md) — an early review of the
  model against a limiter port/adapters sketch, before anything in the model was
  actually built.
- [`app-services-components-boundary.md`](./research/app-services-components-boundary.md) —
  revisits the model's "components are self-driven by bus subscription" premise
  after the Worker V2 build exercised a different shape in real code; proposes a
  narrower replacement rule.
- [`capability-modules.md`](./research/capability-modules.md) — names and defines
  a category for reusable, multi-port behavior that sits below both application
  services and components, worked out against `packages/artifacts` and checked
  against two other real/hypothetical cases.

## Cross-component build guides

- [`in-process-messaging/`](./in-process-messaging/) — a deliberately small,
  runtime-owned Message router and per-subscription mailbox, plus the first
  Engine/Worker/Observability vertical slice. It preserves a growth path to the
  fuller local and Redis-backed carrier without requiring all of that machinery
  in the MVP.

## Active component architecture

- [`worker/`](./worker/) — the current target shape for Worker as one stable
  component root, plus the structural runway and Message cutover sequence. This
  is the active Worker guidance for the Swappable Infrastructure initiative.

## Per-component build plans

Concrete, phased plans that apply the model to one real package, written once a
plan is actually being executed:

- [`worker-v2/`](./worker-v2/) — the historical plan behind
  `packages/components/worker`'s rebuild (`worker-tools-artifacts` initiative,
  Changes C2–C6, merged). Its future-facing direct-call and wrapper guidance is
  superseded by [`worker/`](./worker/); the document remains intact as
  implementation history.

Further plans (e.g. an artifacts migration) get added here the same way, as they
start.
