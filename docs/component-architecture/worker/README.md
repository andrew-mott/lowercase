# Worker Component Architecture

Status: proposed Worker architecture reference; not an ADR.

This document defines the intended durable shape of the lowercase Worker after
CloudEvent-shaped Messages become the protocol between autonomous components.
It describes ownership and boundaries rather than a particular migration step.
See [`MIGRATION.md`](./MIGRATION.md) for the current repository sequence.

This reference supersedes the future-facing guidance in the
[`worker-v2`](../worker-v2/README.md) implementation guide, especially its
direct request/return boundary and decorator-based public Worker shape. That
guide remains the point-in-time plan behind the Worker V2 implementation.

The redesign preserves the parts of Worker V2 that still fit:

- a fixed, first-party set of protocol executors;
- modeled job outcomes rather than exceptions for expected failures;
- artifact reads and writes through narrow ports;
- resource admission immediately around constrained external work;
- Worker-wide capacity distinct from per-resource permits; and
- no dependency on another component's implementation.

Until the first Engine -> Worker -> Engine Message slice is implemented, this
document is a proposed replacement being tested under the Swappable
Infrastructure initiative. It does not by itself supersede an Accepted ADR.

## Read this with

- [`MIGRATION.md`](./MIGRATION.md) describes the minimum structural runway, the
  atomic HTTP JSON Message cutover, and later cleanup.
- [In-Process Message Delivery](../in-process-messaging/README.md) defines the
  local publisher, subscription, mailbox, and handler semantics.
- [First Project Slice](../in-process-messaging/MVP-IMPLEMENTATION.md) applies
  those delivery semantics to Engine, Worker, and Observability.
- [Message Carrier Architecture](../../initiatives/swappable-infrastructure/research/message-carrier-architecture.md)
  describes the fuller local and Redis-backed direction.
- [Component Architecture Draft](../model.md) contains the broader component,
  host, port, and adapter vocabulary. Its older Worker-specific direct-call
  examples are superseded by this reference.
- [ADR-0005](../../adr/0005-package-tier-taxonomy.md) and
  [ADR-0006](../../adr/0006-worker-tool-extensibility-model.md) remain the
  accepted decisions until a later component-interaction ADR is accepted.

## Executive decision

Worker is one stable, long-lived component root. It accepts canonical
Messages, coordinates Worker-owned policy, delegates focused algorithms to
collaborators, and publishes canonical Messages through narrow capabilities.

Runtime constructs and retains the actual Worker. It binds a Worker handler to
the selected carrier; it does not wrap the Worker in another object that
becomes the apparent component. The same Worker implementation is used with
the local mailbox and a future Redis host.

Worker remains lean because ownership does not mean implementing everything in
`worker.ts`. Worker owns the sequence and the component-wide invariants.
Focused collaborators implement the mechanisms inside that sequence.

```text
Runtime / carrier
      |
      | submitted Message
      v
+----------------------------------------------------+
| Worker                                             |
|                                                    |
| handleHttpJsonSubmitted()                          |
|   |                                                |
|   +-- retain canonical execution origin            |
|   +-- coordinate WorkerCapacity                    |
|   +-- delegate one-job work to JobRunner           |
|   `-- publish through Worker Message reporting     |
|                                                    |
| outbound capabilities:                             |
| artifacts, resource permits, protocol execution,  |
| terminal publication, optional observations        |
+----------------------------------------------------+
      |
      | canonical Messages
      v
Runtime / carrier
```

## Design invariants

These rules are more important than exact class or directory names:

1. Messages are the protocol between autonomous components in every
   deployment profile.
2. Runtime constructs one identifiable Worker instance and binds one of its
   methods as a Message handler.
3. The complete inbound Message remains the source of job identity, scope, and
   trace information for that execution.
4. Internal types project genuinely different concepts; they do not mirror an
   envelope merely to rename its fields.
5. Worker owns execution sequencing and Worker-wide capacity.
6. JobRunner owns the mechanics of executing one accepted job.
7. Worker alone owns construction and authoritative publication of the
   terminal job Message.
8. Runtime owns publications, logical subscriptions, carrier selection, and
   handler binding.
9. Carrier infrastructure owns scheduling, fanout, delivery settlement, and
   transport recovery.
10. Worker never receives a router, mailbox, Redis client, consumer group,
    acknowledgement token, or topology registry.
11. Expected job failures produce modeled failed terminal Messages. An
    unexpected programming or dependency failure rejects the handler and does
    not invent a business outcome.
12. Lifecycle APIs are added only when Worker has real lifecycle transitions
    and guarantees to implement.

## Ownership

| Owner                   | Responsibility                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Runtime profile         | Select configuration and carrier, resolve bound publishers, construct Worker, bind its handler                         |
| Carrier or host         | Admit, schedule, invoke, and settle delivery; wire-backed hosts also decode and validate                               |
| Worker                  | Accept a job, coordinate capacity and execution, decide its modeled outcome, and publish the terminal Message          |
| Worker Message boundary | Interpret submitted Messages and construct canonical outbound Messages                                                 |
| WorkerCapacity          | Enforce the component-wide active-execution bound and expose capacity transitions                                      |
| JobRunner               | Resolve inputs, materialize and invoke a protocol, use resource permits, store outputs, and return one modeled outcome |
| Protocol executor       | Perform protocol-specific I/O and return a protocol-shaped result                                                      |
| Resource permit         | Govern access to a constrained external resource                                                                       |
| Artifact ports          | Load referenced values and store output content                                                                        |
| Observability           | Independently consume published Messages and project them to sinks                                                     |

“Worker owns” means Worker has authority over the sequencing and policy. The
code implementing a policy may live in a focused collaborator that Worker
retains.

## The stable Worker root

The public component should remain small. Its eventual surface may resemble:

```ts
export class Worker {
  readonly source: string;

  readonly handleHttpJsonSubmitted: MessageHandler<"job.httpjson.submitted">;

  // Add meaningful lifecycle/control operations only when implemented.
}
```

The exact handler name is not settled. The important properties are:

- runtime retains `Worker`, not a narrowed replacement object;
- a handler passed as a callback is bound safely, for example with an arrow
  property;
- Worker owns or retains its capacity state;
- there is no public command-executor object that is also presented as “the
  Worker”;
- after cutover there is no alternate direct `execute()` path for another
  component; and
- internal collaborators are not exported as alternate Worker construction
  paths merely to make tests convenient.

A `createWorker()` factory is still appropriate. Construction is not wrapping
when the factory assembles internal collaborators and returns the actual Worker
instance.

## Message ingress and execution context

Worker accepts the literal submitted Message:

```ts
type HttpJsonSubmission = MessageOf<"job.httpjson.submitted">;
```

It must not first flatten that Message into another inter-component request
envelope. Retaining the original value keeps one authoritative source for:

- Message ID, source, and creation time;
- flow, run, step, job, capability, and tool scope;
- trace and span context;
- protocol input data and reference declarations; and
- future correlation or deduplication decisions.

Worker may create a small execution context that retains the Message and adds
only process-local control:

```ts
type WorkerExecution = {
  readonly submission: HttpJsonSubmission;
  readonly signal?: AbortSignal;
};
```

An attempt identifier belongs here only after an execution attempt has real
semantics distinct from both the submitted Message ID and `jobid`. Do not
continue the temporary `executionId = jobid` convention merely because an
existing mapper does so.

`AbortSignal` is never Message data. The first Message-only handler has no
caller-supplied signal and may omit it. A signal can later represent real
Worker-owned shutdown or internal cancellation, but should not be invented
before such lifecycle exists. Cross-process cancellation requires an explicit
correlated cancellation Message or durable state protocol.

The execution context is not a dependency bag. It must not accumulate artifact
stores, protocol clients, permits, configuration, publishers, or transport
state.

## Translate meaning, not spelling

Translation remains useful when it changes semantics or protects an
invariant. Examples include:

- submitted HTTP data becoming a fixed `ProtocolRequest`;
- reference declarations becoming materialized values;
- a raw protocol response becoming stored artifact references; and
- a modeled job outcome becoming terminal Message data.

These are not useful translations:

- `jobid` becoming `jobId`;
- `traceid` becoming `traceId`;
- a complete Message becoming an almost-identical “request envelope”; or
- a result repeating job identity already available through its execution
  origin.

Prefer indexed aliases when a name improves readability without creating a
second structure:

```ts
type SubmittedData = HttpJsonSubmission["data"];
```

The rule is:

> An internal type earns its existence by changing meaning or protecting an
> invariant, not merely by changing names.

The first Message cutover may temporarily retain parts of
`ExecuteJobCommand` and `JobResult` to keep the vertical slice reviewable. In
that transitional state, the complete submitted Message must still remain
available for terminal construction and correlation. The old command/result
types are internal migration seams, never the renewed component protocol.

## Focused collaborators

### JobRunner

JobRunner performs one job after Worker accepts it. It may own:

- command validation that is genuinely execution-specific;
- reference resolution;
- HTTP request materialization;
- resource-key resolution and permit use;
- timeout and protocol invocation;
- output and export storage; and
- modeled success, failure, and cancellation results.

JobRunner does not choose how work arrives, subscribe to anything, publish a
terminal Message, or know Redis delivery metadata. Runtime never wires it
directly.

### WorkerCapacity

WorkerCapacity owns the semaphore or equivalent Worker-wide concurrency state.
Worker calls it; it does not wrap Worker while implementing the same interface.

Capacity must release in a `finally` path. Cancellation while waiting must not
start JobRunner. Waiting, granted, cancelled, and released observations may be
reported through a narrow reporting capability.

Worker-wide capacity and `ResourcePermitPort` answer different questions:

- Worker capacity bounds all active executions accepted by one Worker.
- A resource permit bounds access to a particular resolved external resource.

Carrier `maxInFlight` is different again. It limits how many deliveries the
carrier presents concurrently. It can be configured from the same runtime
value to avoid over-delivery, but Worker capacity remains the final invariant
regardless of carrier behavior or future additional handlers.

### Protocol, permit, and artifact collaborators

These collaborators remain protocol-shaped, resource-shaped, and
storage-shaped. Give each only the information it needs. A protocol executor
usually needs a materialized request and a signal, not the submitted Message.
An artifact store needs content or a hash, not job scope. A permit provider
needs a request identity and resource key, not a router.

Worker may project a small `JobRunInput` for JobRunner containing the submitted
payload/ref declarations, optional process-local signal, and the identity
needed by a permit. For the first no-redelivery mailbox slice, the submitted
Message ID is an honest `PermitRequest.requestId`. It is an occurrence identity,
not a claim that durable execution-attempt identity has been solved. JobRunner
does not need copied run, step, trace, or source fields merely to use a permit;
Worker retains those on the original Message for reporting and terminal
construction.

## One common outbound Message path

Worker needs one auditable place that forms its outbound envelopes. A focused
Worker-owned factory can create an execution-scoped reporting capability from
the submitted Message:

```ts
const reporting = workerMessages.forSubmission(submission);
```

Conceptually, that scoped capability may expose separate least-authority
facets:

```ts
type WorkerMessageSession = {
  observations: WorkerExecutionReporter;
  terminal: WorkerTerminalReporter;
};
```

Worker retains the terminal facet. A collaborator receives only the specific
observation facet it needs. No collaborator receives an unrestricted
`MessagePublisher<EventType>`.

The reporting implementation centralizes:

- `buildEvent()` and schema-valid construction;
- Worker outbound source, which is sufficient identity for the first slice;
- selection of job scope from the submitted Message;
- trace propagation and causal-span policy;
- selection of the correct bound publisher; and
- publication failure policy.

Start smaller than this complete interface if the first slice only needs a
terminal publisher. Expand it when a real capacity or execution observation is
activated. Do not pre-create methods for every possible event.

Major lifecycle transitions visible in `Worker` should normally be reported by
Worker around collaborator calls. Give reporting directly to a collaborator
only when that collaborator alone knows when an observation occurred. This
keeps the important sequence visible at the component root.

### Terminal and observation reliability

Both terminal facts and telemetry are Messages, but they do not necessarily
have the same failure semantics.

- Terminal completion or failure is authoritative. Worker awaits publication
  admission; if admission fails, the handler rejects.
- Operational observations may be best-effort. Their implementation must catch
  and report admission failure through a non-Message error path without
  changing the modeled job outcome.

Best-effort does not mean an untracked Promise. The reporter must own and
observe any detached task. It must also avoid recursively publishing telemetry
about failure of its own telemetry publication.

If a remote execution performs an external side effect and terminal
publication subsequently fails, leaving the submitted delivery unsettled is
truthful but does not make redelivery safe. Idempotency, reconciliation, or an
outbox remains separate reliability work.

## Envelope metadata policy

A new terminal or observation is a new Message. It receives a new Message ID,
time, source, and type-specific attributes. It derives correlation from the
submission rather than reusing the original envelope wholesale.

| Inbound field                          | Outbound treatment                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                                   | Retain as causal or future deduplication input; never reuse as the new Message ID |
| Job scope fields                       | Select explicitly into the outbound job scope                                     |
| `source`                               | Preserve as origin context; outbound `source` identifies Worker                   |
| `time`                                 | Keep on the origin; create a new outbound time                                    |
| `traceid`                              | Inherit into the resulting trace                                                  |
| `spanid` and `traceparent`             | Use according to the explicit causal-span policy                                  |
| `tracestate`                           | Propagate explicitly if the chosen policy requires it                             |
| `type`, `domain`, `entity`, `action`   | Validate the input; regenerate for the outbound type                              |
| `data`                                 | Project only when internal or outbound meaning differs                            |
| Redis stream/group/consumer/ack fields | Never enter Worker                                                                |

Do not spread an entire inbound Message into event-builder options. Select the
scope deliberately so fields belonging only to the submitted event cannot leak
into a terminal event.

The current `buildEvent({ fromEvent })` path retains the inbound trace ID but
does not by itself establish parent-span causality for job events or copy every
trace field. The Message cutover must either extend that policy or document its
initial limitation; it must not claim causal behavior the helper does not
provide.

## Terminal ownership and handler truth

The Worker root owns the terminal mapping:

```text
modeled completion -> one job.httpjson.completed Message
modeled failure    -> one job.httpjson.failed Message
unexpected throw   -> handler rejection; no fabricated terminal Message
```

JobRunner returns a modeled outcome. It never publishes the terminal. Engine
consumes the literal terminal Message and never reconstructs it from a returned
value.

The Worker handler resolves only after:

1. Worker-owned processing for that delivery has finished; and
2. its immediate terminal Message has reached publication admission.

It does not wait for Engine or Observability to process the terminal Message.

Once this path is authoritative, a second completed/failed lifecycle DTO must
not claim to be another canonical fact. Existing diagnostic lifecycle output
may remain temporarily during migration, but it must be clearly subordinate
and must be retired or reconciled before it is made durable or presented as a
second protocol fact.

The current `JobFailedData` schema carries status, output, export hashes, and an
optional message, but not `JobExecutionError.code` or `retryable`. Unless the
first cutover explicitly expands that schema, its canonical failed Message
preserves current behavior by carrying the error message while those fields
remain internal. Cancellation is therefore not distinguishable from other
failures by a typed terminal code in that slice. Document and test this loss;
do not claim failure-code fidelity that the envelope cannot represent.

## Telemetry ownership

Telemetry names must describe the owner and moment truthfully:

| Observation                                          | Owner                             |
| ---------------------------------------------------- | --------------------------------- |
| Mailbox dequeue or Redis read/claim                  | Carrier or host                   |
| Worker handler accepted a Message                    | Worker                            |
| Waiting for, receiving, or releasing Worker capacity | WorkerCapacity                    |
| Waiting for or releasing a resource permit           | Resource-admission implementation |
| Protocol duration or response mechanics              | Protocol executor or its observer |
| Job execution started/completed/failed               | Worker                            |
| Process boot, crash, or restart                      | Host or supervisor                |

The semaphore does not dequeue work. If one transport-neutral milestone is
needed across local and remote profiles, “Worker accepted job” at handler entry
is more precise than pretending both carriers perform the same dequeue action.
The existing event taxonomy can be changed in a later focused effort; this
ownership rule does not require renaming events during the first cutover.

Sequentially awaiting Message admission can preserve creation order for one
execution without awaiting recipients. Independent subscriptions may process
those Messages at different times, and separate Redis streams cannot provide a
global cross-publication order without an additional ordering design.

## Ports, adapters, and folders

Inbound and outbound remain useful directional vocabulary:

- the submitted Message handler is inbound to Worker;
- bound Message publishers, artifact I/O, resource permits, and protocol I/O
  are outbound dependencies from Worker; and
- a Redis reader is transport ingress while a Redis writer is transport
  egress.

These directions do not require mirrored `ports/inbound/`, `ports/outbound/`,
`adapters/inbound/`, and `adapters/outbound/` directory trees.

`MessageHandler<T>` is a shared handler contract. Worker implements it through
a method because the accepted Message semantics belong to Worker. A separate
Worker-specific inbound-port file adds no value unless Worker later exposes a
distinct reusable capability.

`MessagePublisher<T>` is a shared outbound port. Runtime injects a publisher
already bound to a declared publication, so Worker cannot select arbitrary
routes. Mailbox and Redis implementations differ outside Worker; there is no
local Worker adapter and Redis Worker adapter pair.

Worker-specific capability ports such as resource admission may remain beside
Worker. Component-specific passive adapters may also live there when that
placement preserves cohesion. Generic carrier machinery belongs to runtime or
infrastructure packages.

Folders communicate ownership and navigation, not proof of hexagonal purity.
Use `messaging/` or `message-boundary/` only when several cohesive files earn
that directory. A handler method does not need its own wrapper file merely to
occupy an “inbound adapter” category.

## Local and remote composition

### In-process profile

Conceptually, runtime performs:

```ts
const terminalPublisher = router.publisher(httpJobTerminalPublication);

const worker = createWorker(
  {
    artifacts,
    permits,
    protocol,
    terminalPublisher,
    source: workerSource,
  },
  workerConfig,
);

router.bind({
  subscription: workerHttpJobSubscription,
  handler: worker.handleHttpJsonSubmitted,
  maxInFlight: workerConfig.maxConcurrentJobs,
});
```

Runtime resolves publishers before binding because construction is cyclic at
the graph level. Worker sees only the bound publisher and its own handler.
Mailbox delivery remains asynchronous and non-reentrant.

The first slice may use the CloudEvent `source` as Worker's only exposed
identity. A separate Worker ID is added only when control, health, or
multi-instance behavior gives it a distinct meaning.

### Redis-backed profile

The component-facing shape stays the same:

```text
Redis host reads and validates Message
  -> invokes worker.handleHttpJsonSubmitted(message)
  -> Worker publishes through Redis-backed bound publishers
  -> host applies delivery-settlement policy
```

Redis stream keys, group and consumer identities, blocking reads,
acknowledgements, pending claims, and retention belong to the host and carrier
configuration. They do not extend `WorkerExecution`.

The current publication and logical-subscription declarations express stable
topology meaning. A Redis profile will need additional host and infrastructure
configuration, but that configuration maps the same declarations to Redis; it
does not require component-specific Worker implementations.

## Target package shape

The exact file count is not an invariant. A likely shape is:

```text
packages/components/worker/src/
  worker.ts                         stable component root

  execution/
    job-runner.ts                   one-job algorithm
    job-execution.types.ts          internal work/outcome/control types
    worker-capacity.ts              owned capacity collaborator
    job-result.factories.ts

  messaging/
    httpjson-submission.ts          pure interpretation/projection helpers
    worker-messages.ts              envelope construction/reporting policy

  protocol/
    protocol-executor.types.ts
    http-json/
      ...

  ports/
    outbound/
      resource-permit.port.ts

  adapters/
    outbound/
      local-resource-permit.adapter.ts
```

Keep construction in a Worker factory if it hides useful internal assembly,
but return `Worker`. Do not create a standalone handler wrapper and a handler
method for the same boundary.

Start with fewer files when two responsibilities are still small and change
together. Split only after a collaborator has a coherent name, contract, and
reason to vary or be tested independently.

## Anti-balloon rules

- Worker owns sequencing, not every algorithm.
- A collaborator owns one cohesive policy, mechanism, or algorithm.
- Collaborators never implement or impersonate the Worker interface.
- Avoid forwarding-only classes that add no policy or invariant.
- Keep pure conversions as functions.
- Do not give every collaborator every dependency.
- Do not introduce a generic dependency bag or service locator.
- Infrastructure enters through narrow capabilities.
- Runtime topology and transport configuration never enter Worker.
- Carrier acknowledgement and retry state never enter Worker.
- Keep the public Worker surface small.
- Add handlers to the same Worker only when they share its identity, state,
  lifecycle, and execution policy.
- Different security, concurrency, or hosting requirements may justify a
  distinct inbound facet or component.
- One fact has one canonical publisher.
- Do not add lifecycle methods until real lifecycle state exists.
- Split a growing execution phase into a collaborator before `worker.ts`
  becomes an algorithm warehouse.

A useful extraction test is:

> If code decides what the Worker does next, it belongs in Worker
> orchestration. If it implements how one focused step works, it belongs in a
> collaborator.

## Lifecycle

Long-lived means runtime creates one Worker instance, reuses it across many
deliveries, and lets it own Worker-wide state. It does not mean Worker must poll
a queue or subscribe itself.

Today, real Worker state includes capacity. Future accepting, draining, and
active-execution state would also belong to Worker. The carrier or host may
have a separate lifecycle for polling and delivery.

Do not add no-op `start()`, `stop()`, `drain()`, or `health()` methods for
symmetry. A truthful graceful stop would need to define at least:

1. how external intake stops;
2. whether queued deliveries remain accepted;
3. whether active jobs finish or are cancelled;
4. how terminal publication is settled; and
5. how Worker and carrier shutdown order is coordinated.

Process boot, crash, and restart may remain host or supervisor facts rather
than Worker business lifecycle facts.

## Testing expectations

The architecture should be demonstrated through behavior and dependency
checks:

- runtime binds a method on the retained Worker instance;
- Worker receives the complete submitted Message;
- terminal construction preserves job scope and intended trace lineage while
  assigning Worker source and a new Message identity/time;
- modeled success and failure each publish exactly one terminal;
- an unexpected throw publishes no terminal and rejects the handler;
- terminal admission failure rejects the handler;
- capacity releases after completion, modeled failure, cancellation, and
  unexpected throw;
- Worker-wide capacity still holds when work enters through Message delivery;
- observation failure follows its explicit required or best-effort policy;
- JobRunner, protocol, artifact, and permit internals import no carrier
  implementation;
- local and future Redis contract tests invoke the same Worker handler shape;
  and
- no direct component-to-component execution route remains after cutover.

Architecture tests should allow Message types and `buildEvent()` only at the
Worker root or its explicit Message-boundary collaborators. They should
continue banning EventBus, mailbox, runtime, Redis, and another component's
implementation throughout Worker.

## Deferred decisions

This design deliberately does not settle:

- graceful draining and shutdown;
- bounded mailbox backpressure;
- Redis retry, claim, and recovery policy;
- idempotency, duplicate terminal handling, reconciliation, or an outbox;
- durable attempt identity;
- cross-process cancellation;
- component-wide capacity shared across several subscriptions;
- distributed resource admission;
- Worker readiness and health;
- multiple competing Worker instances;
- global ordering across publications or streams;
- full command/event/reply/telemetry taxonomy changes;
- final names for every existing Worker event; or
- dynamic protocol registration, which remains rejected by ADR-0006.

These decisions can extend the focused collaborators or carrier without
changing the Worker component root.

## Completion criteria

The target shape is proven when:

- runtime holds one actual Worker instance;
- Worker exposes the canonical submitted-Message handler;
- the complete inbound Message remains the execution origin;
- no redundant inter-component request envelope exists;
- capacity is Worker-owned composition rather than a Worker-shaped decorator;
- JobRunner is a focused internal collaborator;
- canonical outbound envelopes come through one Worker-owned path;
- Worker publishes the only terminal Message consumed by Engine and
  Observability;
- local and remote profiles differ in carrier and host wiring rather than
  Worker implementation;
- transport metadata remains outside Worker; and
- the direct request/return path and alternate Worker identities are gone.
