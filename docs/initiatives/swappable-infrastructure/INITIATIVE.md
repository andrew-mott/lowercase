# Prove Swappable Infrastructure (I5)

## Summary

The actual reason this initiative exists: build a real remote worker and deploy
it. Everything else here is in service of that — a worker running
out-of-process needs infrastructure it can actually reach from another
process/machine, which the original defaults (`InMemoryQueue`, local
`FsArtifactStore`, SQLite) could not provide. Changes C1–C18 have now supplied
remote-capable choices for messaging, artifacts, and SQL. The
[Remote Worker Arc](./arcs/remote-worker.md) scopes the process and package
boundary that exercises them together.

The ports/adapters boundary is meant to let other infrastructure backends get swapped in later (candidates already named in the root `README.md`: Redis Streams for the job queue, MinIO for CAS/blob storage) — but that's only a structural claim until real alternate implementations actually exist behind those ports. This initiative is where that gets tested for real, via the Worker V2 plan's [Phase 6](../../component-architecture/worker-v2/README.md#phase-6-exercise-a-remote-boundary) (deliberately left optional there until deployment independence is actually being tested — this initiative is that trigger).

Adapter surface, now scoped into individual Changes (see Change index below). "Swappable" throughout means **selected by configuration when a process is composed**, with every implementation retained and none deleted — not hot-swapped while running, and not one backend replacing another. Each bullet below is an axis with more than one live option:

- **Queue + messaging** — asynchronous Messages (the existing CloudEvent-shaped `AnyEvent`) as the protocol between components, carried locally by an in-process mailbox router and remotely by Redis Streams under the same component boundary. Components publish through a declaration-bound publisher and receive through a handler. Shared protocol and deployment declarations own stable routing identity and select one carrier realization for the deployment; each process profile consumes that choice, constructs its local carrier resources, and binds the handlers it hosts. Still no separate pub/sub technology, and still independent subscriptions per concern (Engine and Observability each hold their own logical subscription rather than one being a special case of the other) — but the local case is deliberately _not_ Streams-shaped, and `EventBusPort` survives for every event family not yet migrated. See [`docs/component-architecture/in-process-messaging/`](../../component-architecture/in-process-messaging/README.md). The current Worker side is defined separately by [Worker Component Architecture](../../component-architecture/worker/README.md): a process profile retains one real Worker and binds its handler rather than adding another adapter-shaped wrapper.
- **CAS/blob storage** — S3/MinIO alongside `FsArtifactStore`, both live on the `artifacts` config axis (Changes C1 and C3). The filesystem store stays the local default.
- **SQL** — Postgres via Prisma alongside SQLite. SQLite is the lightweight install option for this application and stays a supported profile branch; the goal is that `sql` becomes a real config axis with two live backends, the same as `artifacts` and `messaging`. The schema is already Prisma-based so no model rewrite is needed, but Prisma binds a generated client to one `datasource.provider` — a driver adapter changes how a client reaches a database, not which provider it was generated for. Two backends therefore means two schema roots, two generated clients, two driver adapters, and two migration histories, with model parity guaranteed by repository-owned derivation rather than by anything Prisma provides. Both histories collapse freely while the schema is in flux — zero users, no data to preserve — and start being kept for real once it stabilizes. See [`research/prisma-sql-backend-strategy.md`](./research/prisma-sql-backend-strategy.md).

New adapters alone were not the whole goal. The former `packages/runtime`
proved config-selected composition for one complete embedded profile, but it
conflated reusable lifecycle, generic messaging, product protocol topology, and
that profile's entire concrete dependency graph. C19 split generic lifecycle,
active messaging, and the complete local-system profile into honest owners and
removed `runtime`. The Worker process now supplies the evidence for the next
seam: promoting product topology without turning another package into a new
name for the whole system.

Reordered ahead of `json-schema-migration`/`rate-limiting`/`engine-hardening`/`runtime-storage-consolidation` (see `docs/initiatives/README.md`) — originally scaffolded to run last, once other boundaries had stabilized, but now the intended next initiative after `worker-tools-artifacts`.

## Evolution

Originally scaffolded as one of seven architecture initiatives, sequenced last — a validation exercise to run once every other boundary had stabilized, not a build target in its own right. Reordered to slot 5, right after `worker-tools-artifacts`, once the real motivation became explicit: this initiative exists to build and deploy a real remote worker, not to prove swappability in the abstract (see Summary).

No natural single starting point among the three candidate adapters (queue/messaging, CAS, SQL) — none blocks the others, and picking a "correct" first one didn't seem worth over-planning. Landed on CAS first anyway, once discussed: `ArtifactStorePort`'s surface is the narrowest of the three and already hardened by the `worker-tools-artifacts` refactor, making it the lowest-risk way to prove the adapter pattern before tackling the queue or SQL (see [`arcs/cas-adapter.md`](./arcs/cas-adapter.md)) — not a signal that CAS is more important, just the easiest place to start.

**Whether an out-of-process worker needed a separate event bus, resolved rather than left open.** The worry: worker lifecycle needs to reach both the engine (to advance the run plan) and observability (durable event history for debug/replay) — genuinely different consumers, for different reasons, both needing every event, not a subset. Resolved without adding a second messaging technology: Redis Streams' consumer-group model already gives multiple independent durable readers of the same stream — exclusivity (an entry going to only one consumer) is scoped to consumers _within_ one group, not across groups, so the engine and observability can each run their own consumer group on the same stream and both see everything, acknowledging independently. So there's no EventBus adapter in this initiative at all — Redis Streams (split into separate streams per message category: commands, lifecycle events, telemetry, metrics) is the sole carrier.

**Superseded in part by the mailbox pivot (Changes C9 and C11–C14), which is worth stating precisely because most of the above survived.** What held: no second messaging technology, and independent subscriptions per concern rather than one consumer being privileged over another. What changed: "Streams is the sole carrier" is no longer true. Local delivery is an in-process mailbox router that is deliberately not Streams-shaped — no consumer groups, entry IDs, acknowledgement, or pending recovery — because simulating those in memory buys resemblance rather than correctness. Redis becomes a second carrier under an unchanged component boundary instead of the only one. `EventBusPort` also survives rather than being retired wholesale: only the three HTTP job types migrate first, each remaining family moving as its own protocol slice. The deeper reversal is that components no longer exchange anything request/response-shaped at all — the engine stops awaiting a job and consumes the terminal Message from its own subscription, which is what removes the local/remote protocol split that every earlier revision of this messaging sequence kept trying to paper over. See `arcs/queue-adapter.md`'s Change C9 for the full reasoning and the four revisions it took to get there.

**The remote Worker is now scoped because C18 closed the final infrastructure
prerequisite.** The package seam and the process seam are separate. First move
generic lifecycle, generic messaging, and the shared `local-system` profile to
honest owners; then give multi-topic subscriptions one delivery lane;
split shared deployment topology from process-local handler bindings; give
Observability one ordered Redis route; give Worker and its ingress truthful
lifecycle; only then add and prove a Worker-host app. The current six-Change cut
is recorded in the
[Remote Worker Arc](./arcs/remote-worker.md) and remains splittable when
implementation inventory shows a review is too large.

## Change index

Reordered from the original scaffold after runtime-composition research (see `arcs/cas-adapter.md`'s Change C2 discussion) replaced the original single "wire CAS into runtime" step with a bigger, more honest sequence. This is expected — the original list was a best-effort scaffold, not a commitment; incrementing as real scope becomes clear is the normal process, not a sign of drift.

| Change | Description                                                                    | Status           | Where | See also |
| ------ | ------------------------------------------------------------------------------ | ---------------- | ----- | -------- |
| C1     | S3 CAS adapter (MinIO-backed) + tests                                          | merged (PR #360) | [1]   |          |
| C2     | Shared assembly layer + leaf config types in `packages/runtime`                | merged (PR #361) | [1]   |          |
| C3     | Shared `local-system` profile (real CAS choice) + retrofit `http-server`/`cli` | merged (PR #362) | [1]   |          |
| C4     | `MessageLogPort` + Redis-backed adapter (retitled from "queue" -- see [2])     | merged (PR #363) | [2]   |          |
| C5     | Package hygiene: delete `NodeRouter`/`QueuePort`, real ESLint for `adapters`   | merged (PR #364) | [2]   |          |
| C6     | Work-tracking terminology + documentation migration                            | merged (PR #365) | [3]   |          |
| C7     | `JobExecutorPort` envelope-fidelity fix (local only, prerequisite for C13)     | merged (PR #366) | [2]   |          |
| C8     | Consolidate onto one `JobExecutionPort`; retire `packages/integrations`        | merged (PR #367) | [2]   |          |
| C9     | In-process Message router + mailbox foundation (inert)                         | merged (PR #368) | [2]   |          |
| C10    | Engine package tooling: real ESLint, test typecheck, `clean-*` scripts         | merged (PR #369) | [5]   |          |
| C11    | Worker component root + `JobRunner` (behavior-preserving runway)               | merged (PR #370) | [2]   |          |
| C12    | Worker's Message boundary + terminal construction (inert)                      | merged (PR #371) | [2]   |          |
| C13    | Cut the HTTP JSON job conversation onto Messages (atomic flip)                 | merged (PR #372) | [2]   |          |
| C14    | Log-backed (Redis) delivery under the same Message boundary                    | merged (PR #373) | [2]   |          |
| C15    | Retire `$transaction` in favour of nested writes (no Postgres)                 | merged (PR #374) | [4]   |          |
| C16    | Two provider schema roots, generated clients, narrowed seams (inert)           | merged (PR #375) | [4]   |          |
| C17    | Shared repository contract suites against real SQLite and Postgres             | merged (PR #376) | [4]   |          |
| C18    | Extend `local-system` profile with `postgres` SQL branch                       | merged (PR #377) | [4]   |          |
| C19    | Split runtime package responsibilities                                         | merged (PR #378) | [6]   |          |
| C20    | Multi-topic logical subscriptions through one delivery lane                    | merged (PR #379) | [6]   |          |
| C21    | Declare deployment topology as standalone static data                          | merged (PR #380) | [6]   |          |
| C22    | Bind each process to its host plan rather than the full topology               | in review        | [6]   |          |
| C23    | Add one ordered Redis route for Observability                                  | not started      | [6]   |          |
| C24    | Give Worker truthful lifecycle and controlled ingress                          | not started      | [6]   |          |
| C25    | Prove a separately deployed Worker host                                        | not started      | [6]   |          |

## Next up

1. **C22:** make the routers, carriers, and profile read that manifest, so each
   process binds exactly the handlers it hosts.
2. **C23:** route the selected job Messages into one ordered Redis
   Observability stream while preserving their independent work routes.
3. **C24:** make Worker a truthful managed resource and coordinate command
   intake with active-work settlement.
4. **C25:** add the Worker-host and companion non-Worker process profiles and
   prove the real two-process path over Redis, S3/MinIO, and Postgres.

These are planned review seams, not fixed size targets. An unstarted Change
should split before implementation if its rename-aware inventory or semantic
surface is too large for one review.

## Not yet scoped

- **A general startup-time component-placement compiler.** The explicit
  `local-system`, Engine/API-host, and Worker-host profiles are planned as the
  supported presets. If a third useful topology or an operator need for
  configurable co-location appears, a deployment definition could assign
  components to named host roles and project a process-local host plan instead
  of adding a profile name for every permutation. This is deliberately distant
  work rather than part of C19–C24; the constraints, migration path, and open
  questions are sketched in
  [`research/configurable-component-placement.md`](./research/configurable-component-placement.md).
- **The engine's own step/run self-loop (subscribing to events it publishes itself, purely to advance its own internal state)** — a real, precedented, low-risk fix (mirroring how `ExecuteHttpJsonJobFx` already avoids this), but decoupled from every Change in this initiative: nothing here depends on it, and it doesn't ease anything here either, since the self-loop never touches `MessageLogPort`/Redis at all. Deferred to whenever the engine gets its real core/inbound-outbound refactor. See `arcs/queue-adapter.md`'s Changes C5, C7–C9, and C11–C14 discussion for the full reasoning.
- **`LifecycleEventIngress` — largely resolved by Changes C9, C12, and C13, for the three migrated types only.** The idea was a per-component sink that gets lifecycle facts to observability without the bus. The mailbox design answers both halves for `job.httpjson.submitted`/`.completed`/`.failed`: worker constructs the real event once and publishes it (producing), and observability holds its own explicit logical subscriptions rather than tapping a magic topic (consuming). What stays unscoped is the same thing for every _other_ event family — run, step, flow, replay, limiter, component lifecycle — which keeps using `EventBusPort` and the `observability` topic until each is migrated as its own protocol slice. The general question in the bullet below is unchanged for those.
- **A real cancel/abort protocol across the transport boundary.** Cancellation works today only because everything is in-process: an `AbortSignal` is passed by reference all the way into `fetch` (`worker.ts`'s `combineForProtocolRun`, which merges it with the worker's own protocol timeout). No signal can travel in a Message, so a real cancel needs to become its own Message that a worker honors against its own `AbortController`, plus an engine-side publish at the moment abort is invoked (nothing publishes anything there today — the abort only ever shows up baked into the eventual failed outcome). Deliberately not built in Changes C9 and C11–C14, and the mailbox pivot makes the gap narrower rather than wider: nothing exercises the engine-side abort path today, and the worker's own timeout-driven cancellation keeps working untouched, since it never depended on a caller-supplied signal. Change C11 deleted `JobExecutionOptions` outright rather than rehoming it, threading `callerSignal?: AbortSignal` directly through worker instead — the local core keeps its signal without pretending the signal is part of the protocol. Recorded because leaving it out is an asymmetry between the two paths, not a non-issue. One concrete prerequisite found while scoping it: `JobFailedData` carries only `status`/`output`/`message`, so worker's already-existing `CANCELLED` error code (`job-result.factories.ts`) is dropped before the fact ever reaches a published event — cancellation is currently indistinguishable from any other failure without string-matching prose.
- **Finishing the test-typechecking and real-lint migrations for the packages Change C10 does not cover — still unscoped, and it should land before this initiative is called done.** Both migrations are in-flight rather than absent, and the remaining work is completing them package by package; `engine` was pulled out and scoped as Change C10 (see [`arcs/package-tooling.md`](./arcs/package-tooling.md)), which is also where later increments belong. **Test typechecking**: five packages (`adapters`, `artifacts`, `events`, `worker`, and `runtime` as of Change C9) carry a `tsconfig.typecheck.json` — `extends ./tsconfig.json`, `rootDir: "."`, `noEmit: true`, `include: ["src", "tests"]` — with `typecheck` pointed at it, so the build config keeps `include: ["src"]` and tests never reach `dist`. The rest still typecheck `src` only, and vitest transpiles without checking, so their tests are verified by nothing. That is not theoretical: Change C9 shipped a latent type error in its own new test (`message.data.output` against an erased union — correct at runtime, unsound on paper) that no gate caught, which is what prompted migrating `runtime` inside that Change. It also means `@ts-expect-error` type-level assertions are silently inert in unmigrated packages, which matters more as the messaging contracts push real safety into type parameters. **Lint**: real in 8 packages (`adapters`, `artifacts`, `events`, `ports`, `runtime`, `types`, `worker`, `workbench`), `echo lint` in 15, and absent entirely in `apps/desktop`. The two migrations have been moving together — every typecheck-migrated package is also in the real-lint set — so finishing them one package per Change, the way Change C9 did for `runtime` and Change C10 does for `engine`, is the established shape. Expect real findings rather than a config flip: enabling both on `runtime` surfaced three genuine `no-case-declarations` errors and a test helper typed `ManagedResource<unknown>` against typed slots.
- **How observability gets ingested for every event family the mailbox slice does _not_ migrate. Flagged during Change C7, narrowed during Change C8, and largely answered for the three HTTP job types by Changes C9, C12, and C13 — the open part is everything else.** The old framing asked who reads facts and writes them down once `EventBusPort` is gone, and worried most about a local, no-broker deployment having no answer at all. The mailbox answers that: a local carrier with explicit logical subscriptions _is_ the local observability ingress, so it needs no separate direct-sink design and no per-component bridge. What remains genuinely unscoped is that run, step, flow, replay, limiter, and component-lifecycle events still arrive through the bus's magic `observability` topic, and each has to migrate as its own coherent protocol slice, chosen from evidence rather than in one sweep. Two things worth carrying into whichever slice comes next. First, **emission order/timing is behavior, not an implementation detail** — Change C13 deliberately changes the HTTP job ordering (worker publishes the terminal Message, then the engine consumes and advances, instead of the engine advancing first and publishing a reconstruction afterward), and anything reading the event log sees that difference; further migrations should decide their ordering consciously rather than inheriting it. Second, **truthful sink completion is still absent**: `ObservabilityTap` catches and logs every sink failure, `ReplaySink` discards the promise from `recordEvent()`, and `SqlRunProjectionSink` starts a background flush and returns immediately — all tolerable while delivery is fire-and-forget and unacknowledged, all of it a correctness prerequisite before any acknowledged (log-backed) carrier consumes these families.

[1]: ./arcs/cas-adapter.md
[2]: ./arcs/queue-adapter.md
[3]: ./arcs/work-tracking-migration.md
[4]: ./arcs/sql-adapter.md
[5]: ./arcs/package-tooling.md
[6]: ./arcs/remote-worker.md
