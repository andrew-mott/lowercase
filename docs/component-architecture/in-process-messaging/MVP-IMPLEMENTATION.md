# In-Process Messaging MVP — First Project Slice

Status: active first-slice guide; the C9 mailbox foundation is implemented and
the Worker runway plus live component cutover remain proposed.

This document applies the in-process Message mailbox design to the repository as
it exists now. It records the intended pivot, the first useful vertical slice,
the current seams it should use, and the boundaries that keep the work small.

It is not an archived turn-by-turn implementation plan. Before coding begins,
the chosen Change still follows the discussion, planning, build, verification,
and “What actually landed” workflow in
[`docs/work-tracking.md`](../../work-tracking.md).

## Read this with

- [`README.md`](./README.md) is the durable mailbox contract, ownership guide,
  and incremental growth path.
- [Message Carrier Architecture](../../initiatives/swappable-infrastructure/research/message-carrier-architecture.md)
  is the fuller research recommendation. Its bounded carrier, lifecycle,
  delivery health, and Redis runner are intentionally deferred here.
- [Swappable Infrastructure (I5)](../../initiatives/swappable-infrastructure/INITIATIVE.md)
  and its [Queue Adapter Arc](../../initiatives/swappable-infrastructure/arcs/queue-adapter.md)
  hold the authoritative Change history and current implementation scope.
- [Worker Component Architecture](../worker/README.md) defines the current
  Worker root, collaborators, and Message boundary.
- [Worker Migration](../worker/MIGRATION.md) defines the minimum structural
  runway and the atomic live cutover this guide relies on.
- [ADR-0005](../../adr/0005-package-tier-taxonomy.md) defines package ownership.

## Outcome

Make one complete HTTP JSON job conversation use the same asynchronous Message
protocol across Engine, Worker, and Observability in the local profile:

```text
Engine
  -> publishes job.httpjson.submitted
       -> Worker subscription mailbox
       -> Observability command mailbox

Worker
  -> executes the existing command-oriented core
  -> publishes one job.httpjson.completed or job.httpjson.failed
       -> Engine terminal mailbox
       -> Observability terminal mailbox
```

Engine's publisher resolves after the submitted Message is accepted into the
two local mailboxes. It does not wait for Worker execution. Worker's terminal
publisher resolves after both terminal mailboxes accept the Message. It does
not wait for Engine progression or Observability sinks.

Every other EventBus path remains unchanged in this slice.

## Why this should be next

The current direct `JobExecutionPort` solved the old pairwise integration-package
problem, but it still models the cross-component exchange as request/return.
Continuing from it into a correlated Redis client would preserve two behavioral
protocols:

- direct invocation and a returned outcome locally; and
- asynchronous command/result delivery remotely.

The mailbox slice establishes the stable component boundary before more remote
wiring is built. The existing Redis log driver remains useful underneath the
later log-backed carrier, so completed lower-level work is not discarded.

The thing to build is not a reusable mailbox framework in isolation. It is one
small local router/mailbox implementation exercised immediately by one real,
multi-hop component conversation.

## Current planning boundary

I5 Change C9 has landed the inert messaging contracts, publication declaration
helpers, router, and mailbox. It did not wire a component or change runtime
behavior. The live HTTP JSON cutover remains the next protocol slice.

The Worker review after C9 found one prerequisite the original slice guide did
not express: establish a stable Worker component root before attaching the
Message handler. That behavior-preserving runway may be its own Change or the
first phase of the cutover, as the authoritative Initiative discussion decides.
The three Message types must still move atomically in a running profile.

Preserve merged Changes C4 and C7–C9 as point-in-time evidence. This document
does not assign or edit Change numbers; the Initiative and Arc remain the
authoritative indexes.

## Preserve, pause, and replace

### Preserve

- `AnyEvent<T>` and the existing CloudEvent-shaped job schemas.
- `buildEvent()` as the non-publishing construct-and-validate helper.
- `MessageLogPort` and `RedisMessageLog` as lower-level remote log machinery.
- Existing one-job behavior: fixed protocol executors, reference resolution,
  artifact handling, modeled `JobResult`, Worker capacity, and resource permits.
- `ExecuteJobCommand` as a temporary internal migration seam where it keeps the
  cutover reviewable, not as the renewed component boundary.
- Engine's reducer/planner/effect core and its existing `JobFinishedMsg` path.
- Observability sinks and the EventBus for every unmigrated Message type.
- Runtime as the only layer that imports and binds multiple components.

### Pause

- The unstarted correlated Redis request/client path.
- A `direct | redis-streams` implementation of `JobExecutionPort`.
- Further direct component relationships built in the name of local wiring.
- Broad EventBus retirement.
- Formal command/fact/reply taxonomy work.

### Replace for the HTTP JSON slice

- Engine's direct `JobExecutionPort.execute()` dependency with a bound submitted
  Message publisher.
- Engine's independently reconstructed terminal event with the canonical
  terminal Message built by Worker.
- The returned `JobExecutionOutcome` control-flow path with Engine's terminal
  Message handler.
- `JobExecutionOptions` with an equivalent Worker-internal execution option
  before deleting the direct port that currently declares it.
- EventBus delivery of the three migrated HTTP job types with the new mailbox
  publications and explicit Observability subscriptions.

## Current repository shape

### Runtime composition

[`local-system.profile.ts`](../../../packages/runtime/src/profiles/local-system/local-system.profile.ts)
currently:

1. constructs `InMemoryEventBus`;
2. constructs Worker as `JobExecutionPort` through `createWorkerCore()`;
3. injects that object directly into Engine;
4. constructs Observability and Limiter around the EventBus; and
5. assembles managed lifecycle resources.

[`messaging.config.ts`](../../../packages/runtime/src/config/messaging.config.ts)
contains only `{ kind: "direct" }`, and the profile does not currently branch on
or otherwise use it.

Worker is not presently a managed runtime resource. The mailbox MVP does not
need to make it one because the router has no start, drain, or stop lifecycle.
That omission also creates a known teardown race: queued handlers are outside
the managed reverse-stop order and can continue while or after Engine,
Observability, and sinks are being stopped. Constrain initial use accordingly;
do not imply `runtime.stop()` safely drains the new path.

### Engine HTTP dispatch

[`step-planned.planner.ts`](../../../packages/components/engine/src/planners/step-planned.planner.ts)
creates two effects from the same job ID, scope, and data:

- `EmitJobHttpJsonSubmitted`, which publishes a submitted event to the EventBus
  for observation; and
- `ExecuteHttpJsonJob`, which calls Worker through `JobExecutionPort`.

[`execute-httpjson-job.effect.ts`](../../../packages/components/engine/src/effects/execute-httpjson-job.effect.ts)
awaits the returned outcome, reconstructs a completed/failed event inside
Engine, advances the internal Engine queue directly, and publishes the
reconstruction to the EventBus.

Engine's effect runner currently invokes async handlers without awaiting or
tracking their Promises. The current direct Worker call therefore already
escapes Engine's synchronous reducer loop, but without a named admission,
failure, or lifecycle boundary. The mailbox makes that detachment explicit.
Truthful completion of every Engine effect is larger hardening work and is not a
prerequisite for the unbounded local admission path, but a rejected publication
must not become an unhandled Promise rejection.

Engine already exposes `handleJobFinished(AnyEvent)`, which translates a
terminal job event into the existing `JobFinishedMsg` and internal processing
path. A narrow HTTP terminal handler can delegate to it in the first slice.

### Worker boundary

The current construction chain is approximately:

```text
new Worker(...)
  -> withWorkerCapacity(...)
  -> createCommandWorker(...)
  -> withMessageJobExecution(...)
  -> JobExecutionPort
```

Runtime therefore retains a narrowed direct-call object rather than one stable
Worker component. Do not add a submitted-Message wrapper outside that chain.
Follow the Worker migration guide first: make the public Worker own capacity,
delegate one-job mechanics to a focused JobRunner, and let runtime retain the
actual Worker. The new handler is a Worker method bound by runtime.

The current direct `JobExecutionRequest` is not a literal CloudEvent envelope:
it flattens job scope and data, carries `traceId`, and omits canonical fields
such as Message ID, source, time, and spec version. Do not reuse that type as
the new Message contract. Worker receives and retains the complete submitted
Message; an internal projection is justified only where execution meaning
actually differs.

Worker currently emits a separate internal `WorkerLifecycleEvent` vocabulary
through a console sink. That diagnostic path is not the authoritative
cross-component terminal protocol. It can remain temporarily while the new
boundary constructs the one canonical terminal Message; retiring or unifying
the internal lifecycle vocabulary can be a focused follow-up.

`JobExecutionOptions` currently lives in the same direct-port file as
`JobExecutionPort`, but Worker execution still uses its `AbortSignal`. Before
deleting that port file, rehome the option as Worker-internal execution control.
This preserves local cancellation without pretending an `AbortSignal` can be
carried in a Message.

`buildEvent()` also requires a Message `source`, while current `WorkerConfig`
has no Worker identity. The local profile must pass an explicit Worker source
into Worker construction—for example, a local Worker source chosen in Change
discussion. Terminal Messages must identify Worker as their source rather than
silently retaining Engine attribution.

The Worker architecture test currently bans `AnyEvent` imports across every
Worker source file. Narrow the rule so protocol, storage, permits, and focused
execution files remain Message-envelope-free while the Worker root and an
explicit `messaging/` boundary may import the envelope types they exist to
handle.

### Observability

[`ObservabilityTap`](../../../packages/components/observability/src/core/tap.ts)
privately subscribes to the EventBus's `observability` topic and then invokes
its sinks. Extract or expose one bus-independent async `handleMessage()` method
containing that sink loop. The legacy EventBus callback and the new mailbox
handlers can both call it for disjoint Message types.

For this MVP, current sink failure behavior may remain best-effort: report an
individual sink error and continue. Truthful required-sink acknowledgement,
idempotency, and managed Observability health belong to later delivery
hardening.

The two new Observability mailboxes and the legacy EventBus callback are not one
serialized component-wide ingress lane. They may overlap. That is no worse than
the current fire-and-forget bus's broad scheduling guarantee, but it is weaker
than the mature carrier's shared Observability capacity group and must not be
described as global serialization.

### Limiter

The current Limiter component listens only to the dormant `worker.slot.*`
protocol. Worker already has live local capacity and resource-permit mechanisms.
Do not add Limiter to the HTTP terminal topology merely because a future
architecture might use it there.

## The first authoritative topology

Declare exactly two publications and four logical subscriptions:

| Publication ID         | Allowed type(s)                                 |
| ---------------------- | ----------------------------------------------- |
| `http-job-command.v1`  | `job.httpjson.submitted`                        |
| `http-job-terminal.v1` | `job.httpjson.completed`, `job.httpjson.failed` |

| Subscription ID                      | Publication            | Handler owner |
| ------------------------------------ | ---------------------- | ------------- |
| `worker.http-job-command.v1`         | `http-job-command.v1`  | Worker        |
| `observability.http-job-command.v1`  | `http-job-command.v1`  | Observability |
| `engine.http-job-terminal.v1`        | `http-job-terminal.v1` | Engine        |
| `observability.http-job-terminal.v1` | `http-job-terminal.v1` | Observability |

The two Observability subscriptions own independent mailboxes in the MVP and
may process command and terminal Messages concurrently or in a different global
order. Earlier architecture decisions permit that. A later Observability-wide
capacity group can serialize all its subscriptions if its mutable sink state
requires it.

Do not add an `all` or wildcard route. As new publications migrate,
Observability receives an explicit logical subscription to each one.

## One-authoritative-path rule

The following three Message types move together:

```text
job.httpjson.submitted
job.httpjson.completed
job.httpjson.failed
```

For one running profile, each logical occurrence must have exactly one
authoritative publication path.

After cutover:

- submitted is published once by Engine through `http-job-command.v1`;
- Worker executes only the Worker subscription's delivery;
- terminal is constructed once by Worker from its modeled `JobResult`;
- terminal is published once through `http-job-terminal.v1`;
- Engine advances only from its terminal subscription; and
- Observability receives the exact submitted and terminal envelopes through its
  own subscriptions.

Do not also publish these three occurrences onto the legacy EventBus. Doing so
would double-record Observability and could create a second authoritative
execution or Engine-progression path.

All other event types continue using `EventBusPort`, including Engine's run/step
self-loop, MCP, replay mode, component lifecycle, and the dormant Limiter
messages.

## Suggested package and file shape

This is the smallest shape that already occupies the fuller architecture's
durable locations:

```text
packages/
  ports/
    src/
      messaging/
        message-publisher.port.ts            # landed C9
        message-handler.ts                   # landed C9
        message-topology.types.ts            # landed C9
        index.ts                             # landed C9
      index.ts                               # messaging exports landed C9

  runtime/
    src/
      messaging/
        in-process/
          in-process-message-router.ts       # landed C9
          subscription-mailbox.ts            # landed C9
        http-job.topology.ts                  # add declarations/bindings
      profiles/
        local-system/
          local-system.profile.ts             # build and bind messaging
          build-engine.ts                     # inject command publisher
      worker/
        create-worker.ts                      # compose command core + boundary
      config/
        messaging.config.ts                   # `in-process` vocabulary
    tests/
      messaging/
        subscription-mailbox.test.ts          # landed C9
        in-process-message-router.test.ts      # landed C9
        http-job.vertical-slice.test.ts        # add

  components/
    engine/
      src/
        message-boundary/
          httpjson-terminal.handler.ts        # add
        effects/
          publish-httpjson-job.effect.ts      # add/replace current pair
        engine.ts                             # bind existing terminal path
        engine.types.ts                       # publisher dependency/effect
        registries/effect.registry.ts         # wire publisher effect
        planners/step-planned.planner.ts      # produce one publish effect

    worker/
      src/
        worker.ts                             # stable component root + handler
        execution/
          job-runner.ts                       # focused one-job algorithm
          worker-capacity.ts                  # owned capacity collaborator
        messaging/
          httpjson-submission.ts              # pure interpretation/projection
          worker-messages.ts                  # canonical envelope construction
        index.ts                              # export Worker construction
      tests/
        architecture.test.ts                  # permit boundary-only AnyEvent
      package.json                            # add runtime events dependency

    observability/
      src/
        core/tap.ts                           # expose async Message ingestion
      tests/
        message-ingestion.test.ts             # add focused coverage

apps/
  cli/src/runtime.config.ts                   # update messaging vocabulary
  http-server/src/runtime.config.ts           # update messaging vocabulary
```

Existing files likely changed or retired during cutover include:

- `packages/ports/src/job-execution/job-execution.port.ts` and
  `packages/ports/src/engine/engine.port.ts`;
- Engine's `emit-job-httpjson-submitted.effect.ts`,
  `execute-httpjson-job.effect.ts`, effect registry, planner, dependency types,
  and their focused tests;
- Worker's `worker.ts`, `worker-capacity.ts`, `job.contracts.ts`,
  `message-job-execution.ts`, `job-message.mappers.ts`, exports, architecture
  test, and direct-wrapper/mapper tests;
- runtime's `build-engine.ts`, `local-system.profile.ts`, `create-worker.ts`,
  messaging config, and local-profile tests;
- Observability's tap, port surface if needed, build wiring, and ingress tests;
  and
- CLI and HTTP server runtime configurations.

Treat this as an inventory for the real Change plan, not an instruction to
mechanically edit or delete every named file. Search live imports after cutover
and remove only what no longer has a valid caller.

This is directional, not a demand that every helper receive its own file. Keep
the ownership and dependency boundaries even if implementation discovers a
smaller file count.

Do not place the router in `packages/integrations`, name a file after two
components, or reuse the existing chunk-oriented in-memory `StreamPort`
implementation.

## Construction order

Engine needs the command publisher, Worker needs the terminal publisher, and
the router eventually needs both components' handlers. Avoid solving this
composition cycle with service location or mutable component dependencies.

A simple runtime construction order is:

1. Create and validate the two publication declarations and four subscription
   declarations.
2. Create the in-process router from those declarations.
3. Resolve declaration-bound command and terminal publishers.
4. Build the actual Worker with its JobRunner, owned capacity collaborator,
   terminal publisher, and explicit source.
5. Retain that Worker and use its submitted-Message method as the handler.
6. Build Engine with the command publisher.
7. Build Observability and expose its bus-independent ingestion handler.
8. Bind Worker, Engine, and Observability handlers to the four declared
   subscriptions.
9. Assert that every local subscription has exactly one handler.
10. Construct services and the managed runtime only after the messaging graph is
    complete.

Binding handlers during construction is acceptable. Once the graph is complete,
do not expose registration to components or application code.

## Build sequence

This is durable sequencing guidance. The actual Change plan may combine or
split steps while preserving the authoritative cutover rule.

### 1. Add messaging contracts and declaration helpers — landed in C9

- C9 added `MessageOf<T>`, `MessagePublisher<T>`, and `MessageHandler<T>` under
  `packages/ports/src/messaging`.
- It added stable publication and logical-subscription declaration types beside
  them; runtime owns their values even though the shared types live in ports.
- It exported these types from `@lcase/ports` without exposing a router or
  mailbox, and added runtime-owned declaration helpers.
- It tested type authority and generic completeness without declaring the
  concrete HTTP job topology values.

The two HTTP job publications and four subscription IDs are added only during
the live cutover described below.

C9 deliberately did not add subscription lifecycle, transport IDs,
`MessageLogPort` methods, shared component capacity, retry, health, or dynamic
topic APIs.

### 2. Build the local router and mailbox — landed in C9

- C9 implemented one unbounded FIFO queue per logical subscription.
- It schedules delivery asynchronously and never invokes a handler within the
  publish call stack.
- It processes up to the binding's positive `maxInFlight`, defaulting to one.
- It prepares independent immutable snapshots for all fanout branches before
  enqueueing any branch.
- It catches and reports handler failures with identity context, then continues.
- It tracks global outstanding deliveries and exposes runtime/test-only
  `whenIdle()`.
- Its contract tests cover the implemented semantics before component
  integration.

Do not add backpressure or graceful draining as “small extras.” Their hard part
is policy, not queue data structures.

### 3. Establish Worker and add its Message boundary

- Complete the minimum structural runway in the Worker migration guide without
  changing live behavior: runtime must retain one actual Worker, capacity must
  be an owned collaborator rather than a same-interface decorator, and one-job
  mechanics must have a focused internal home.
- Add the submitted-Message handler to that Worker; do not wrap it in another
  public object or expose the internal runner to runtime.
- Accept and retain the literal `AnyEvent<"job.httpjson.submitted">` envelope.
- Project it to `ExecuteJobCommand` only as a temporary internal seam where that
  keeps existing execution behavior intact.
- Delegate execution and map a modeled `JobResult` to one literal
  `job.httpjson.completed` or `job.httpjson.failed` Message.
- Construct that terminal Message once with `buildEvent()` and the submitted
  Message's scope/trace context.
- Supply an explicit runtime-owned Worker `source` to the boundary factory and
  use it for terminal construction.
- Await terminal publication acceptance before resolving the Worker handler.
- If the core unexpectedly throws instead of returning a modeled result, reject
  the handler and publish no invented business terminal Message.

Narrow Worker's architecture test to permit envelope imports only in the Worker
root and its explicit messaging boundary. Do not let Message envelope or
carrier types spread into JobRunner, protocol executors, capacity, artifacts,
or permit code.

### 4. Move Engine onto publication and terminal ingestion

- Replace the paired submitted-observation/direct-execution effects with one
  effect that builds and publishes the canonical submitted Message.
- Inject the bound command publisher rather than `JobExecutionPort` into this
  effect path.
- Bind a narrow terminal handler that type-checks the two allowed terminal
  types and delegates to the existing `handleJobFinished()`/`JobFinishedMsg`
  progression.
- Remove Engine's terminal reconstruction. It must process the literal Message
  Worker published.
- Ensure a rejected publication is caught and reported rather than becoming an
  unhandled Promise rejection in the current fire-and-forget effect runner.

For this slice, make that policy concrete: the new publish effect catches its
own construction/admission rejection, reports it through a non-mailbox error
path, and leaves the affected run stalled for diagnosis. Alternatively, attach
the same guarded rejection handling centrally in `executeEffect()`. Do not use a
bare ignored Promise. Managed failure state is later hardening.

The existing `jobFinishedReducer` is not duplicate-safe and dereferences an
unknown run before guarding it. The normal first-slice topology supplies an
expected active run, but the boundary should report an unknown/stale terminal
rather than claim broad validation. Active-job identity checks and duplicate
handling remain later Redis prerequisites.

Do not refactor the entire Engine effect execution or move its run/step
self-loop in this slice.

### 5. Give Observability a bus-independent ingress

- Extract `handleMessage(message)` from the existing EventBus subscription
  callback.
- Have the legacy callback invoke that method for unmigrated types.
- Bind the two HTTP job subscriptions directly to the same method.
- Preserve current sink selection and best-effort error handling.
- Verify the command and terminal objects observed are the exact canonical
  envelope values created by Engine and Worker, modulo the router's independent
  immutable snapshots.

Do not introduce a separate local observability bridge or component-pair
package.

### 6. Wire the local profile

- Build the messaging graph in `createLocalSystem()` before application
  services can publish work.
- Replace `{ kind: "direct" }` with honest `in-process` messaging vocabulary in
  the config and app configurations, unless Change discussion chooses to omit a
  single-variant setting entirely for now.
- Keep the EventBus and its managed resource for every unmigrated flow.
- Do not add the mailbox to managed lifecycle until it has real lifecycle
  semantics.
- Keep `whenIdle()` private to runtime/tests or expose it only as a clearly
  diagnostic local-system hook.

### 7. Remove the superseded live path

Once the vertical test passes:

- remove the direct `JobExecutionPort` dependency from Engine and runtime;
- remove the direct wrapper from the authoritative local profile;
- stop publishing the three migrated HTTP job types to EventBus;
- delete `JobExecutionRequest`/`JobExecutionOutcome` and their direct mapper if
  no live caller remains;
- rehome `JobExecutionOptions` as a Worker-internal execution option before
  deleting its current port file; and
- update comments and tests that describe Engine as reconstructing Worker
  results.

Temporary dead compatibility exports may be removed in the same Change or an
immediate cleanup Change, but no running profile may retain a second execution
or Engine-progression path.

## Verification

### Mailbox contract tests

The local implementation is not complete without tests proving:

1. `publish()` resolves while a recipient handler remains blocked.
2. A handler is never called inline during `publish()`.
3. A `maxInFlight: 1` subscription processes Messages FIFO with exactly one
   active handler, while a larger configured bound is never exceeded.
4. Two subscriptions receive independent copies of one publication.
5. A blocked Observability subscription does not block Worker or Engine.
6. A failed subscription does not affect another subscription's copy.
7. A failure is reported with subscription and Message identity, and that
   mailbox continues with its next Message.
8. A failed delivery is not retried automatically.
9. A disallowed Message type rejects before any branch receives it.
10. Duplicate or incomplete topology fails during construction.
11. Recipient mutation cannot affect the publisher or another recipient.
12. Publishing the same Message ID twice creates two deliveries.
13. `whenIdle()` waits for handler-caused downstream publication.
14. `whenIdle()` resolves after a failed attempt is reported.

### Component boundary tests

- Worker maps the literal submitted envelope to the existing command exactly.
- Worker publishes completed and failed terminal Messages with preserved job,
  run, step, flow, capability, tool, and trace correlation.
- Worker publishes no terminal Message for an unexpected thrown dependency.
- One normal-path terminal delivery reaches Engine's `JobFinishedMsg` path once.
- An unknown/stale terminal is reported rather than crashing a mailbox loop.
- Observability ingests submitted and terminal Messages through the same sink
  logic as legacy events.

Do not describe this as exactly-once handling. The mailbox performs no
deduplication, and Engine does not yet protect an active job with a terminal
Message-ID/job-ID ledger. Publishing the same terminal twice may advance Engine
twice; duplicate safety is later at-least-once/Redis hardening.

### Vertical-slice test

Build the real local topology with test doubles only at expensive external
boundaries, then prove:

```text
publish submitted
-> publisher resolves before protocol execution completes
-> Worker finishes
-> terminal fanout reaches Engine and Observability independently
-> router reports idle
-> Engine state reflects the terminal result
-> observed submitted and terminal identities correlate
```

Add both completed and modeled-failure cases. Include one slow or failing
Observability handler to prove it cannot block Engine progression.

This should be an automated composition test of the real router and component
boundaries with fakes at expensive protocol, artifact, and repository edges. It
need not call `createLocalSystem()`, which currently hardwires the Prisma
singleton, filesystem paths, global `fetch`, and always-attached SQL/Eval sinks.
A real `createLocalSystem()` HTTP job is a separate manual smoke check unless
the Change deliberately adds the heavier fixture infrastructure.

### Repository checks

Run proportionate package checks during development, then the workspace gates
before the Change is considered complete:

```text
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Also retain or add architecture tests proving:

- components do not import one another;
- components do not import runtime or concrete carrier implementations;
- Worker envelope imports remain isolated to the Worker root and its explicit
  `messaging/` boundary;
- the EventBus does not receive the three migrated Message types; and
- no active Engine dependency remains on direct `JobExecutionPort` after
  cutover.

## Definition of done

The first slice is done when:

- the authoritative I5 Change discussion records the mailbox pivot;
- local runtime topology is static and fully bound before use;
- component-facing messaging surface is limited to bound publisher and handler
  contracts;
- the HTTP JSON submitted/completed/failed conversation uses Messages end to
  end;
- Engine never awaits Worker processing;
- Worker constructs the one canonical terminal Message;
- Engine and Observability consume independent terminal copies;
- every migrated recipient runs through its own FIFO mailbox;
- handler failures are reported and isolated;
- the composed vertical test completes real Engine/Worker Message behavior;
- the current local profile completes one HTTP JSON job in a documented manual
  smoke check, unless equivalent profile fixture infrastructure is added;
- contract, component, vertical, and architecture tests pass;
- the old direct path is not live; and
- no deferred reliability feature is implied by names, types, or comments.

## Explicit first-slice limitations

### Throughput

The C9 foundation supports per-subscription `maxInFlight`. The Worker binding
uses `maxConcurrentJobs`, while Engine and Observability remain at one for this
slice. This preserves current Worker parallelism without pretending mailbox
configuration is the final component invariant: Worker still owns and enforces
its execution capacity. Shared capacity across several subscriptions and fair
scheduling remain later work.

### Shutdown

There is no graceful mailbox drain. Stopping the process may abandon accepted
or running deliveries. This is especially visible in the CLI, which stops its
runtime as soon as command parsing completes. Mailbox handlers may also continue
after managed Engine, Observability, or sinks have stopped because the mailbox
is absent from the runtime's reverse-stop sequence.

Either accept and visibly constrain that CLI/profile limitation during the MVP,
or defer those uses until cross-transport completion and draining exist. Calling
`whenIdle()` immediately after a service request is not sufficient: the initial
`run.requested`, Engine self-loops, or later effects may still be pending on the
legacy fire-and-forget EventBus and therefore not counted by the mailbox. Do not
silently call `whenIdle()` a production drain.

### Failure

A handler gets one in-process attempt. Failure is reported and discarded; it is
not retained, retried, or reflected in managed health. This is weaker than the
future Redis path and must remain visible in logs/tests. A Worker or Engine
delivery failure can leave the current run stalled; failure isolation limits
blast radius but does not manufacture recovery.

### Capacity

Mailboxes are unbounded. A sustained producer/consumer mismatch can grow
process memory. Queue-depth instrumentation and a soft warning threshold should
precede hard limits; bounded admission and backpressure are separate design
work because cyclic component publication can deadlock under a naive wait-for-
space policy.

### Durability

Process failure loses all queued Messages. This profile is local and ephemeral.
The persistent Redis log is a later implementation behind the same component
boundary, not a guarantee supplied by this mailbox.

### Completion truth

Mailbox `whenIdle()` knows that handler Promises settled, not that every nested
legacy EventBus callback or current fire-and-forget Engine effect completed.
Broader truthful completion requires later Engine and Observability hardening.

## Keep out of this slice

- Redis publishing or consumption through the new carrier.
- Changes to `MessageLogPort` made speculatively for local delivery.
- EventBus replacement outside the three HTTP job types.
- MCP migration.
- Limiter migration or a new limiter protocol.
- Engine run/step self-loop cleanup.
- Multiple Worker instances.
- Multiple Engine instances.
- Dynamic routing or subscription APIs.
- Backpressure, byte limits, retry, draining, and health state.
- File-backed mailbox persistence.
- Cancellation protocol design.
- Event schema generation or events-to-messages renaming.
- Required-sink durability/idempotency work in Observability.
- Shared artifact-storage changes needed for a genuinely remote Worker host.

## If one Change becomes too large

The inert messaging foundation already landed in C9. The remaining work may be
reviewed as a behavior-preserving Worker runway followed by the live protocol
cutover. The runway may reorganize Worker ownership and preserve the current
direct route temporarily; it must not add a second live Message route.

The protocol slice itself remains atomic: add all three component boundaries
and cut the complete HTTP conversation over together.

Do not split the live cutover into “submitted first” and “terminal later,” and
do not merge a state where Engine can advance from both a direct return and a
terminal subscription.

## After the MVP

Do not immediately implement the full carrier. Observe the working local path
and choose the next problem from evidence.

A reasonable progression is:

1. queue-depth, failure-count, and handler-duration instrumentation;
2. strict shared Message codec and size reporting;
3. graceful intake stop, causal drain, and seal;
4. bounded capacity with an explicit non-deadlocking overflow policy;
5. retained failures, health, and explicit retry where handlers are safe;
6. shared capacity and fair scheduling when a component gains several
   subscriptions;
7. log-backed runtime delivery over the existing `MessageLogPort`;
8. a truly separate Worker host with shared artifact infrastructure; and
9. additional EventBus families migrated one coherent protocol slice at a
   time.

The durable architecture and component locations should survive that growth.
The internal mailbox scheduler is allowed to change substantially.
