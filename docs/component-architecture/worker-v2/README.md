# Worker V2 Architecture And Migration Guide

Status: superseded implementation guide.

> This guide is preserved as the point-in-time plan behind the merged Worker V2
> rebuild in Initiative I4. For the current Worker direction, see
> [Worker Component Architecture](../worker/README.md) and its
> [migration guide](../worker/MIGRATION.md). In particular, the direct
> request/return boundary and wrapper-based public Worker shape below must not
> direct new work.

This document describes how to build a new worker alongside the current backend and
move toward port-driven component interaction without requiring a one-shot rewrite of
the engine, router, queue, limiter, event system, and runtime.

It is intended to be durable implementation context for humans and coding agents. It
is not yet an ADR. The design should be proven through one real worker execution path
before the relevant parts are promoted into an accepted architecture decision.

## Read This With

- [Component Architecture Draft](../model.md)
- [ADR-0005: Package-tier taxonomy](../../adr/0005-package-tier-taxonomy.md)
- [ADR-0006: Worker/tool extensibility model](../../adr/0006-worker-tool-extensibility-model.md)
- [Worker investigation](../../initiatives/worker-tools-artifacts/arcs/worker-investigation.md)
- [Limiter port/adapters sketch](../../../packages/components/limiter/src/limiter.next.temp.ts)
  (local design sketch, intentionally ignored by Git)

The limiter sketch was useful for pressure-testing the component interaction model.
It is not a requirement to rebuild or distribute the limiter before starting Worker
V2.

## Executive Decision

Do not refactor the current `worker.ts` into the target shape. Build a new callable
Worker V2 beside it and use compatibility adapters to connect it to the current
event-bus and queue topology.

The new worker core:

- exposes an inbound job-execution port
- depends on outbound capability ports
- emits worker-owned lifecycle facts through a lifecycle event sink
- returns job results directly through its inbound call contract
- does not subscribe to or publish on an event bus
- does not reserve work from a queue
- does not know limiter topics or transport envelopes
- does not use `AnyEvent` as its internal job model
- uses a fixed, first-party set of protocol executors rather than a registry

Local and remote deployments use the same worker core. Hosts and adapters choose how
a job reaches the inbound port and how its result returns to the caller.

## Why This Is Additive

The current worker contains behavior from several generations of architecture:

- capability and tool registration
- per-tool queue reservation
- worker-local concurrency and rate limiting
- bus-mediated global concurrency
- job event parsing
- protocol selection and invocation
- reference resolution
- artifact and export storage
- lifecycle event creation
- engine-facing completion signaling
- component startup, registration, and replay-mode subscriptions

That file is valuable as an inventory of behavior and compatibility requirements. It
should not be treated as the specification for the new worker. Refactoring it in
place would make it difficult to tell whether a piece exists because Worker V2 needs
it or because the old topology once needed it.

The additive approach keeps the current system usable while a narrow path proves the
new boundary.

## What Remains Settled

This direction does not discard the useful parts of the recent architecture review.

From ADR-0005, retain:

- the package-tier taxonomy
- pure shared vocabulary in `types`
- interfaces in `ports` where cross-package consumers need them
- functional core packages with no ports or I/O
- runtime as the composition root
- infrastructure implementations outside component core

The following ADR-0005 statement needs a later, narrow superseding decision:

> Components are defined as long-lived pieces that drive themselves by subscribing
> to the event bus.

The proposed replacement is:

> A component owns a coherent behavior and state boundary, exposes inbound ports,
> depends on outbound ports, and forms lifecycle facts for state it owns. A host or
> adapter decides whether component input arrives by direct call, inbox, queue, HTTP,
> IPC, or bus.

From ADR-0006, retain:

- there is no third-party tool registry
- the worker supports a fixed, first-party set of protocols
- HTTP JSON and MCP are protocol bindings, not plugin registrations
- timeout, retry, and backoff are the system's own posture toward external services
- protocol responses must be interpretable as structured success or failure

The following ADR-0006 detail needs a later, narrow superseding decision:

> The worker core owns the event bus and queue coupling.

Under Worker V2, bus and queue mechanics belong to hosts and adapters. The worker
still owns job orchestration and protocol behavior.

## Target Boundary

```text
                         inbound
Engine/adapter  ->  JobExecution.execute()
                              |
                              v
                         Worker V2
                  /           |            \
                 v            v             v
       ResourceAdmission  Artifact I/O  LifecycleEventSink
                 |
                 v
       fixed protocol executors
       (HTTP JSON, MCP, later others)
```

The worker is callable. It is not self-started by finding work on a bus or queue.

An adapter may still be self-running. For example, a remote worker host may run a
queue-consumer loop that calls `JobExecution.execute()` for each reserved message.
That loop is not worker core behavior.

## Worker Responsibilities

Worker V2 owns:

- validating an execution command
- correlating execution with run, step, and job identity
- resolving input references needed at execution time
- selecting one of the fixed supported protocols
- applying worker execution limits
- requesting resource admission immediately before constrained work
- enforcing timeout and eventual retry/backoff policy
- invoking the external protocol
- interpreting protocol success or failure
- storing response and export artifacts
- producing a structured `JobResult`
- forming worker-owned job lifecycle facts
- releasing resource admission in a `finally` path

Worker V2 does not own:

- engine run or step planning
- queue routing or queue polling
- event-bus topic subscriptions
- conversion from old job events into commands
- conversion from results into compatibility events
- process startup, restart, or sidecar supervision
- distributed worker discovery
- third-party protocol registration
- global permit leases before a distributed coordinator exists

## Initial Inbound Contract

The exact production types should be developed with the first vertical slice. The
semantic shape should remain close to this:

```ts
export interface JobExecution {
  execute(
    command: ExecuteJobCommand,
    options?: JobExecutionOptions,
  ): Promise<JobResult>;
}

export type JobExecutionOptions = {
  signal?: AbortSignal;
};

export type ExecuteJobCommand = {
  executionId: string;
  jobId: string;
  runId: string;
  stepId: string;
  traceId?: string;
  protocol: ProtocolRequest;
  refs: Ref[];
  exports?: Record<string, ExportRef>;
};

export type JobResult =
  | {
      status: "completed";
      executionId: string;
      jobId: string;
      output: ArtifactRef;
      exports?: Record<string, ArtifactRef>;
    }
  | {
      status: "failed";
      executionId: string;
      jobId: string;
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
      output?: ArtifactRef;
    };
```

These are illustrative types, not a requirement to duplicate existing repository
types. Reuse current shared types and ports when their semantics fit cleanly.

### Result Semantics

Expected execution failures should normally return the failed `JobResult` variant:

- external service returned a failure response
- timeout
- response could not be interpreted
- export validation failed
- requested protocol is unsupported
- execution was cancelled

Programming errors and violated internal invariants may still throw. Adapters must
not infer an expected job failure solely from whether a promise rejected.

The result is the caller's control-flow answer. A lifecycle event is an independently
recorded fact and is not the mechanism by which the engine learns the result.

## Engine-Side Outbound Port

When the engine is migrated, it should own an outbound port in engine language:

```ts
export interface WorkerDispatch {
  executeJob(command: DispatchJob): Promise<DispatchJobResult>;
}
```

A local integration adapter implements `WorkerDispatch` by calling the worker's
`JobExecution` inbound port. A remote adapter implements it with a command and a
correlated result.

The engine should not import worker core. It may enqueue an internal engine command
when the returned promise settles so deterministic state progression remains inside
the engine's own command loop.

## Protocol Executors

ADR-0006's fixed-protocol decision does not require protocol code to consume event
envelopes or emit worker lifecycle events.

Worker V2 should select an explicit, fixed executor:

```ts
type WorkerProtocolDeps = {
  httpJson: HttpJsonExecutor;
  mcp: McpExecutor;
};
```

An exhaustive switch or a static, closed table is acceptable. Do not introduce
runtime `addTool`, `removeTool`, discovery, plugin loading, or capability
registration.

A protocol executor should accept protocol-shaped input and return a
protocol-shaped result. It should not accept `AnyEvent`, create job lifecycle events,
or decide engine progression.

Protocol telemetry such as request duration, status code, or parse failure may be
reported through an observer. Worker V2 remains the owner of job execution lifecycle
facts.

## Resource Admission

Worker V2 should depend on a small resource-admission capability without requiring a
standalone limiter:

```ts
export interface ResourceAdmission {
  acquire(
    request: AdmissionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<AdmissionGrant>;

  release(grantId: string): Promise<void>;
}

export type AdmissionRequest = {
  requestId: string;
  resourceKey: string;
  concurrencyCost?: number;
  rateCost?: number;
};

export type AdmissionGrant = {
  grantId: string;
  resourceKey: string;
};
```

For the first implementation:

- use a local adapter
- let `acquire()` wait until local capacity is available
- support cancellation with `AbortSignal`
- return a grant identifier and release by that identifier
- keep permit activity out of durable run history
- report waiting, grant, release, and failure as optional telemetry

Do not expose `queued` and `denied` as states the worker must orchestrate. The
adapter hides its waiting mechanism behind the `acquire()` promise.

### Two Different Limits

Keep these concepts separate even when one local object initially implements both:

1. Worker capacity limits how many jobs one worker executes simultaneously.
2. Resource capacity limits concurrent or rate-limited access to an endpoint, model,
   account, GPU, or other shared resource.

Worker capacity is local worker behavior. Shared resource capacity may eventually
move behind a remote `ResourceAdmission` adapter and centralized coordinator.

Do not build distributed permit routing, leases, expiration, or a standalone limiter
as part of the first Worker V2 slice. Those become necessary before multiple remote
workers coordinate access to the same resource, not before.

## Lifecycle Event Sink

Worker V2 forms lifecycle facts for job execution state it owns:

```ts
export interface WorkerLifecycleEventSink {
  record(event: WorkerLifecycleEvent): Promise<void>;
}
```

Candidate facts include:

- job execution started
- job execution completed
- job execution failed
- job execution cancelled
- worker entered or left a meaningful accepting/draining state, if such state exists

Permit requests and grants are not durable lifecycle facts under current
requirements. They are debug telemetry.

Protocol calls do not own job lifecycle. A protocol executor returns a result; Worker
V2 decides which job lifecycle transition occurred and forms the corresponding fact.

### Reliability Boundary

The first local implementation does not promise crash-safe exactly-once execution.
It must still avoid casually retrying an entire job after an uncertain external side
effect.

Before remote, at-least-once delivery is introduced:

- `executionId` must be treated as an idempotency key where practical
- duplicate commands must not create multiple active executions silently
- duplicate results must not advance the engine twice
- release by `grantId` must be idempotent
- lifecycle event recording and state-transition failure behavior must be specified

If lifecycle facts become required to recover worker-owned state, state mutation and
durable event append will need an outbox or equivalent atomic boundary. That is not a
requirement for the first local vertical slice, but adapters must not claim stronger
guarantees than exist.

## Queue Decomposition

The word "queue" currently covers three different responsibilities.

### Delivery Queue

Moves jobs between independently running producers and workers.

```text
Remote queue consumer adapter
  -> reserves message
  -> translates message into ExecuteJobCommand
  -> calls JobExecution.execute()
  -> translates JobResult into remote result delivery
```

This belongs to an inbound adapter or worker host. It is not a worker core outbound
dependency.

### Worker Execution Gate

Bounds simultaneous work inside one worker. It can be a semaphore or small internal
scheduler. Pending promises are sufficient for an in-process first implementation;
they do not require `QueuePort`.

### Resource Admission Waitlist

Waits for access to a constrained LLM, endpoint, account, or other resource. This is
hidden by `ResourceAdmission.acquire()`.

Separating these concepts allows the current queue to disappear from monolith mode
without preventing a future distributed worker queue.

### Future Fanout Warning

Multiple workers that reserve jobs before receiving shared resource admission may
hoard queue reservations while waiting. When worker fanout becomes real, job
reservation leases, resource admission, cancellation, and redelivery should be
designed together.

Do not preserve today's queue topology merely to solve this theoretical future case.

## Target Execution Flow

```text
ExecuteJobCommand
  -> validate command
  -> wait for worker execution capacity
  -> record worker-owned job-started fact
  -> resolve references
  -> acquire resource admission
  -> invoke fixed protocol executor with timeout/cancellation
  -> release resource admission in finally
  -> store response artifact
  -> validate and store exports
  -> form completed or failed JobResult
  -> record matching worker-owned lifecycle fact
  -> return JobResult
```

The exact placement of admission should minimize how long a constrained resource is
held. For example, reference resolution normally happens before admission, and
artifact storage normally happens after releasing a concurrency permit for the
external call.

## Current Event Migration Ledger

Classification is based on semantic role, not naming tense or current topic shape.

| Current topic or family          | Current use                                  | Target category                               | Target owner and handling                                                                       |
| -------------------------------- | -------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `job.<capability>.submitted`     | Engine asks for work                         | Command                                       | Engine calls `WorkerDispatch`; a compatibility adapter may still publish the old topic          |
| `job.<capability>.queued`        | Router/queue delivery                        | Compatibility or transport telemetry          | Queue adapter only; remove from local core flow                                                 |
| `worker.job.dequeued`            | Reports queue mechanics                      | Telemetry                                     | Queue consumer adapter or host                                                                  |
| `worker.slot.requested`          | Asks limiter for capacity                    | Command                                       | `ResourceAdmission.acquire()` adapter                                                           |
| `limiter.slot.granted`           | Delivers admission answer and logs it        | Reply plus telemetry                          | `AdmissionGrant`; old topic remains compatibility-only                                          |
| `limiter.slot.denied`            | Currently means queued/no immediate capacity | Compatibility reply                           | Remove ambiguous meaning; local `acquire()` continues waiting or returns a typed terminal error |
| `worker.slot.finished`           | Releases capacity                            | Command                                       | `ResourceAdmission.release()` adapter                                                           |
| `job.<capability>.started`       | Records execution start                      | Lifecycle event                               | Worker V2 forms the canonical job-started fact                                                  |
| `job.<capability>.completed`     | Both engine result and history fact          | Split result and lifecycle event              | `JobResult` advances engine; Worker V2 separately records completion                            |
| `job.<capability>.failed`        | Both engine result and history fact          | Split result and lifecycle event              | Failed `JobResult` advances engine; Worker V2 separately records failure                        |
| `tool.started/completed/failed`  | Protocol progress and result envelope        | Usually telemetry or internal protocol result | Protocol observer; do not drive worker control flow from these events                           |
| `worker.profile.submitted/added` | Registration handshake                       | Command/reply or delete                       | Reassess after capability registration removal; do not carry into V2 by default                 |
| `replay.mode.submitted`          | Changes side-effect behavior                 | Control command                               | Explicit worker/runtime control or alternate dispatch adapter; not a lifecycle fact             |
| `worker.started/stopped`         | Component/process status                     | Operational fact                              | Host or supervisor unless worker has a meaningful accepting/draining state                      |

This table is a migration aid, not a requirement to rename every event before Worker
V2 can execute a job.

## Event Ownership Rules

Use these rules for each migrated interaction.

### Commands

A command asks a component to do or decide something.

- the caller invokes its own outbound port
- a local adapter calls the target inbound port
- a remote adapter forms a command envelope
- the target inbound adapter translates the envelope into an inbound port call
- commands are not automatically written into durable run history

### Results And Replies

A result answers a command.

- Worker V2 returns `JobResult`
- a local adapter returns it directly
- a remote adapter correlates it to the original command
- a compatibility adapter may temporarily publish an old completion event
- engine control flow consumes the result contract, not worker lifecycle fanout

### Lifecycle Events

A lifecycle event records a fact about state owned by a component.

- Worker V2 forms job execution facts
- engine forms run and step facts
- lifecycle facts use an event sink regardless of local or remote deployment
- observers may react, lag, retry, or replay
- the owning component does not consume its public lifecycle events to move itself
  forward

### Telemetry

Telemetry explains mechanics.

- adapters report command dispatch and result delivery
- resource admission reports waiting/grant/release for debugging
- protocol executors report request timing and parsing failures
- hosts and supervisors report process and transport state
- telemetry failure must not normally fail a completed job

## Compatibility Architecture

The first integration should leave the current engine unchanged:

```text
Current engine
  -> publishes job.<capability>.submitted
  -> current router and queue
  -> LegacyQueuedJobAdapter
       -> translates queued event into ExecuteJobCommand
       -> calls Worker V2 JobExecution.execute()
       -> receives JobResult
       -> publishes current job.<capability>.completed/failed compatibility event
  -> current engine receives compatibility completion
```

Only the adapter knows the old event envelope, queue contract, emitter factory, and
topic names. Worker V2 sees a command and returns a result.

Worker V2's lifecycle sink runs independently of this compatibility result path. Do
not make the bus adapter wait for a lifecycle event to discover the method result.

Once that path works, migrate the engine side:

```text
Engine
  -> WorkerDispatch
  -> LocalWorkerDispatch
  -> Worker V2 JobExecution
```

At that point monolith mode can bypass the router and delivery queue. The old path can
remain available temporarily as a fallback and as the basis for a future remote
adapter.

## Illustrative File Shape

Do not begin with a repository-wide package move. A side-by-side shape inside the
existing worker package is enough to prove the design:

```text
packages/components/worker/src/
  worker.ts                         current implementation, initially untouched
  v2/
    worker.ts                       Worker V2 orchestration
    job.contracts.ts                plain command/result vocabulary
    worker-lifecycle.events.ts      worker-owned facts
    ports/
      inbound/
        job-execution.port.ts
      outbound/
        resource-admission.port.ts
        worker-event-sink.port.ts
    protocol/
      protocol-executor.types.ts
```

Possible integration code:

```text
packages/runtime/src/worker-v2/
  legacy-queued-job.adapter.ts
  local-worker-dispatch.ts
  create-worker-v2.ts
```

Protocol implementations can remain in `packages/tools` while their contracts are
moved away from `AnyEvent` and `EmitterFactoryPort`. Exact final placement should be
decided after the HTTP JSON slice reveals which code is worker orchestration and which
code is reusable protocol mechanics.

Component-owned ports may later move into clearer subpaths. Do not let final folder
taxonomy block the behavioral proof.

## Migration Phases

### Phase 0: Record The Boundary

Deliverables:

- this implementation guide
- a short draft ADR for port-driven component interaction, left in Proposed status
  until the HTTP JSON slice validates it
- an event migration ledger kept current as topics are touched

Exit condition:

- the team can state what Worker V2 receives, returns, emits, and depends on without
  referring to bus topics

### Phase 1: Core Contract And Tests

Create Worker V2 with fake collaborators.

Scope:

- plain `ExecuteJobCommand` and `JobResult`
- `JobExecution` inbound port
- lifecycle event sink
- resource-admission port
- one fake protocol executor
- one fake artifact adapter
- tests for success, expected failure, thrown invariant failure, cancellation, and
  guaranteed admission release

Exit conditions:

- Worker V2 executes a fake job end to end
- no V2 core file imports `EventBusPort`, `QueuePort`, `EmitterFactoryPort`, or
  `AnyEvent`
- tests assert returned results and lifecycle facts separately

### Phase 2: HTTP JSON Vertical Slice

Build one real, useful path.

Scope:

- fixed HTTP JSON executor
- timeout and cancellation
- response interpretation
- reference resolution required by HTTP JSON
- output artifact storage
- export validation and storage where currently supported
- local worker capacity and local resource admission

Do not include:

- MCP
- remote worker transport
- standalone limiter
- distributed queue
- supervisor
- global event-schema reclassification

Exit conditions:

- one representative HTTP JSON job completes through Worker V2
- output and export artifacts are available through `JobResult`
- failure and timeout produce typed failed results
- lifecycle facts do not carry the full raw response when an artifact reference is
  sufficient

### Phase 3: Legacy Compatibility Adapter

Connect Worker V2 to the current engine without changing engine control flow.

Scope:

- translate current queued job event into `ExecuteJobCommand`
- invoke Worker V2
- translate `JobResult` into current completion/failure compatibility event
- preserve trace, run, step, and job correlation
- provide a runtime switch that selects old worker or Worker V2 for the proven path

Exit conditions:

- current engine completes a real HTTP JSON step through Worker V2
- observability and run projection still receive required lifecycle/history facts
- compatibility event creation exists only in adapter code

### Phase 4: Engine WorkerDispatch

Change the local engine-to-worker interaction.

Scope:

- engine-owned `WorkerDispatch` outbound port
- local adapter calling Worker V2 inbound port
- engine internal completion command created from the returned result
- remove local dependence on `job.*.submitted` as the only control mechanism

Exit conditions:

- monolith execution does not require the router or delivery queue for Worker V2
- engine and worker cores do not import each other
- engine behavior is tested with a fake `WorkerDispatch`

### Phase 5: Complete The Worker Surface

After HTTP JSON proves the design:

- add MCP through the same protocol-executor shape
- settle generic binary and response capture
- remove obsolete tool registry behavior
- migrate remaining job event families
- remove the old worker when no runtime path uses it
- delete router/queue behavior only when no other component requires it

### Phase 6: Exercise A Remote Boundary

This phase is optional until deployment independence is intentionally tested.

Before calling it complete, define:

- serialization and versioning
- command and result correlation
- timeout and cancellation
- at-least-once duplicate handling
- worker loss during execution
- result redelivery
- idempotency expectations
- queue reservation acknowledgement and lease behavior

The remote adapter must pass the same semantic contract tests as the local adapter.

### Phase 7: Shared Resource Coordinator

Build this only when more than one worker must coordinate access to the same
constrained resource.

Required design work then includes:

- centralized or shared admission state
- stable request and grant identifiers
- idempotent acquire and release
- permit leases and expiration
- cancellation
- worker disappearance
- fairness and queue-reservation interaction
- distributed rate-limit algorithm and storage

Permit activity may remain telemetry unless coordinator recovery requires durable
permit state.

## Testing Strategy

### Worker Core Tests

Use fakes for all outbound dependencies and assert:

- command validation
- protocol selection
- lifecycle event order
- structured success and failure results
- artifact references in results
- cancellation propagation
- timeout behavior
- admission release on success, failure, cancellation, and thrown errors
- no full result payload in lifecycle history unless deliberately required

### Adapter Contract Tests

Define behavior once and run it against each `WorkerDispatch` implementation:

- accepted command reaches Worker V2 once semantically
- completed result correlates to the command
- failed result remains a result rather than becoming an untyped transport error
- cancellation reaches the worker where supported
- duplicate remote delivery does not advance engine state twice
- telemetry identifies local versus remote transport

### Compatibility Tests

For the first HTTP JSON slice, verify:

- old queued event maps to the same new command every time
- new result maps to the old completion/failure schema expected by the engine
- run, step, job, and trace identifiers survive translation
- current projections and replay history retain required facts

### Dependency Tests

Add a lightweight architecture assertion when practical:

- Worker V2 core does not import bus, queue, runtime, or another component core
- protocol executors do not import worker event emitters
- only hosts and integration adapters import both sides of a component connection

## Observability Expectations

Local and remote modes must preserve:

- the same Worker V2 lifecycle facts for the same execution outcome
- the same run, step, job, execution, and trace correlation vocabulary
- the same `JobResult` semantics

They may differ in:

- transport telemetry
- retries and redelivery metadata
- queue wait time
- process health events
- broker identifiers

Use a message or operation observer around adapters for debug mechanics. Do not force
local mode through an in-memory event bus solely to make its telemetry look remote.

### Failure-Model Testing

The production local adapter should not simulate remote failure behavior. It should
use the guarantees naturally provided by direct in-process calls.

When a remote adapter is introduced:

- core tests verify any promised idempotency using stable operation identifiers
- remote adapter tests cover deadlines, retries, correlation, duplicate delivery,
  cancellation, and error translation
- an in-process fake transport may inject failures into remote adapter tests
- real transport integration tests verify serialization, acknowledgements, process
  loss, and the transport's actual delivery guarantees

A fake transport used by remote adapter tests is not the production local adapter.
Passing simulated tests does not replace integration tests against the real transport.

## ADR Follow-Up

After the HTTP JSON vertical slice proves the design, write an ADR with a title such
as:

```text
Component interaction is port-driven; lifecycle events record owned facts
```

That ADR should explicitly state which earlier clauses it supersedes:

- ADR-0005's definition of components as necessarily self-driven bus subscribers
- ADR-0006's statement that worker core owns event-bus and queue coupling
- the worker investigation's proposal that a bus adapter should consume the same
  lifecycle event emitted for observability in order to receive a command result

It should explicitly preserve:

- ADR-0005's broader package taxonomy
- ADR-0006's fixed-protocol and no-registry decision
- lifecycle event emission for replay and status
- the option to run components in-process or out-of-process

Do not rewrite historical ADR text as if the earlier decision never existed. Add a
new decision and mark the affected earlier sections as superseded in part.

## Instructions For Implementation Agents

Before implementing Worker V2, read the files listed in [Read This With](#read-this-with).

Unless a later task explicitly expands scope:

1. Work only on the next incomplete migration phase.
2. Leave the current worker operational and avoid opportunistic cleanup inside it.
3. Do not introduce event-bus or queue dependencies into Worker V2 core.
4. Do not use old event envelopes as new domain contracts.
5. Keep compatibility event creation in adapters.
6. Keep protocol selection fixed and explicit; do not build a registry.
7. Use returned results for control flow and event sinks for lifecycle facts.
8. Keep permit activity as telemetry.
9. Prefer a local resource-admission implementation until multiple workers are real.
10. Add tests at the new boundary before changing runtime wiring.

When an implementation decision is not settled here, record the question and choose
the smallest reversible option that proves the current phase. Do not solve remote
delivery, supervisor control, distributed leases, or final package placement as a
side effect of the first worker slice.

## Open Questions That Do Not Block Phase 1

- Exact canonical names for Worker V2 lifecycle events
- Final physical location of component-owned port types
- Exact `JobResult` artifact and export reference shape
- Whether replay side-effect mode belongs on a worker control port or in dispatch
  configuration
- Whether worker capacity is enforced inside Worker V2 or by a host decorator
- Event-sink failure behavior after an external side effect has occurred
- Resource-key derivation for HTTP endpoints, accounts, and local models
- When retry/backoff policy becomes part of the first production path

Use explicit temporary names where needed, but do not hide these questions inside
generic `AnyEvent`, `unknown`, or untyped error paths.

## First Useful Pull Request

The first implementation pull request after this guide should be intentionally small:

- add the Worker V2 directory
- define command, result, and port types
- implement orchestration against fake protocol, artifact, admission, and event-sink
  collaborators
- add focused tests
- do not change runtime wiring
- do not modify the current worker beyond any strictly necessary export isolation

That pull request proves the component boundary. The next pull request proves the
boundary with HTTP JSON. Runtime and compatibility changes come only after both are
under test.

## Short Version

- Build Worker V2 beside the current worker.
- Worker V2 is called through `JobExecution`; it does not pull from a queue.
- Worker V2 returns `JobResult`; lifecycle events do not carry control flow.
- Bus and queue behavior live in adapters and hosts.
- Local monolith dispatch calls the inbound port directly.
- A future remote adapter can use commands and correlated results.
- Keep fixed HTTP JSON and MCP protocol support; remove registration concepts.
- Use local worker/resource limits first.
- Treat permit activity as telemetry.
- Migrate one HTTP JSON vertical slice before changing the engine.
- Preserve old events only in compatibility adapters.
- Reclassify events as they cross the migration boundary, not all at once.
- Delay distributed queues, leases, supervisor work, and a standalone limiter.
