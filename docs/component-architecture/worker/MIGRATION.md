# Worker Component Migration

Status: proposed migration guide; not an implementation plan or ADR.

This guide moves the current Worker from a callable, multiply wrapped
request/return capability to the component shape defined in
[`README.md`](./README.md). It is deliberately unblock-first:

1. establish one real Worker root without changing the live protocol;
2. move the complete HTTP JSON conversation onto Messages and remove the
   temporary direct path in one atomic cutover; and
3. use the working slice, rather than speculation, to choose later hardening.

The guide names stages, not Initiative Changes. The active Initiative and Arc
remain responsible for numbering, scoping, and recording the work that is
actually approved.

Read this with:

- [Worker Component Architecture](./README.md), the durable target;
- [In-Process Message Delivery](../in-process-messaging/README.md), the local
  carrier contract;
- [First Project Slice](../in-process-messaging/MVP-IMPLEMENTATION.md), the
  original application of that contract; and
- [Swappable Infrastructure queue-adapter Arc](../../initiatives/swappable-infrastructure/arcs/queue-adapter.md),
  the point-in-time Change history and current initiative context.

## Outcome

After this migration, runtime constructs and retains one actual `Worker`
instance. Runtime binds that instance's submitted-Message handler to the
selected carrier and injects a publisher already bound to Worker's terminal
publication.

```text
Engine
  -> publishes job.httpjson.submitted
  -> carrier admits and independently delivers copies
       -> Worker.handleHttpJsonSubmitted()
            -> WorkerCapacity
            -> JobRunner
            -> Worker builds and publishes one terminal Message
  -> carrier independently delivers terminal copies
       -> Engine handles the literal terminal Message
       -> Observability handles the literal terminal Message
```

The local mailbox and a future Redis host differ in delivery mechanics. They
do not produce different Worker implementations.

Inbound and outbound remain useful directional vocabulary. They do not require
mirrored `inbound/` and `outbound/` directory trees. A method on Worker may be
its inbound boundary; a bound publisher may be its outbound dependency.

## Non-goals

This migration does not also design:

- a Redis worker host;
- retry, reclaim, deduplication, reconciliation, or an outbox;
- graceful mailbox drain or Worker shutdown;
- bounded mailbox backpressure;
- cross-process cancellation;
- multiple competing Worker instances;
- a command/event/reply/telemetry taxonomy;
- MCP migration;
- Limiter participation in HTTP JSON job delivery; or
- full EventBus retirement.

Do not add placeholders for these features while moving the first conversation.

## Current repository shape

### Live construction chain

The current local profile constructs Worker through this chain:

```text
createLocalSystem()
  packages/runtime/src/profiles/local-system/local-system.profile.ts

  -> createWorkerCore()
       packages/runtime/src/worker/create-worker.ts

       -> createWorker()
            packages/components/worker/src/worker.ts

            -> withMessageJobExecution()
                 packages/components/worker/src/message-job-execution.ts

                 -> createCommandWorker()
                      packages/components/worker/src/worker.ts

                      -> withWorkerCapacity()
                           packages/components/worker/src/worker-capacity.ts

                           -> new Worker(...)
                                module-private class in worker.ts
```

The names obscure the ownership:

- runtime's `createWorkerCore()` returns the outer `JobExecutionPort`, not the
  raw execution core;
- the module-private `Worker` implements one-job orchestration;
- `withWorkerCapacity()` owns real, long-lived semaphore state outside that
  object;
- `withMessageJobExecution()` is stateless translation between the shared
  direct-call request/outcome and Worker's command/result types; and
- runtime names the returned value `jobExecution`, passes it to Engine, and no
  longer retains a Worker identity.

`createLocalResourcePermit()` owns another, separate set of long-lived
semaphores keyed by resource. Those permits are not duplicate Worker capacity:
they constrain a resolved external resource, while Worker capacity constrains
the number of active jobs in one Worker.

### Live request/return path

Today the HTTP JSON path is:

1. `step-planned.planner.ts` produces both `EmitJobHttpJsonSubmittedFx` and
   `ExecuteHttpJsonJobFx` from shared job data.
2. `emit-job-httpjson-submitted.effect.ts` emits the submitted event onto
   `EventBusPort` for observability.
3. `execute-httpjson-job.effect.ts` awaits `JobExecutionPort.execute()`.
4. `withMessageJobExecution()` maps the request to `ExecuteJobCommand` and the
   returned `JobResult` to `JobExecutionOutcome`.
5. Engine reconstructs `job.httpjson.completed` or
   `job.httpjson.failed`, advances its own queue from that reconstructed event,
   and publishes the same object onto `EventBusPort` for observability.

The in-process router and mailbox foundation is implemented under
`packages/runtime/src/messaging/in-process/`, but are intentionally inert. No
running profile imports them yet.

### Current lifecycle truth

Worker is not currently a managed runtime resource. It has no meaningful
`start()`, `stop()`, `drain()`, or `health()` implementation. The resources in
`assemble-embedded-system.ts` are the bus, sinks, Observability tap, Engine,
and Limiter.

`WorkerLifecycleEventSink` records job-execution facts. It is not Worker
process or component lifecycle. Do not add no-op component lifecycle methods
or a no-op managed-resource entry merely to make assembly look symmetrical.

## Migration invariants

Stage 1 establishes the first four ownership rules without pretending the
Message cutover has already happened. Stage 2 establishes the remaining
Message-authority rules atomically. Once a rule is established, no later stage
may regress it:

1. Runtime retains the actual Worker. It never substitutes a handler wrapper,
   port adapter, runner, or capacity decorator as the apparent component.
2. JobRunner is internal to Worker construction and is never wired directly by
   runtime.
3. Worker-wide capacity is owned or retained by Worker and cannot be bypassed
   by selecting a different carrier.
4. Worker never receives the router, mailbox, Redis client, subscription,
   acknowledgement token, or topology registry.
5. The complete submitted Message remains available as execution origin until
   terminal construction finishes.
6. Worker is the sole canonical publisher of the terminal job Message.
7. Engine consumes the literal terminal Message and does not reconstruct it
   from a returned value.
8. Each migrated occurrence has one authoritative path.
9. An expected job failure becomes a modeled failed terminal Message. An
   unexpected throw rejects the handler and produces no fabricated terminal.
10. Terminal publication is awaited through admission, never through recipient
    completion.

## Merge boundaries and transition safety

The structural runway and Message cutover are different review units. The
first is deliberately safe to merge without the second.

### Permitted intermediate state

After the structural runway, all of the following may temporarily be true:

- Engine still invokes `JobExecutionPort` directly on the actual Worker;
- submitted and terminal job events still reach Observability through the
  legacy EventBus;
- `ExecuteJobCommand` and `JobResult` remain Worker's internal execution
  vocabulary; and
- the in-process router remains inert.

This state is acceptable only because it preserves current behavior while
establishing the correct component identity and policy ownership.

### Forbidden intermediate states

No mergeable revision or selectable runtime profile may:

- publish `job.httpjson.submitted` through the mailbox and also invoke Worker
  directly for the same occurrence;
- let Engine advance from both `JobExecutionOutcome` and a terminal Message;
- let Worker and Engine both construct a terminal Message for one execution;
- publish any migrated occurrence to both the new publication and legacy
  EventBus for Observability;
- bind a Worker-shaped wrapper while runtime discards the real Worker;
- expose JobRunner as an alternate runtime construction path;
- delete `JobExecutionOptions` before Worker's local `AbortSignal` use is
  rehomed; or
- wire only submitted or only terminal delivery and leave two authorities
  active as a temporary bridge.

Git history is the rollback mechanism. Do not preserve a production
`direct | in-process` switch merely to keep the retired architecture available.

## Stage 0: freeze the baseline

Before structural edits:

- [ ] Run the Worker package's build, typecheck, test, and lint commands.
- [ ] Run focused Engine effect and planner tests for HTTP JSON.
- [ ] Run the local-system profile smoke test.
- [ ] Record the current number and order of calls for Worker capacity telemetry,
      resource permit acquire/release, job lifecycle facts, protocol execution,
      artifact writes, and terminal EventBus publication.
- [ ] Confirm by search that the in-process router is still imported only by its own
      implementation and tests.
- [ ] Confirm no subscriber other than Observability's broad bus tap consumes
      `job.httpjson.submitted`, `.completed`, or `.failed` on the current HTTP
      JSON path.

This is a behavioral baseline, not a request to add broad snapshot tests.

## Stage 1: behavior-preserving structural runway

This stage gives Worker one stable root before changing how components talk.
It must not wire the mailbox or change event authority.

### 1. Separate the component root from one-job mechanics

Refactor `packages/components/worker/src/worker.ts` so that:

- [ ] `Worker` is the exported, stable component root;
- [ ] the current one-job algorithm becomes an internal `JobRunner` collaborator,
      likely under `src/execution/job-runner.ts`;
- [ ] Worker constructs or retains exactly one JobRunner;
- [ ] runtime never receives JobRunner; and
- [ ] moving code does not change the validation, reference resolution,
      protocol, permit, artifact, result, or lifecycle-fact behavior.

The extraction should be mostly mechanical. The current private methods for
preparing a protocol run, resolving refs, invoking with a permit, storing
outputs, and constructing modeled outcomes naturally belong to JobRunner.
Current `finish*` helpers mix result construction with lifecycle recording;
split those concerns rather than moving the lifecycle sequence wholesale.
Worker remains responsible for major accepted/started/terminal sequencing
around the JobRunner call.

Do not export JobRunner through `@lcase/worker` as an alternate component.
Package-internal tests may import its module directly when testing one-job
mechanics.

### 2. Replace the capacity decorator with owned composition

Replace `withWorkerCapacity()` with a `WorkerCapacity` collaborator retained by
Worker, or a semaphore directly retained by Worker if no separate collaborator
is yet useful.

Preserve the current behavior exactly:

- [ ] a signal already aborted at entry returns the modeled cancelled result
      without capacity telemetry or job-started lifecycle output;
- [ ] a non-aborted request reports wait start before acquiring capacity;
- [ ] cancellation while queued reports capacity cancellation and never invokes
      JobRunner;
- [ ] a grant is reported before JobRunner starts;
- [ ] capacity is released in `finally` after completion, modeled failure,
      cancellation during execution, or an unexpected throw; and
- [ ] release telemetry follows the actual release.

The current wrapper performs a pre-admission abort check, then the admitted
core validates the command and checks the signal again. Preserve the observable
ordering while consolidating ownership.

Once equivalent tests pass:

- [ ] delete `withWorkerCapacity()`;
- [ ] delete or repurpose `worker-capacity.ts` so it contains only a truthfully
      named collaborator or telemetry contract, not a Worker-shaped decorator;
      and
- [ ] update `job-result.factories.ts`, whose comment currently says the
      cancellation factory was extracted for an outer wrapper.

### 3. Rehome process-local execution control

`JobExecutionOptions` currently lives in
`packages/ports/src/job-execution/job-execution.port.ts`, but Worker and its
capacity code use the contained `AbortSignal` internally.

- [ ] Define a Worker-internal execution-control type in the execution contracts,
      using the name chosen by the architecture reference.
- [ ] Update Worker, WorkerCapacity, JobRunner, and internal command contracts to
      use it.
- [ ] Leave the structurally compatible direct-port option type in place only
      while the temporary direct boundary remains.
- [ ] Do not put `AbortSignal` in Message data or the retained submitted envelope.

Cross-process cancellation requires a later Message or durable-state protocol.

### 4. Keep the direct protocol temporarily on Worker

For the behavior-preserving runway, let the actual Worker temporarily satisfy
`JobExecutionPort` itself. Its `execute(request, options)` method may perform
the existing pure request-to-command and result-to-outcome projections around
capacity and JobRunner. Engine can therefore keep its current dependency while
runtime retains Worker rather than a replacement object.

- [ ] `createWorker()` returns the actual Worker.
- [ ] Runtime's Worker builder returns and retains that same object.
- [ ] Engine receives the object structurally as its temporary
      `JobExecutionPort` dependency.
- [ ] Delete `withMessageJobExecution()` as an identity-replacing wrapper.
- [ ] Delete `createCommandWorker()` as a public alternate Worker construction
      path; command-level tests exercise JobRunner or focused collaborators.
- [ ] Keep the direct translations pure, Worker-owned, and explicitly marked
      for Stage 2 deletion.
- [ ] Do not add new callers to `Worker.execute()`.

This temporary method is not the target component protocol. It exists only to
make the ownership refactor independently mergeable. Do not introduce the
submitted-Message handler until the atomic Stage 2 cutover, and do not preserve
both methods afterward.

### Stage 1 tests

Adapt existing tests rather than weakening them:

- [ ] preserve every scenario in `tests/worker.test.ts` at the command/runner
      level;
- [ ] replace `tests/worker-capacity.test.ts` coverage so it exercises capacity
      owned by the named Worker, including blocking, queued cancellation, and
      release after throw;
- [ ] move the useful request/command and result/outcome assertions from
      `tests/message-job-execution.test.ts` onto the temporary Worker direct
      method, then delete the wrapper-specific test;
- [ ] keep the architecture test free of EventBus, Queue, EmitterFactory, Redis,
      mailbox, and runtime imports; and
- [ ] run the local-system smoke test to prove composition is behaviorally
      unchanged.

Run package-level checks followed by full-workspace build, typecheck, test, and
lint.

### Stage 1 exit criteria

Stage 1 is complete only when:

- runtime constructs and retains one concrete Worker object;
- Worker owns its component-wide capacity state;
- JobRunner is internal and cannot be selected by runtime;
- no stateful object implementing the same interface wraps Worker;
- all current HTTP JSON behavior is unchanged;
- Worker temporarily exposes the direct request/return method itself, with no
  identity-replacing outer layer; and
- the mailbox remains inert.

## Stage 2: atomic HTTP JSON Message cutover

This stage moves these three types together:

```text
job.httpjson.submitted
job.httpjson.completed
job.httpjson.failed
```

It may be implemented in several local commits, but it is one runtime authority
change and must merge as a whole, including the Stage 2B deletion pass.

### 1. Declare the topology

Add carrier-neutral topology values under runtime, for example
`packages/runtime/src/messaging/http-job.topology.ts`.

- [ ] Define the authoritative command and terminal type unions.
- [ ] Use `definePublicationFor<All>()()` so each runtime list is proven complete
      against its independently named union.
- [ ] Declare publication `http-job-command.v1` for
      `job.httpjson.submitted`.
- [ ] Declare publication `http-job-terminal.v1` for
      `job.httpjson.completed | job.httpjson.failed`.
- [ ] Declare subscription `worker.http-job-command.v1`.
- [ ] Declare subscription `observability.http-job-command.v1`.
- [ ] Declare subscription `engine.http-job-terminal.v1`.
- [ ] Declare subscription `observability.http-job-terminal.v1`.
- [ ] Add no wildcard subscription and no Limiter subscription.

These declarations express stable delivery purposes. They must not mention
mailbox queue objects, Redis stream keys, consumer names, or acknowledgements.

### 2. Add Worker's real Message boundary

Add the submitted handler directly to Worker. The exact name may follow the
sibling architecture reference; `handleHttpJsonSubmitted` is used here for
clarity.

- [ ] Type it as a `MessageHandler<"job.httpjson.submitted">` or an equivalent
      method whose parameter is the full `MessageOf` envelope.
- [ ] Make callback binding safe, for example with an arrow property, so runtime
      does not need an identity-replacing wrapper.
- [ ] Inject only the bound terminal publisher and explicit Worker source needed
      for outbound Messages.
- [ ] Do not inject the router, mailbox, topology declarations, Redis client,
      Engine callback, or unrestricted `MessagePublisher<EventType>`.
- [ ] Retain the complete submitted Message at the Worker root until terminal
      construction finishes. Pass JobRunner only the projected execution data
      it genuinely needs.
- [ ] Pass no caller signal in the first Message-only slice. Keep internal
      execution control optional until Worker owns a real cancellation or
      shutdown source.

A runtime closure such as `(message) => worker.handleHttpJsonSubmitted(message)`
is acceptable wiring when it only binds a method or reports host-level errors.
It is not a second Worker and must not own policy, state, or translation.

The CloudEvent `source` is sufficient Worker identity for this first slice.
Expose it on Worker if useful; do not add a second Worker-ID field or config
until a control, health, or multi-instance use case distinguishes the two.

### 3. Remove spelling-only request translation

At baseline, `job-message.mappers.ts` turns the direct-call
`JobExecutionRequest` into `ExecuteJobCommand`, including temporary mappings
such as `jobid -> jobId`, `traceId`, and `executionId = jobid`. Stage 1 may have
moved equivalent temporary projections onto Worker when it deleted the outer
translator; the semantic cleanup is the same either way.

- [ ] Replace it with submitted-Message interpretation that retains the origin.
- [ ] Do not create another flattened inter-component request envelope.
- [ ] Keep only internal projections that change meaning, such as submitted HTTP
      data becoming a fixed protocol request.
- [ ] Give the resource-permit request the submitted Message ID as its initial
      request identity. Do not copy run, step, trace, and source fields into
      JobRunner for that purpose.
- [ ] If `ExecuteJobCommand` and `JobResult` remain for this slice, label them
      internal migration seams.
- [ ] Do not perpetuate `executionId = jobid` as a durable attempt-identity
      decision.

The CloudEvent field is `traceid`; the temporary direct request uses `traceId`.
Do not mechanically reuse the current mapper without accounting for that
difference. Using the submitted Message ID for the first local permit request is
not a durable execution-attempt model; redelivery-aware attempt identity remains
later work.

### 4. Centralize Worker Message construction

Create one Worker-owned outbound construction path, initially as small as the
terminal use case requires.

- [ ] Move completed/failed data projection out of
      `engine/src/effects/execute-httpjson-job.effect.ts` and into Worker-owned
      code.
- [ ] Construct the terminal with `buildEvent()` so schema validation remains
      mandatory.
- [ ] Select job scope fields explicitly from the submitted Message; do not
      spread the complete inbound envelope into builder options.
- [ ] Give the terminal a new Message ID and time.
- [ ] Set outbound `source` to the explicit Worker source supplied by runtime.
- [ ] Preserve the submission as causal origin and preserve the intended trace
      ID.
- [ ] Map one modeled completion to exactly one
      `job.httpjson.completed` Message.
- [ ] Map one modeled failure to exactly one `job.httpjson.failed` Message.
- [ ] Await terminal publisher admission before the Worker handler resolves.
- [ ] If JobRunner unexpectedly throws, reject the handler and publish no
      terminal business Message.

The current `JobFailedData` schema cannot carry `JobExecutionError.code` or
`retryable`. Preserve existing first-slice behavior unless this Change
explicitly approves a schema expansion: publish status, output, and the error
message, keep code/retryability internal, and test that intentional fidelity
limit. In particular, do not claim that the typed terminal distinguishes
cancellation from every other failure yet.

Using `buildEvent()` requires adding `@lcase/events` as a runtime dependency of
`@lcase/worker`. Do not replace that with an injected EmitterFactory or
EventBus.

### Trace limitation checkpoint

The current `buildEvent({ fromEvent })` implementation carries the inbound
`traceid` into a new event, but job events have no registered deterministic
span policy. It creates a new random span and does not establish the inbound
`spanid` as `parentspanid` merely because `fromEvent` was supplied. It also does
not copy every optional trace field automatically.

For the first cutover:

- [ ] choose and test the exact fields that are propagated;
- [ ] preserve at least trace-ID continuity;
- [ ] explicitly pass `tracestate` if the selected initial policy requires it;
- [ ] create a new terminal Message identity, time, and Worker source; and
- [ ] document that full causal parent-span linkage is not yet guaranteed unless
      the event builder is deliberately extended in this stage.

Do not claim local and Redis trace causality is complete when only trace-ID
continuity is proven.

### 5. Move Engine to publish and consume

Update Engine without refactoring its entire reducer/planner/effect system.

- [ ] Replace `EngineDeps.jobExecution` in
      `packages/ports/src/engine/engine.port.ts` with a narrow publisher for
      submitted HTTP JSON Messages.
- [ ] Remove the `JobExecutionPort` and request/outcome imports from Engine.
- [ ] Replace the paired `EmitJobHttpJsonSubmittedFx` and
      `ExecuteHttpJsonJobFx` in `step-planned.planner.ts` with one publication
      effect built from the same existing job scope and data.
- [ ] Replace the EventBus implementation of
      `emit-job-httpjson-submitted.effect.ts`, or rename it, so it builds the
      canonical Message once and awaits the command publication's admission.
- [ ] Add a narrow Engine terminal handler for completed and failed Messages.
- [ ] Have that handler feed the literal Message into the existing
      `handleJobFinished`/`JobFinishedMsg` path.
- [ ] Keep Engine progression synchronous inside that handler so its resolved
      Promise truthfully means Engine state has advanced for that delivery.
- [ ] Delete terminal reconstruction from Engine.

`Engine.executeEffect()` currently starts handler Promises without observing
them. The new authoritative publication must not become an unhandled rejection.
Catch and report construction or admission failure in the new effect, or attach
one narrow guarded rejection path centrally. For this MVP, reporting the error
and leaving the run stalled is more truthful than inventing success, failure,
or retry behavior.

The current `jobFinishedReducer` reads `run.steps[stepId]` before checking that
`run` exists. Guard an unknown or stale terminal at the Engine boundary, or fix
the guard ordering, so a bad delivery yields an intentional report rather than
an incidental `TypeError`. This is not a substitute for later duplicate and
active-job validation.

Keep all non-HTTP-JSON EventBus behavior unchanged, including MCP, replay,
Engine's run/step self-loop, component lifecycle, and Limiter messages.

### 6. Give Observability bus-independent ingestion

Refactor `packages/components/observability/src/core/tap.ts` minimally:

- [ ] extract the sink loop from the current `start()` subscription callback into
      a public async Message-ingestion method;
- [ ] have the legacy EventBus callback call that method for unmigrated types;
- [ ] bind the two HTTP job subscriptions directly to the same method;
- [ ] preserve best-effort per-sink failure reporting and continuation; and
- [ ] do not add an Engine-Observability or Worker-Observability integration
      object.

The two Observability subscriptions own independent mailboxes. They may overlap
and do not establish a global command-before-terminal processing order. Tests
must assert both canonical Messages are observed, not a total order across the
two subscriptions.

### 7. Assemble and retain the graph in runtime

Update `packages/runtime/src/profiles/local-system/local-system.profile.ts` in
this order:

1. create the in-process router with the two publication declarations;
2. resolve the command and terminal publishers;
3. construct the actual Worker with the terminal publisher and explicit source;
4. construct Engine with the command publisher;
5. construct Observability;
6. bind the four logical subscriptions to methods on those retained instances;
7. seal the router; and
8. construct services and managed runtime after the graph is complete.

If Stage 1 did not already rename
`packages/runtime/src/worker/create-worker.ts`'s `createWorkerCore()`, rename it
to a name such as `buildWorker()` now. Its job is composition: build local
permit, lifecycle-reporting, protocol, artifact, capacity, and Message
collaborators, then return Worker.

- [ ] Runtime retains the returned Worker in a named local variable.
- [ ] The bound handler is a method on that same object.
- [ ] The Worker subscription uses
      `maxInFlight: config.worker.maxConcurrentJobs`.
- [ ] Engine and each Observability subscription use `maxInFlight: 1` for the
      first slice.
- [ ] Worker still owns its internal capacity invariant even when the one local
      mailbox normally presents no more than the same number of jobs.
- [ ] No component receives registration or routing APIs.

Do not add Worker or the router to `assembleEmbeddedSystem()` through no-op
lifecycle hooks. The existing no-drain shutdown limitation remains explicit.

Update messaging configuration from the dishonest `{ kind: "direct" }` to the
selected in-process vocabulary in:

- `packages/runtime/src/config/messaging.config.ts`;
- `apps/cli/src/runtime.config.ts`;
- `apps/http-server/src/runtime.config.ts`; and
- the local-system profile tests.

Do not retain a direct branch in the local profile.

## Stage 2 tests

### Worker boundary tests

- [ ] A canonical submitted Message reaches the actual Worker instance.
- [ ] Worker retains the complete Message as execution origin.
- [ ] Submitted data is interpreted into the same protocol, ref, and export
      behavior as before.
- [ ] A modeled completion publishes exactly one correctly scoped
      `job.httpjson.completed` Message.
- [ ] A modeled failure publishes exactly one correctly scoped
      `job.httpjson.failed` Message.
- [ ] The terminal has a new ID/time, Worker source, expected trace continuity,
      and no leaked submitted-only fields.
- [ ] The handler remains pending until terminal publication admission resolves.
- [ ] An unexpected JobRunner throw rejects the handler and publishes nothing.
- [ ] Terminal admission failure rejects the handler.
- [ ] Worker capacity still bounds concurrent work entering through Message
      delivery and releases on every exit path.

### Engine tests

- [ ] The HTTP JSON planner produces one publication effect and no direct
      execution effect.
- [ ] The publication effect sends one canonical submitted Message through the
      bound publisher and never through EventBus.
- [ ] Completed and failed terminal handlers advance the existing Engine path
      from the literal delivered Message.
- [ ] Engine does not reconstruct or republish the terminal.
- [ ] Unknown run/step input is handled intentionally.
- [ ] Publication failure is observed and does not create an unhandled Promise
      rejection.
- [ ] Existing MCP EventBus behavior remains unchanged.

### Observability tests

- [ ] Direct Message ingestion invokes every configured sink.
- [ ] One failing sink is reported and does not prevent later sinks.
- [ ] Legacy EventBus ingestion delegates to the same sink loop.
- [ ] Migrated HTTP JSON Messages are observed through mailbox subscriptions
      exactly once.

### Runtime vertical-slice tests

Add a focused runtime test using the real router and retained component roots,
with deterministic protocol/artifact collaborators where needed.

- [ ] Publish one submitted Message.
- [ ] Prove publication resolves on admission rather than Worker completion.
- [ ] Prove Worker executes exactly once.
- [ ] Prove Worker publishes exactly one terminal.
- [ ] Prove Engine advances exactly once from that terminal.
- [ ] Prove Observability receives independent submitted and terminal copies.
- [ ] Prove no migrated occurrence is published to EventBus.
- [ ] Prove one fanout recipient cannot mutate another recipient's snapshot.
- [ ] Await `router.whenIdle()` before asserting final Engine state.
- [ ] Cover modeled completion and modeled failure.

`whenIdle()` is valid for this focused path because Worker awaits terminal
admission and Engine's terminal handler advances synchronously. It is not a
general drain and cannot observe detached work or legacy EventBus callbacks.

Do not assert a total order between Observability's command and terminal
mailboxes.

### Verification commands

Run focused checks for all touched packages, then the complete workspace:

```text
packages/ports
packages/events
packages/components/worker
packages/components/engine
packages/components/observability
packages/runtime
```

Run build, typecheck, test, and lint. Engine currently does not typecheck its
test files through its package `typecheck` script. Either fix that test-config
gap in the approved scope or run an explicit test typecheck and record it; a
Vitest transpile alone is not proof that the new generic handler/publisher
contracts typecheck.

## Stage 2B: immediate deletion and consistency pass

This cleanup is part of Stage 2's atomic cutover, not a later merge or optional
follow-up.

### Delete the direct component protocol

Remove:

- `packages/ports/src/job-execution/job-execution.port.ts` and its exports;
- `JobExecutionPort`, `JobExecutionRequest`, `JobExecutionOutcome`, and the
  temporary port-owned `JobExecutionOptions`;
- Worker's temporary direct `execute(request, options)` method;
- `toJobExecutionOutcome()` and mappings that only support the direct result;
- `packages/components/engine/src/effects/execute-httpjson-job.effect.ts` and
  its focused test;
- `ExecuteHttpJsonJobFx`, its effect-registry entry, and
  `EffectHandlerDeps.jobExecution`;
- `EngineDeps.jobExecution`;
- `buildEngine(...jobExecution)` and the profile's `jobExecution` variable;
- the old EventBus-submitted effect implementation if it was replaced under a
  new filename; and
- comments that describe Worker V2 Phase 4 direct execution as the current
  design.

Retain:

- the internal one-job algorithm and modeled outcomes still needed by
  JobRunner;
- Worker-owned capacity and per-resource permits;
- protocol and artifact behavior;
- worker diagnostic lifecycle output until explicitly reconciled;
- EventBus for every unmigrated type;
- the existing in-process router/mailbox;
- `MessageLogPort` and `RedisMessageLog` as inert lower-level future driver
  work; and
- MCP's existing path without implying it is completed by this migration.

### Deletion probes

Run these searches from the repository root:

```bash
rg 'JobExecutionPort|JobExecutionRequest|JobExecutionOutcome|JobExecutionOptions' packages apps
rg 'withMessageJobExecution|ExecuteHttpJsonJob|jobExecution' packages apps
rg 'withWorkerCapacity|createWorkerCore' packages apps
rg 'messaging:\s*\{\s*kind:\s*["\x27]direct["\x27]' packages apps
```

Every remaining match must be either intentionally retained internal
vocabulary with a new truthful name or point-in-time documentation. There must
be no live source match for the retired direct component protocol.

Then inventory each migrated type:

```bash
rg 'job\.httpjson\.(submitted|completed|failed)' packages apps
```

Classify every live producer and consumer. The result must show:

- one submitted Message constructor/publisher owned by Engine;
- one Worker submitted handler binding;
- one terminal Message constructor/publisher owned by Worker;
- one Engine terminal handler binding;
- one Observability subscription for commands;
- one Observability subscription for terminals; and
- no legacy EventBus publication for those occurrences.

Schema registries, type maps, tests, and point-in-time documentation may of
course name the types without being authorities.

### Delivery and idempotency caveat

The first local mailbox performs one in-memory delivery attempt and reports and
drops a failed handler invocation. It has no durability or redelivery. A future
Redis host will likely leave a failed delivery unsettled and may redeliver it.

That distinction does not make external side effects exactly once:

1. JobRunner may complete an HTTP side effect.
2. Artifact storage may complete.
3. Terminal publication admission may then fail.
4. Worker's handler truthfully rejects.
5. A durable carrier may redeliver the submitted Message and repeat the side
   effect.

Do not describe handler rejection, stream acknowledgement, or a stable job ID
as an idempotency guarantee. Safe remote recovery requires a later combination
of operation-specific idempotency, durable attempt state, reconciliation, or
an outbox.

Engine is also not duplicate-safe today. Replaying the same terminal may
advance a run twice, and `jobFinishedReducer` is not an active-job identity
check. The local MVP topology does not deliberately redeliver, but the Message
boundary must not be documented as ready for at-least-once Redis delivery until
this is addressed.

### Diagnostic lifecycle checkpoint

The current `WorkerLifecycleEventSink` emits separate
`job-execution-started|completed|failed|cancelled` diagnostic DTOs to a console
placeholder. Once Worker publishes the canonical terminal Message, those DTOs
must not be described as a second canonical completion/failure fact.

They may remain after this slice only as explicitly subordinate, console-local
diagnostics so the cutover stays reviewable. They are not published Messages
and must not be described as another terminal protocol. Before adding a durable
sink, decide whether to:

- replace them with canonical Worker observation Messages;
- retain only genuinely distinct internal telemetry; or
- remove the duplicate terminal-shaped diagnostics.

Do not make that taxonomy decision a prerequisite for the first terminal
Message unless implementation exposes an actual conflict. Making these DTOs
durable or externally consumable does require resolving it first.

## Documentation and ADR checkpoints

### Before implementation

- [ ] Treat [`README.md`](./README.md) and this file as proposed guidance, not
      accepted architecture.
- [ ] Re-read ADR-0005 and ADR-0006; preserve fixed first-party protocols and
      package dependency boundaries.
- [ ] Use the active Initiative/Arc process to approve actual scope and assign
      any Change numbers. This guide assigns none.

### After the structural runway

- [ ] Update this guide or the sibling architecture reference if implementation
      discovers a different honest ownership boundary.
- [ ] Record actual file names and deviations in the owning Arc's “What actually
      landed” section.
- [ ] Do not retroactively rewrite the historical `worker-v2` guide as though it
      predicted the new design.

### After the Message cutover is proven

- [ ] Update the broader component architecture draft where its Worker-specific
      direct-call examples are now superseded.
- [ ] Remove stale source comments about direct execution, compatibility
      terminal events, and Worker V2 migration phases.
- [ ] Update in-process messaging docs if concrete handler names, topology IDs,
      or failure policy differ from their proposed form.
- [ ] Write a narrow ADR, or amend/supersede the relevant accepted decision,
      before claiming that “autonomous components communicate through Messages”
      is accepted repository architecture.
- [ ] Keep the ADR about stable ownership and protocol rules, not a transcript of
      file moves.

## Deferred work after the cutover

Choose later work from observed needs rather than prebuilding it:

- carrier instrumentation and queue-depth/handler-duration visibility;
- strict lossless JSON encoding before a real wire boundary;
- intake stop and causal drain with truthful CLI shutdown behavior;
- bounded capacity and a non-deadlocking overflow policy;
- Redis writer/read-loop/group-session composition;
- pending-entry recovery and acknowledgement policy;
- idempotency, duplicate terminal handling, active-job validation,
  reconciliation, and outbox design;
- durable execution-attempt identity;
- explicit cancellation Messages or durable cancellation state;
- full trace parent-span and `tracestate` propagation policy;
- Worker observation Messages such as accepted/started/capacity transitions;
- Worker readiness, health, and real lifecycle methods;
- shared capacity groups across several Worker subscriptions;
- multiple competing Workers and distributed resource admission;
- MCP delivery migration;
- Limiter integration;
- Engine's broader fire-and-forget effect-runner cleanup;
- Engine's legacy run/step EventBus self-loop;
- EventBus retirement; and
- event/command/reply/telemetry taxonomy changes.

The local resource-permit adapter's per-key semaphore map also has no eviction.
That boundedness concern remains separate from this component migration.

## Final completion criteria

The migration is complete when all of the following are true:

- [ ] runtime constructs and retains one actual Worker instance;
- [ ] runtime binds a method on that instance as the HTTP JSON submitted handler;
- [ ] Worker receives and retains the complete canonical submitted Message;
- [ ] no redundant inter-component request envelope remains;
- [ ] Worker owns or retains Worker-wide capacity;
- [ ] JobRunner is focused internal implementation and is never runtime-wired;
- [ ] Worker owns the only terminal Message construction and publication path;
- [ ] terminal publication is awaited through admission;
- [ ] Engine publishes submitted once and advances only from the literal terminal
      Message;
- [ ] Observability independently receives one copy of submitted and terminal;
- [ ] no migrated occurrence also travels through EventBus;
- [ ] expected failures publish one modeled failed terminal;
- [ ] the failed Message's initial code/retryability fidelity limit is explicit
      and tested;
- [ ] unexpected throws and terminal-admission failures reject the handler
      without fabricating a terminal;
- [ ] the direct request/return port and all identity-replacing wrappers are
      deleted;
- [ ] local Worker throughput remains bounded by the configured capacity;
- [ ] the initial trace guarantee and its limitation are documented accurately;
- [ ] delivery and idempotency limitations are documented accurately;
- [ ] any retained `WorkerLifecycleEventSink` output is explicitly local and
      subordinate, with no second durable terminal authority;
- [ ] local and future remote composition differ outside Worker; and
- [ ] package and full-workspace verification pass.

At that point, the architecture is ready to grow without relocating the Worker
root or changing its component-facing Message boundary.
