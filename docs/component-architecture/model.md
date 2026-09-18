# Component Architecture Draft

Status: draft design note.

Implementation guides:

- [Worker Component Architecture](./worker/README.md)
- [Worker migration sequence](./worker/MIGRATION.md)
- [In-Process Message Delivery](./in-process-messaging/README.md)

> The Worker-specific direct-call, request/return, and wrapper guidance in this
> draft is superseded by the active Worker and in-process messaging guides
> above. The remaining material is preserved as the broader draft model and as
> design history; accepted ADRs remain authoritative where they apply.

This document captures a candidate direction for moving lowercase components between
in-process and out-of-process deployments without rewriting component core logic.
It is meant to be evaluated and revised before becoming an ADR.

This direction would supersede some of the current "components are self-driven by
subscribing to the event bus" architecture guidance. The replacement idea is not
"stop using events"; it is "separate commands, lifecycle facts, replies, and
telemetry so the same component can run locally or remotely."

## Goals

- A component can run embedded in a monolith, desktop app, or standalone process.
- Component core code does not change based on deployment shape.
- Component core packages do not import other component core packages.
- Cross-component communication lives at ports, adapters, integrations, or host
  wiring boundaries.
- Lifecycle events are emitted consistently in local and remote deployments.
- Debug observability can still show control activity such as admission requests,
  command dispatch, handler success, retries, and failures.

## Non-goals

- This is not a requirement to split the system into microservices.
- This is not a requirement to introduce an external broker immediately.
- This is not a requirement for in-process mode to pretend every local call is a
  remote bus message.
- This is not event sourcing unless a component explicitly chooses that model.
- This is not a full package move plan yet.

## Vocabulary

### Component

A long-lived logical unit that owns behavior, state transitions, and lifecycle
events for one part of the system.

Examples:

- `engine`
- `worker`
- `limiter`
- `router`
- `observability`

### Host

An executable or runtime entrypoint that loads one or more components and wires
their ports to adapters.

Examples:

- HTTP server host
- desktop monolith host
- worker process host
- limiter process host
- supervisor agent host

### Inbound Port

An interface a component exposes so something outside can ask it to do something.

The component owns its inbound ports because it owns the behavior behind them.

Examples:

- `RunSubmission`
- `RunControl`
- `JobExecution`
- `PermitAcquisition`
- `WorkerControl`
- `WorkerHealth`

### Outbound Port

An interface a component depends on because it needs a capability outside itself.

Name it in the caller's language rather than the provider's — `WorkAdmission`,
not `LimiterClient`. Naming it after the provider bakes one implementation into
the contract.

The caller does not automatically _own_ a separate port, though. When caller and
provider agree on the operation, they should share one capability contract; see
Port Ownership below for when to split them instead.

Examples:

- `WorkAdmission`
- `RunStore`
- `JobStore`
- `ArtifactStore`
- `EventSink`
- `Clock`

### Inbound Adapter

An adapter that receives external input and calls a component inbound port.

Examples:

- HTTP route handler
- CLI command
- bus command handler
- desktop IPC bridge
- test harness

### Outbound Adapter

An adapter that implements a component outbound port using infrastructure or
another component.

Examples:

- SQL repository
- filesystem artifact store
- local direct-call adapter
- bus client adapter
- cloud API client

### Integration Adapter

An adapter that is allowed to know about two components because it connects one
component's outbound port to another component's inbound port.

Reach for this only when the two sides genuinely speak different vocabularies —
a real semantic or policy translation, not just two names for the same
operation. Where caller and provider agree on the operation, share one
capability contract instead and skip the adapter entirely: a bridge that only
renames fields buys no isolation, and the pattern compounds, because it implies
one such adapter per component _pair_.

Example:

- `LocalWorkAdmission` implements the worker's `WorkAdmission` outbound port by
  calling the limiter's `PermitAcquisition` inbound port — justified only if
  admission and permit acquisition really are different operations.

### Message

A transport or envelope concept. A message may carry a command, event, reply, or
telemetry item.

Use `message` for infrastructure vocabulary. Use more precise words in component
logic.

### Command

A semantic request to do or decide something.

Examples:

- `StartRun`
- `PlanStep`
- `ExecuteStep`
- `SubmitJob`
- `AcquirePermit`
- `CancelRun`

### Lifecycle Event

A durable fact emitted by the component that owns the lifecycle being described.

Examples:

- `run.requested`
- `run.started`
- `step.planned`
- `step.completed`
- `job.started`
- `job.completed`
- `worker.draining`

### Telemetry Event

A debug or operations fact about mechanics, not domain state.

Examples:

- `command.dispatched`
- `command.handled`
- `handler.failed`
- `message.published`
- `outbound_call.failed`
- `heartbeat.missed`

### Supervisor

A runtime or operations component that sits next to a process or host and reports
health, status, and control information.

The supervisor owns process and operational facts. It does not own worker,
engine, or limiter business lifecycle events.

## Target Package Shape

This tree is illustrative, not a required one-shot move.

```text
packages/
  components/
    engine/
      src/
        engine.ts
        ports/
          inbound/
            run-submission.port.ts
            run-control.port.ts
            run-query.port.ts
          outbound/
            worker-dispatch.port.ts
            run-store.port.ts
            event-sink.port.ts
            clock.port.ts
        events/
          engine-lifecycle.events.ts
        commands/
          engine-commands.ts
        adapters/
          inbound/
            bus-run-submission.handler.ts
            http-run-control.handler.ts
          outbound/
            sql-run-store.ts

    worker/
      src/
        worker.ts
        ports/
          inbound/
            job-execution.port.ts
            worker-control.port.ts
            worker-health.port.ts
          outbound/
            work-admission.port.ts
            job-store.port.ts
            artifact-writer.port.ts
            event-sink.port.ts
        events/
          worker-lifecycle.events.ts
        commands/
          worker-commands.ts
        adapters/
          inbound/
            bus-job-execution.handler.ts
          outbound/
            sql-job-store.ts
            fs-artifact-writer.ts

    limiter/
      src/
        limiter.ts
        ports/
          inbound/
            permit-acquisition.port.ts
            limiter-health.port.ts
          outbound/
            permit-store.port.ts
            event-sink.port.ts
        events/
          limiter-lifecycle.events.ts
        commands/
          limiter-commands.ts
        adapters/
          inbound/
            bus-permit-acquisition.handler.ts
          outbound/
            sql-permit-store.ts

  integrations/
    worker-limiter/
      src/
        local-work-admission.ts
        bus-work-admission.ts
        register-limiter-bus-handlers.ts

    engine-worker/
      src/
        local-worker-dispatch.ts
        bus-worker-dispatch.ts
        register-worker-bus-handlers.ts

  runtime/
    src/
      component-lifecycle/
      events/
        event-sink.ts
        composite-event-sink.ts
        message-observer.ts
        outbox-relay.ts
      messaging/
        command-bus.ts
        message-envelope.ts
      supervisor/
        supervisor.ts
        process-monitor.ts
        component-status-registry.ts

  hosts/
    monolith/
      src/main.ts
    worker-service/
      src/main.ts
    limiter-service/
      src/main.ts
    supervisor-agent/
      src/main.ts
```

The existing repo may keep some adapters in `packages/adapters` for now. The
important rule is ownership and dependency direction, not the exact folder name.

## Dependency Rules

Component core may import:

- its own inbound ports
- its own outbound ports
- its own commands and lifecycle event types
- shared types/contracts
- foundation packages such as `types`, `specs`, and functional core packages

Component core must not import:

- another component's core package
- another component's concrete implementation
- process hosts
- external transport adapters
- concrete infrastructure adapters

Hosts may import multiple components because hosts are composition roots.

Integration packages may import multiple components because their job is to
connect component boundaries.

Adapters may import the port they implement and the infrastructure or component
they use to implement it.

## Local And Remote Wiring

The component implementation should stay the same. Only the port implementation
changes.

Example worker dependency:

```ts
export interface WorkAdmission {
  acquire(input: {
    runId: string;
    jobId: string;
    queue: string;
    cost: number;
  }): Promise<AdmissionDecision>;

  release(input: { grantId: string }): Promise<void>;
}
```

Worker core uses `WorkAdmission`:

```ts
export class Worker {
  constructor(
    private readonly admission: WorkAdmission,
    private readonly events: EventSink,
  ) {}

  async execute(job: WorkerJob): Promise<void> {
    const decision = await this.admission.acquire({
      runId: job.runId,
      jobId: job.id,
      queue: job.queue,
      cost: job.cost,
    });

    if (!decision.granted) {
      await this.events.record({
        type: "worker.job.blocked",
        runId: job.runId,
        jobId: job.id,
        reason: decision.reason,
      });
      return;
    }

    await this.events.record({
      type: "worker.job.started",
      runId: job.runId,
      jobId: job.id,
    });

    // run the job
  }
}
```

In-process host wiring:

```ts
const limiter = new Limiter({
  permits: permitStore,
  events: limiterEventSink,
});

const worker = new Worker({
  admission: new LocalWorkAdmission(limiter.permitAcquisition),
  events: workerEventSink,
});
```

Out-of-process worker host wiring:

```ts
const worker = new Worker({
  admission: new BusWorkAdmission(commandBus, messageObserver),
  events: workerEventSink,
});
```

Out-of-process limiter host wiring:

```ts
const limiter = new Limiter({
  permits: permitStore,
  events: limiterEventSink,
});

registerLimiterBusHandlers(commandBus, limiter.permitAcquisition);
```

The worker package does not need to import limiter core in either deployment.
Only the local integration adapter imports both sides.

Note on deployment parity:
Deployment parity means equivalent component semantics and lifecycle facts, not identical transport behavior or failure modes.

## In-Process Adapter Shape

In-process outbound adapters should usually call the target component's inbound
port directly. They should not publish a command-shaped event to an in-memory bus
just to simulate remote transport.

Prefer:

```text
Engine core
  -> WorkerDispatch outbound port
  -> LocalWorkerDispatch
  -> Worker JobExecution inbound port
```

Avoid:

```text
Engine core
  -> publishes job submitted event
  -> in-memory event bus
  -> Worker bus handler
  -> Worker JobExecution inbound port
```

The local adapter can still emit command telemetry through `MessageObserver`:

```ts
export class LocalWorkerDispatch implements WorkerDispatch {
  constructor(
    private readonly jobs: JobExecution,
    private readonly observer: MessageObserver,
  ) {}

  async submitJob(command: SubmitJob): Promise<JobAccepted> {
    this.observer.commandDispatched({
      command,
      transport: "local",
    });

    try {
      const result = await this.jobs.submitJob(command);
      this.observer.commandHandled({
        command,
        result,
        transport: "local",
      });
      return result;
    } catch (error) {
      this.observer.commandFailed({
        command,
        error,
        transport: "local",
      });
      throw error;
    }
  }
}
```

An in-memory bus can still exist, but it should have a specific role:

- lifecycle event fanout from `EventSink` to logs, projections, live UI, or tests
- compatibility bridge while old event-shaped control APIs are being migrated
- local command router only when async local command delivery is deliberately
  desired

If async local command delivery is needed, model it as a local command inbox or
queue:

```text
Engine core
  -> WorkerDispatch outbound port
  -> LocalWorkerInbox.enqueue(SubmitJob)
  -> Worker host loop
  -> Worker JobExecution inbound port
```

That is still a command path, not a lifecycle event path.

## Port Ownership

Name outbound ports from the consumer's perspective.

Prefer:

```text
Worker owns outbound port: WorkAdmission
```

Avoid:

```text
Worker owns outbound port: LimiterClient
```

`WorkAdmission` leaves room for several implementations:

- direct call to limiter in a monolith
- command over a bus
- allow-all test adapter
- static local capacity gate
- future cloud service

### One shared contract, or two ports plus a translation

Naming from the consumer's perspective does not mean every relationship gets two
ports. Use a shared capability contract when caller and provider agree on the
operation. Introduce separate ports plus an integration adapter only when there
is a real semantic or policy translation between them.

Engine-to-worker job execution is the shared-contract case, and is what the code
does today:

```text
One JobExecutionPort, defined in packages/ports.
The worker provides it. The engine consumes it. Neither imports the other.
```

It was previously modelled the other way — an engine-owned `WorkerDispatch`
outbound port, a worker-owned `JobExecution` inbound port, and a
`LocalWorkerJobExecutor` integration adapter between them. That was retired
because the adapter only renamed fields and reshaped a request; it bought no
isolation, and the rule that produced it would have minted another such bridge
for worker-to-limiter and worker-to-observability in turn.

The shared vocabulary is the **message**, not either component's internal type.
`JobExecutionRequest` is the real `job.httpjson.submitted` envelope; each core
translates it at its own boundary into whatever it uses internally. That keeps
local and remote paths honest — the same translation runs whether the message
came from a direct call or off a message log — and it keeps what observability
records identical to what the components actually exchanged.

A component still _owns_ its capability in the sense that matters: the worker
decides what job execution means. The contract just lives somewhere both sides
can name without depending on each other.

Avoid making the engine emit `job.<capability>.submitted` as its primary IO
mechanism. That topic can remain as a lifecycle or compatibility event if it is a
durable fact worth keeping, but the engine's control flow should call the
job-execution port.

> **Sections written against the older two-port model.** `In-Process Adapter
Shape`, `Engine To Worker Example`, and the `Target Package Shape` tree still
> describe an engine-owned `WorkerDispatch` port with a `LocalWorkerDispatch`
> adapter. Their general points (prefer a direct call over a simulated bus
> round-trip; adapters belong at real transport boundaries) still hold; their
> specific engine-to-worker shapes are superseded by this section.

## Event Categories

Do not use one generic "event" concept for everything.

| Category          | Meaning                                             | Owner                                                               | Durability                                      |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| Command           | "Please do or decide this."                         | Caller-side adapter creates it; receiver owns the handler contract. | Stored only if command audit is required.       |
| Reply/result      | "Here is the command result."                       | Receiver or transport adapter.                                      | Usually correlated telemetry, not history.      |
| Lifecycle event   | "This happened."                                    | Component that owns the lifecycle.                                  | Durable if replay/status/history depends on it. |
| Telemetry event   | "This mechanism did this."                          | Runtime, adapter, or supervisor.                                    | Optional; useful for console/debug/traces.      |
| Operational event | "This process/component changed operational state." | Supervisor or runtime.                                              | Durable only if operational history matters.    |

Commands and lifecycle events may share infrastructure, envelope metadata, and
correlation IDs. They should not share meaning.

## Event Ownership Rules

Component core forms lifecycle events for state it owns.

Examples:

- engine forms run and step lifecycle events
- worker forms worker and job execution lifecycle events
- limiter forms limiter and permit lifecycle events, if those facts matter
- observability forms projection status only if it owns that projection

Outbound adapters form control messages and command telemetry.

Examples:

- `BusWorkAdmission` forms `AcquirePermit`
- `BusWorkerDispatch` forms `SubmitJob`
- an HTTP client adapter forms an external HTTP request
- adapters may emit `command.dispatched`, `command.handled`, or
  `outbound_call.failed` telemetry

Inbound adapters translate external messages into inbound port calls.

Examples:

- `BusPermitAcquisitionHandler` receives `AcquirePermit` and calls limiter's
  `PermitAcquisition` inbound port
- `BusJobExecutionHandler` receives `SubmitJob` and calls worker's
  `JobExecution` inbound port
- an HTTP route receives `POST /runs` and calls engine or application-service
  run submission

Runtime and supervisor code form operational telemetry.

Examples:

- `process.started`
- `process.exited`
- `component.registered`
- `component.health_changed`
- `heartbeat.missed`
- `restart.requested`

## Lifecycle Events And Reactions

Other things are allowed to react to lifecycle events.

Good lifecycle-event reactions:

- status projections
- console logs
- metrics
- UI live updates
- audit/history storage
- optional external automation

These reactions should be allowed to lag, retry, fail, or be replayed without
corrupting the owning component's core progress.

The owning component should not usually depend on consuming its own public
lifecycle events to advance its internal state machine.

Prefer:

```text
PlanStep command
  -> engine plans step
  -> engine records step.planned lifecycle event
  -> engine enqueues ExecuteStep command
```

Avoid:

```text
engine records step.planned lifecycle event
  -> engine listens to its own lifecycle event
  -> engine advances the run
```

The second model can work if the component is explicitly event-sourced, but then
event ordering, idempotency, replay, and subscription semantics become core
correctness rules. That should be a deliberate design, not an accidental side
effect of using the event bus.

## Commands, Messages, And Internal Engine Flow

Use `Command` for intent and control flow.

Use `Message` for the envelope or transport abstraction that carries a command,
event, reply, or telemetry item.

Engine internals can still use an inbox/message loop. The items handled by that
loop should usually be commands.

Example:

```ts
type EngineCommand =
  | { type: "StartRun"; runId: string }
  | { type: "PlanStep"; runId: string; stepId: string }
  | { type: "ExecuteStep"; runId: string; stepId: string }
  | { type: "CompleteStep"; runId: string; stepId: string; result: StepResult }
  | { type: "CancelRun"; runId: string; reason: string };
```

The command drives the engine. The lifecycle event records what happened.

```ts
async function handlePlanStep(command: PlanStep): Promise<void> {
  const plan = await planner.plan(command);

  await eventSink.record({
    type: "step.planned",
    runId: command.runId,
    stepId: command.stepId,
    plan,
  });

  await inbox.enqueue({
    kind: "command",
    command: {
      type: "ExecuteStep",
      runId: command.runId,
      stepId: command.stepId,
    },
  });
}
```

## Event Sink Vs Message Observer

`EventSink` is for durable component facts.

```ts
export interface EventSink {
  record(event: LifecycleEvent): Promise<void>;
}
```

`MessageObserver` is for debug/transport telemetry.

```ts
export interface MessageObserver {
  commandDispatched(envelope: CommandEnvelope): void;
  commandHandled(envelope: CommandEnvelope, result: unknown): void;
  commandFailed(envelope: CommandEnvelope, error: unknown): void;
}
```

A bus-backed outbound adapter may use both:

```ts
export class BusWorkAdmission implements WorkAdmission {
  constructor(
    private readonly bus: CommandBus,
    private readonly observer: MessageObserver,
  ) {}

  async acquire(input: WorkAdmissionInput): Promise<AdmissionDecision> {
    const command = toAcquirePermitCommand(input);
    this.observer.commandDispatched(command);

    try {
      const result = await this.bus.request(command);
      this.observer.commandHandled(command, result);
      return toAdmissionDecision(result);
    } catch (error) {
      this.observer.commandFailed(command, error);
      throw error;
    }
  }
}
```

This keeps run history clean while still making command mechanics visible in a
console or trace view.

## Limiter Admission Example

Current shape:

```text
worker.slot.requested
  -> limiter listens
  -> limiter emits limiter.slot.granted or limiter.slot.denied
```

Candidate shape:

```text
Worker core
  -> calls WorkAdmission.acquire()

LocalWorkAdmission
  -> calls limiter PermitAcquisition inbound port directly

BusWorkAdmission
  -> sends AcquirePermit command
  -> waits for PermitGranted or PermitDenied reply/result

Limiter core
  -> decides grant or deny
  -> records limiter lifecycle event only if permit decisions are meaningful
     limiter history

MessageObserver
  -> records command/request telemetry for debugging
```

The worker run history does not need to include admission mechanics unless they
matter to the user's understanding of the run.

If capacity waiting is visible run state, the worker or engine can record a
lifecycle event such as:

```text
worker.job.waiting_for_capacity
worker.job.admitted
```

If the goal is only to debug whether the limiter worked, record telemetry such as:

```text
command.dispatched AcquirePermit
command.handled AcquirePermit granted
```

## Engine To Worker Example

Current shape:

```text
engine emits job.<capability>.submitted
router listens and queues work
worker dequeues and eventually emits job.<capability>.completed or failed
```

Candidate shape:

```text
Engine core
  -> calls WorkerDispatch.submitJob()
  -> records step/job lifecycle facts it owns

LocalWorkerDispatch
  -> calls worker JobExecution inbound port directly or through an in-memory queue

BusWorkerDispatch
  -> sends SubmitJob command

Worker bus handler
  -> receives SubmitJob
  -> calls worker JobExecution inbound port

Worker core
  -> records worker/job lifecycle facts it owns
  -> returns or emits completion result according to the chosen dispatch contract
```

If `job.<capability>.submitted` remains useful for history, it should be treated
as a lifecycle fact owned by the component that owns job submission state. It
should not be the only way the engine asks a worker to do work.

## Local And Remote Observability Consistency

Local and remote deployments must preserve:

- same component core behavior
- same inbound and outbound port semantics
- same lifecycle events for the same component facts
- same correlation vocabulary where possible

Local and remote deployments may differ in:

- transport telemetry
- retry details
- broker-specific delivery metadata
- process-level operational events

In-process mode does not need to publish every command to a broker-like event
bus. It can still emit telemetry with the same vocabulary:

```text
operation: work_admission.acquire
transport: local
result: granted
```

Remote mode can emit:

```text
operation: work_admission.acquire
transport: bus
message_type: AcquirePermit
result: granted
```

Both are observable without making local mode unnecessarily remote-shaped.

## Supervisor Model

The supervisor is an operations/runtime concern.

It may run:

- inside a monolith host
- as a sidecar next to a component process
- as a standalone process monitor
- as a control-plane agent

It should talk to components through operational inbound ports such as:

```text
ComponentHealth
ComponentStatus
ComponentControl
```

Component examples:

```text
WorkerHealth
WorkerControl
LimiterHealth
EngineControl
```

The supervisor may:

- start and stop processes
- ask a component to pause, resume, drain, or stop
- collect health and heartbeat information
- report component registration and status
- emit operational telemetry
- expose a control API to the rest of the system

The supervisor should not:

- form worker job lifecycle events
- form engine run lifecycle events
- form limiter permit lifecycle events
- become required for component business logic to run in-process

Supervisor-owned events:

```text
process.started
process.exited
component.registered
component.health_changed
heartbeat.missed
restart.requested
restart.completed
```

Worker-owned events remain worker-owned:

```text
worker.job.started
worker.job.completed
worker.draining
```

Engine-owned events remain engine-owned:

```text
run.started
step.planned
step.completed
```

## Design Checklist

When adding or refactoring a component boundary, answer these questions:

1. Is this an inbound port, outbound port, adapter, command, event, reply, or
   telemetry item?
2. Which component owns the behavior?
3. Which component owns the state or lifecycle fact?
4. Does the caller need a reply before it can continue?
5. Does this fact belong in durable run history, component history, telemetry, or
   nowhere?
6. Would the component core still work if the other component ran in a different
   process?
7. Does this import pull another component core into a standalone deployable?
8. Is this local/remote difference in core behavior or only in the adapter?

## Migration Sketch

This is a large revision. Do it as vertical slices.

1. Inventory existing event topics and classify each as command, reply, lifecycle
   event, telemetry, or operational event.
2. Pick the worker rewrite as the first proving ground.
3. Define worker inbound ports and outbound ports before writing adapters.
4. Convert limiter slot handling into `WorkAdmission` plus limiter
   `PermitAcquisition`.
5. Keep existing event emissions where needed for compatibility, but label their
   intended future category.
6. Introduce `MessageObserver` or equivalent telemetry separately from durable
   lifecycle `EventSink`.
7. Convert engine-to-worker dispatch from event-as-command to `WorkerDispatch`.
8. Rework engine self-subscription only if needed, replacing lifecycle-event
   control flow with internal commands/inbox messages.
9. Add local adapters first.
10. Add bus adapters second.
11. Add supervisor/control-plane pieces after component health/control ports are
    clear.

## Open Questions

- Which lifecycle events are required for replay versus only useful for live
  status?
- Should `run.requested` be owned by application services or by engine run
  submission?
- Should job lifecycle facts be owned by engine, worker, or split by phase?
- Which command contracts live in component packages versus shared contracts?
- Should telemetry be persisted, streamed only, or both?
- How much of the current router remains after `WorkerDispatch` exists?
- Does any component intentionally want event sourcing, or should all internal
  progress be command/inbox driven?
- What control authority should the supervisor have in desktop monolith mode?

## Short Version For Future Agents

- Components expose inbound ports and depend on outbound ports.
- Outbound ports are named from the caller's perspective.
- Component core must not import another component core.
- Hosts and integration adapters are allowed to connect multiple components.
- Commands ask for work or decisions.
- Lifecycle events record facts that happened.
- Replies correlate command results.
- Telemetry describes mechanics.
- Component core forms lifecycle events for state it owns.
- Adapters form control messages and transport telemetry.
- Supervisors form operational events.
- Local and remote deployments must emit the same lifecycle facts, but they do
  not need identical transport mechanics.
- A component should not depend on consuming its own public lifecycle events for
  forward progress unless it is deliberately event-sourced.

## Other implementation note:

Do not add synthetic remote failures, correlation machinery, or delivery semantics to LocalWorkerDispatch; test those through the future remote adapter
