# Worker, Tools, and Artifacts

**Status: Complete — Changes #350–#359 merged to `dev`.**

## Summary

Rebuilt two things `CLAUDE.md` had flagged as open questions: the worker/tools extension model, and where `packages/artifacts` actually belongs.

**Worker V2** replaced `packages/components/worker`'s internals with a new core contract (job/result types, `WorkerDispatch`, fakes for testing), proved out through a real HTTP JSON vertical slice, then a legacy-compatibility adapter, then the engine's own migration onto it, then a repo-hygiene pass. What it landed on matches the extension model `ADR-0006` already settled: a fixed, worker-owned set of protocol bindings, not a plugin registry — "tools" as a separate concept didn't survive contact with the real design.

**Artifacts** got a from-scratch reader/writer/read-write port set (`ArtifactReaderPort`/`ArtifactWriterPort`/`ArtifactReadWritePort`), replacing the old single `Artifacts` class and its dozen-plus methods. Every real consumer — engine effects, the worker, `FlowService`/`SimService`/`RunService`/`EvalService`/`ArtifactService`, the observability sink, and the `run-flow` use-case helpers — migrated onto the new ports, and the entire legacy `Artifacts`/`ArtifactsPort`/`LegacyFsArtifactStore` stack (plus the already-orphaned `ArtifactIndexStore`) was deleted outright rather than left running alongside its replacement.

Deliberately not part of this: real binary artifact support (flagged at the outset as a possible byproduct, never came up as an actual need), `ArtifactIndex`'s own retirement (genuinely bigger than a rename — it's a live HTTP wire contract and DB-schema-coupled — tracked separately in `docs/todo.md`), and expanding HTTP protocol support / MCP's near-term fate / secrets (punted to a future initiative; see "Next up" below).

## Evolution

Picked up 2026-08-26, right after `events-refactor` closed, over `json-schema-migration` (set aside deliberately, not now) and `rate-limiting` (a lighter lift, but lower-priority than `packages/components/worker`, a longer-standing refactor target). Worker before artifacts: the two are genuinely tangled (worker writes job output/exports into CAS, and today's capture path limits what can be saved), but `ADR-0006` already settled worker's extension-model design, while artifacts' own infra-vs-application-component boundary is still fully open — artifacts will likely get touched once worker reaches its CAS-writing edges, not deferred out of this initiative.

Started with an investigation pass (Change C1), mirroring `events-refactor`'s discussion-first research and `architecture-boundaries` Change C4's own worker-tool-extensibility research — see [`worker-investigation.md`](./arcs/worker-investigation.md) for the concrete symptoms it found in `worker.ts` itself.

That investigation surfaced findings bigger than worker alone — a candidate port-driven component-interaction model, synthesized (with outside model assistance) into the durable, top-level [`docs/component-architecture/`](../../component-architecture/README.md) reference rather than designed in place here. Change C1 closed as investigation-only; Changes C2–C6 then built out that plan's phases (see Change index), each still discussed individually before being planned. The standalone-limiter/remote-worker pieces that plan also raised were explicitly kept out of this initiative's committed Changes (see Not yet scoped).

Once Worker V2's phases landed (Changes C2–C6), the initiative's other named goal — settling where `packages/artifacts` belongs — picked up the same way, starting with Change C7's own investigation-first pass rather than jumping straight to a plan. That work (Changes C7–C9, see [`arcs/artifacts-investigation.md`](./arcs/artifacts-investigation.md) and [`arcs/artifacts-v2-build.md`](./arcs/artifacts-v2-build.md)) built new reader/writer/read-write ports, migrated every real consumer onto them, and retired the legacy `Artifacts` class outright — landing past "settle where it belongs" into an actual rewrite, once it became clear that keeping the legacy stack alive alongside real consumers was messier than replacing it outright.

With both halves done, the initiative's stated goal was met. Change C10 closes it out with a small mechanical follow-on — dropping the now-pointless `v2` folder name in `packages/artifacts`, once Change C9 had already deleted the "v1" it existed to distinguish itself from. Expanding HTTP protocol support beyond JSON, MCP's near-term fate, and secrets — all raised at various points along the way as candidate next Changes — are deliberately not pulled in to keep this initiative growing; they move to a future initiative instead (see "Next up" below).

## Design principles

This project treats event-driven design, deterministic replay, and swappable infrastructure as goals worth pursuing in their own right, not as solutions derived from a proven necessity — they're genuinely interesting to build and learn, independent of whether this system ever needs to scale. Component boundaries (ports, real event emission, the option to run pieces in-process today or split them out later) are kept honest even where a simpler direct-call implementation would suffice right now.

This doesn't excuse accidental complexity — duplicate mechanisms, dead code, accreted special-casing are still real problems to fix regardless of which philosophy the system is built toward. The bar for a design decision in this initiative is "is this a deliberate, well-executed version of the pattern," not "is this the minimum necessary."

Changes C2 and onward are additionally governed by [`docs/component-architecture/`](../../component-architecture/model.md)'s pattern (inbound/outbound ports, commands vs. lifecycle events vs. telemetry as distinct categories) rather than restated here. One heuristic from that work worth keeping close at hand regardless of implementation details: **adapter/mechanism choice must never change observability semantics** — swapping how a component is reached (direct call vs. bus) must never silently change what gets recorded as having happened.

## Change index

| Change | Description                                      | Status           | Where | See also           |
| ------ | ------------------------------------------------ | ---------------- | ----- | ------------------ |
| C1     | Worker/tools investigation                       | merged (PR #350) | [1]   |                    |
| C2     | Worker V2 core contract + fakes                  | merged (PR #351) | [2]   | [5]                |
| C3     | HTTP JSON vertical slice                         | merged (PR #352) | [2]   | [6]                |
| C4     | Legacy compatibility adapter                     | merged (PR #353) | [2]   | [7]                |
| C5     | Engine migrates to `WorkerDispatch`              | merged (PR #354) | [2]   | [8]                |
| C6     | Repo-hygiene + dead-code removal                 | merged (PR #355) | [2]   | [9] (removal only) |
| C7     | Artifacts research + v2 writer built             | merged (PR #356) | [3]   | [10]               |
| C8     | Artifacts read side + worker migration           | merged (PR #357) | [4]   |                    |
| C9     | Migrate all consumers to v2, retire legacy stack | merged (PR #358) | [4]   |                    |
| C10    | Flatten `src/v2` to artifacts `src/`             | merged (PR #359) | [4]   |                    |

## Next up

This initiative is complete — all ten Changes merged. Change C9 finished the artifacts migration — every legacy artifact consumer moved onto the new reader/writer/read-write ports, and the entire legacy `Artifacts`/`ArtifactsPort`/`LegacyFsArtifactStore` stack deleted. Change C10 was a small trailing cleanup (drop the now-pointless `v2` folder name once there was no more "v1" left to distinguish it from).

What was deliberately punted rather than folded in: expanding HTTP protocol support beyond JSON-only, MCP's near-term fate (postpone vs. limited support alongside the broader protocol change — not a decision to drop MCP, still a stated eventual goal), and secrets (raised earlier as a possible Change C11, never scoped). All three move to a future initiative, scoped fresh when picked up rather than inheriting this one's Change-10 framing. `ArtifactIndex`'s own retirement stays tracked in `docs/todo.md`, independent of any initiative's Change sequence.

## Not yet scoped

- **Remote worker boundary** (Worker V2 plan's Phase 6) — deliberately optional/deferred until deployment independence is actually being tested, not before.
- **Shared resource coordinator / limiter redesign** (Worker V2 plan's Phase 7, informed by [`limiter.next.temp.ts`](../../../packages/components/limiter/src/limiter.next.temp.ts)'s sketch and [`review-results.md`](../../component-architecture/research/review-results.md)'s recommended shape) — a separate piece of work, not part of Changes C2–C6 above. Worker V2's phases 1–5 use a purely local `ResourceAdmission` adapter and don't require rebuilding or distributing the limiter at all; that only becomes necessary once multiple real workers need to coordinate access to the same constrained resource, which isn't true today.
- **A Proposed-status ADR for the port-driven component-interaction model** — deliberately held off per existing ADR practice (decide once proven, not before) and because there's no second reader for it yet (solo project, one initiative worked at a time). Write it the moment any other initiative starts touching a component boundary before this vertical slice finishes — that's the concrete trigger, not a fixed date.
- **Secrets** — raised while discussing Change C6, never scoped beyond that; folded into the future HTTP/MCP/secrets initiative noted in "Next up" above rather than reopened here.
- **A shared lifecycle-event ingestion boundary (`LifecycleEventIngress`), needed before a second or third component migrates to local-direct calls and still wants durable observability.** Surfaced while discussing Change C5, verified against real code rather than taken as design opinion: `InMemoryEventBus.publish()`'s automatic mirror to a fixed `"observability"` topic is genuinely the _only_ mechanism populating `EventStorePort`/the UI event graph today, and Worker V2's own `WorkerLifecycleEventSink` (its only real implementation is a console-only placeholder) is deliberately not `AnyEvent`-shaped — its own source comment states it "must not read as bus-compatible... never published on the bus" — so it has no path into that store at all. Distinct from Change C5's own compat-event stopgap (unaffected, kept as planned): as more components get their own per-component lifecycle sink following worker's pattern (engine next, then eventually limiter), each independently inventing a console placeholder or a bespoke bridge to observability would fragment into one-offs instead of staying one reusable mechanism. Recommended shape: one `LifecycleEventIngress.ingest(event: AnyEvent): Promise<void>` boundary; one pure normalizer function per component mapping its own lifecycle-event vocabulary into the canonical `AnyEvent` envelope (worker needs the first one); a generic `createLifecycleEventSink(ingress, encode)` factory each component's own outbound sink port is built from; `ObservabilityTap` gains a direct `ingest()` method, with its existing bus subscription becoming one input adapter among others rather than the definition of how facts arrive. Additive — doesn't touch any component core, doesn't break the current bus-fed consumers (SQL projection, WebSocket, replay). Also surfaced along the way, worth folding into the same slice rather than fixing separately: `ReplaySink.handle()` doesn't await `EventStorePort.recordEvent()` (fire-and-forget); `JsonlEventLog` silently drops any event without a top-level `runid` and has no real backpressure handling (already a `// TODO` in its own source). Not started, not ordered against Changes C5/6 — the trigger is the next component after worker that needs its own lifecycle sink wired to something durable, not a fixed date.

[1]: ./arcs/worker-investigation.md
[2]: ./arcs/worker-v2-build.md
[3]: ./arcs/artifacts-investigation.md
[4]: ./arcs/artifacts-v2-build.md
[5]: ../../component-architecture/worker-v2/README.md#phase-1-core-contract-and-tests "Worker V2 plan — Phase 1"
[6]: ../../component-architecture/worker-v2/README.md#phase-2-http-json-vertical-slice "Worker V2 plan — Phase 2"
[7]: ../../component-architecture/worker-v2/README.md#phase-3-legacy-compatibility-adapter "Worker V2 plan — Phase 3"
[8]: ../../component-architecture/worker-v2/README.md#phase-4-engine-workerdispatch "Worker V2 plan — Phase 4"
[9]: ../../component-architecture/worker-v2/README.md#phase-5-complete-the-worker-surface "Worker V2 plan — Phase 5"
[10]: ../../component-architecture/research/capability-modules.md "Capability module category"
