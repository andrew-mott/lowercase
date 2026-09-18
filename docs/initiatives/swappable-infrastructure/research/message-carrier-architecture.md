# Message Carrier Architecture for Local and Redis-Backed Components

Status: research recommendation, not an implementation plan

Date: 2026-09-05

> **MVP implementation note:** this report describes the mature local and
> Redis-backed destination. The deliberately smaller first local implementation
> is defined by the [In-Process Message Delivery guide](../../../component-architecture/in-process-messaging/README.md)
> and its [project-specific first slice](../../../component-architecture/in-process-messaging/MVP-IMPLEMENTATION.md).
> Those guides preserve this report's protocol, topology, and ownership
> boundaries while explicitly deferring bounded capacity, draining, retry,
> health, fair scheduling, and Redis delivery.

## Executive decision

The desired architecture is possible, and it is a reasonable fit for this
project.

Use the existing CloudEvent-shaped `AnyEvent` values as the application Message
protocol in both deployment forms. Put a small, higher-level Message carrier
abstraction above transport mechanics, with two implementations:

- an in-process, ephemeral carrier built from bounded logical-subscription
  mailboxes; and
- a log-backed carrier that uses `MessageLogPort`, with `RedisMessageLog` as the
  first driver.

The common abstraction should not be a new ambient event bus injected into every
component. Runtime should resolve narrow, typed `MessagePublisher<T>` and
`MessageSubscription<T>` endpoints from a static topology, then give each component
only the endpoints it needs. Components own the interpretation and construction
of their Messages; runtime owns routing, deployment placement, transport
selection, and lifecycle.

For HTTP JSON jobs, use one asynchronous Message conversation:

1. Engine constructs and publishes one `job.httpjson.submitted` Message.
2. The worker role consumes it; worker instances within that role compete.
3. If Worker execution reaches a modeled `JobResult`, Worker constructs one
   canonical `job.httpjson.completed` or `job.httpjson.failed` Message.
4. Worker publishes that terminal Message. An unexpected infrastructure or
   programming exception instead rejects the command delivery without inventing
   a business failure fact.
5. Engine and observability consume the same terminal Message independently.
6. Engine advances the run from that subscription. It does not await a private
   result channel or a transport-backed `Promise`.

This removes the local/remote protocol split, eliminates the pairwise
`integrations` growth problem, and makes observability a normal independent
subscriber. It does cost more machinery than a direct method call: explicit
queues, lifecycle, health, overflow policy, recovery duplicate handling, and
truthful asynchronous handler completion all become part of the design.

`MessageLogPort` is not the common carrier and the in-memory carrier should not
implement it. Its group reads, entry IDs, acknowledgement, provisioning, and
pending recovery are appropriate as lower-level log-driver concepts. The
log-backed carrier and its managed consumer runners hide those details from
components.

## Scope and decisions treated as fixed

This study uses the following decisions as constraints, rather than reopening
them:

- “Message” means the existing `AnyEvent`/CloudEvent-shaped envelope. Existing
  event names and schemas remain unchanged for this work.
- A carrier Message must also be a recursively lossless JSON value. Current
  `unknown` argument/body schema fields are broader than the wire protocol;
  values that JSON would drop, coerce, or fail to encode are rejected before
  either carrier accepts them.
- No command/fact/reply taxonomy, events-to-messages rename, or new coarse
  `kind` field is required now.
- Autonomous component-to-component communication uses Messages whether the
  components share a process or not.
- Passive infrastructure capabilities such as artifact storage, SQL, clocks,
  and ordinary HTTP clients can remain direct ports. They are not forced through
  the carrier.
- Local delivery is ephemeral and in-process. Redis-backed delivery is durable
  only to the degree guaranteed by the configured Redis persistence and
  retention policy. Local need not simulate Redis failure mechanics.
- Runtime statically declares publications, logical subscriptions, and hosted
  subscriber instances.
- Every logical subscriber role receives its own copy. Instances within the
  same logical subscription compete for that subscription's copy.
- A second observability instance joins the same observability subscription; it
  does not create another fanout branch.
- Publish completion means carrier acceptance, not completion of any consumer.
- A subscription acknowledges only after its handler succeeds. One failed
  subscription does not roll back or block delivery already accepted by another
  subscription.
- `maxInFlight` counts handlers that have started and not completed across one
  component instance's shared capacity group. It is not a backlog limit. Engine,
  limiter, and observability start at `1`; worker intake follows actual worker
  execution capacity.
- With one active member, normal new-delivery handling starts FIFO within a
  logical subscription. With competing members, assignment follows log/mailbox
  order but there is no cross-process wall-clock start-order guarantee.
  Recovery/redelivery can reintroduce older work after newer work, concurrent
  completion may be out of order, and there is no global order across routes or
  streams.
- `job.httpjson.completed` or `job.httpjson.failed` is the worker's sole terminal
  protocol answer. There is no second `JobResult` Message, private reply stream,
  per-request consumer group, or pending transport `Promise` in the core design.
- The first migration is the HTTP JSON job vertical slice. Other
  `EventBusPort` traffic remains on the old bus until migrated deliberately.
- There must be one authoritative publication per Message during migration. A
  compatibility path may observe it, but may not independently reconstruct and
  republish the same logical occurrence.

The conclusion intentionally supersedes parts of the earlier research and the
unstarted C9-C11 discussion. Those conflicts are called out explicitly below so
future implementation work does not accidentally combine two incompatible
designs.

## Vocabulary

The terms below keep application protocol separate from transport mechanics.

| Term                      | Meaning                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Message                   | One existing `AnyEvent<T>` value. “Event” remains the code/schema name.                                                                       |
| Publication               | One acceptance of one Message onto a logical route.                                                                                           |
| Route                     | A runtime-owned destination that maps to local routing state or a physical Redis stream.                                                      |
| Logical subscription      | A stable purpose that independently receives every matching publication, such as `engine.http-job-terminal.v1`.                               |
| Subscriber instance       | One running member of a logical subscription, such as one worker process. Instances compete.                                                  |
| Role                      | The component responsibility behind a subscription: worker, engine, observability, limiter, and so on.                                        |
| Handler success           | The component has completed the state transition or work promised by that subscription, including acceptance of immediate resulting Messages. |
| Transport acknowledgement | A carrier-owned consequence of handler success. It is never exposed to component code.                                                        |

Fanout and competition are therefore two levels of one model:

```text
one publication
  ├─ worker.http-job.v1 mailbox/group
  │    ├─ worker instance A  ┐
  │    └─ worker instance B  ┴─ compete
  └─ observability.http-job-commands.v1 mailbox/group
       ├─ observability instance A  ┐
       └─ observability instance B  ┴─ compete
```

Do not put queue-versus-fanout intent on the publisher. The same publication is
work-shared for one role and independently fanned out to another role. That is a
property of subscriptions.

### Inbound/outbound and ingress/egress

The two vocabularies answer different questions and can coexist:

| Vocabulary            | Question answered                                                               | Example                                                              |
| --------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Inbound/outbound port | Which way does the dependency point relative to a component?                    | Worker depends outbound on artifact storage and resource permits.    |
| Ingress/egress        | Is transport traffic literally entering or leaving this process/component host? | A Redis group reader is ingress; a Redis-backed publisher is egress. |

For the proposed Message boundary, prefer capability names in public contracts
(`MessagePublisher`, `MessageSubscription`, `MessageHandler`) and use
`message-boundary/`, `ingress/`, or `egress/` only for concrete organization.
Avoid `MessageSource`: CloudEvents already uses `source` for the producer
identity in an envelope, while this capability is a managed consumer.
The worker's internal `JobCommandExecutor` remains an internal seam, not a public
transport port. A component host binds its Message ingress to that seam and its
terminal Message egress to a narrow publisher.

This follows the useful part of hexagonal architecture without requiring a
pair-specific port for every local relationship. The important dependency rule
is that component code does not import another component or a concrete carrier.

## What exists now

### The envelope type is suitable; its value boundary needs tightening

The repository already has a closed `EventMap`, discriminated `AnyEvent<T>`
unions, scoped envelope fields, and runtime schema validation. `buildEvent()`
constructs and validates an envelope independently from publication, so it is
already the right primitive for “form once, move through either carrier”
([`emit.ts`](../../../../packages/events/src/core/emit.ts)).

Some nested schemas intentionally accept `unknown`, which is wider than a JSON
wire value. Keep the envelope and event taxonomy, but add the strict
lossless-JSON codec check described below at the carrier boundary.

The envelope also already has the right identity hook for duplicate detection:
CloudEvents defines the pair of `source` and `id` as unique for a distinct
occurrence, and permits a duplicate resend to retain that identity
([CloudEvents specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#id)).
That does not itself implement idempotency, but it means a second transport ID
must not replace application Message identity.

### Live `EventBusPort` topology

The current `EventBusPort` is used for several different reasons that should not
all be migrated at once.

| Flow                                                                                    | Current purpose                                                                                  | Classification for migration                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `run.requested` from run use cases to Engine                                            | Real external ingress to Engine; observability also sees it                                      | Genuine component protocol, later slice                                                   |
| `replay.mode.submitted` from Replay to Engine                                           | Real external ingress that changes Engine mode                                                   | Genuine component protocol, later slice                                                   |
| `job.mcp.completed` / `.failed` to Engine                                               | Old worker-result ingress                                                                        | Dormant legacy protocol: subscriptions remain, but no live production publisher was found |
| Engine's `step.planned`, `step.started`, `step.reused`, `step.completed`, `step.failed` | Engine reacts to events it emitted itself                                                        | Internal self-loop; replace with direct internal enqueue rather than carrier migration    |
| Engine's `run.started`, `run.completed`, `run.failed`                                   | Engine reacts to events it emitted itself                                                        | Internal self-loop; same treatment                                                        |
| HTTP `job.httpjson.submitted`                                                           | Observability record only; execution is a separate direct call                                   | Compatibility split that the first slice removes                                          |
| HTTP terminal event                                                                     | Engine constructs it from a direct return, advances internally, then publishes for observability | Wrong ownership/reconstruction split that the first slice removes                         |
| `worker.slot.requested` / `.finished` to Limiter                                        | Intended limiter protocol                                                                        | Dormant: schemas/subscriptions exist, but no live production publisher was found          |
| Component start/stop and limiter decision events                                        | Observation only in current runtime                                                              | Leave on old bus until their owner is migrated                                            |
| Automatic `observability` mirror                                                        | Delivers every non-internal bus event to the tap                                                 | Replace per migrated route with explicit observability subscriptions                      |

Engine owns twelve explicit bus subscriptions: two active external inputs, two
dormant legacy MCP terminal inputs, and eight self-loops
([`engine.ts`](../../../../packages/components/engine/src/engine.ts)). Limiter owns
two currently dormant subscriptions
([`limiter.ts`](../../../../packages/components/limiter/src/limiter.ts)).
`ObservabilityTap` owns the magic `observability` subscription
([`tap.ts`](../../../../packages/components/observability/src/core/tap.ts)). No
other live production component subscribes directly.

The corresponding live publication inventory is:

| Producer               | Publications                                                   | Current recipients/use                                                          |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Run use cases/services | `run.requested`                                                | Engine plus automatic Observability mirror                                      |
| Engine flow effects    | `flow.analyzed`, `.completed`, `.failed`                       | Observability only                                                              |
| Engine run effects     | `run.started`, `.completed`, `.failed`                         | Engine self-loop plus Observability; `run.denied` is observation-only           |
| Engine step effects    | `step.planned`, `.started`, `.reused`, `.completed`, `.failed` | Engine self-loop plus Observability                                             |
| Engine HTTP effects    | submitted/completed/failed                                     | Observability only; direct `JobExecutionPort` separately carries control flow   |
| Engine MCP effect      | `job.mcp.submitted`                                            | Observability only; the former Router/Worker path is gone                       |
| Limiter                | started/stopped/granted/denied                                 | Observability only; no live grant/denial consumer                               |
| Replay                 | replayed events and `replay.mode.submitted`                    | Published as `internal`, so Engine can react without another Observability copy |

Scheduler, system, tool, and worker emitter classes exist, but no live
production caller was found. They are available publication plumbing rather than
current traffic.

That inventory is important: “replace the event bus” is not one mechanical
adapter swap. The HTTP job conversation is a coherent first slice; the Engine
self-loop is an internal design issue; run/replay/MCP/limiter traffic are later
protocol slices; and observation-only lifecycle can migrate independently.

### The old bus has weaker semantics than its Promise types imply

`InMemoryEventBus.publish()` schedules a `queueMicrotask` and resolves before
delivery. Its subscription wrapper calls an async handler without awaiting or
catching the returned promise. It therefore cannot know whether processing
succeeded, cannot provide useful backpressure, and can turn an async rejection
into an unhandled rejection
([`inmemory.event-bus.ts`](../../../../packages/adapters/src/event-bus/inmemory.event-bus.ts)).

It also performs routing policy internally: wildcard expansion and an automatic
copy to the magic `observability` topic. This makes topology implicit rather than
runtime-declared.

Finally, shared-resource ownership is currently inconsistent. Engine and
Observability both close the bus from their own `stop()` methods, while runtime
also wraps and closes the same bus as a managed resource
([`engine.ts`](../../../../packages/components/engine/src/engine.ts),
[`tap.ts`](../../../../packages/components/observability/src/core/tap.ts), and
[`local-system.profile.ts`](../../../../packages/runtime/src/profiles/local-system/local-system.profile.ts)).
The new carrier must have one lifecycle owner: runtime.

### HTTP JSON execution is two protocols today

The planner currently creates one job identity/data set, then emits two effects:

- `EmitJobHttpJsonSubmitted`, which publishes to the bus for observability; and
- `ExecuteHttpJsonJob`, which invokes `JobExecutionPort` directly.

The direct port returns `JobExecutionOutcome`, after which Engine reconstructs a
new terminal `AnyEvent`, feeds it to its reducer, and publishes it to the bus for
observability
([`step-planned.planner.ts`](../../../../packages/components/engine/src/planners/step-planned.planner.ts)
and
[`execute-httpjson-job.effect.ts`](../../../../packages/components/engine/src/effects/execute-httpjson-job.effect.ts)).

Worker's outer wrapper maps the request DTO into `ExecuteJobCommand` and maps
`JobResult` back to the outcome. It publishes nothing
([`message-job-execution.ts`](../../../../packages/components/worker/src/message-job-execution.ts)).
Worker lifecycle is separately translated into a private
`WorkerLifecycleEvent` and currently sent only to a console placeholder
([`worker-lifecycle.events.ts`](../../../../packages/components/worker/src/worker-lifecycle.events.ts)
and
[`create-worker.ts`](../../../../packages/runtime/src/worker/create-worker.ts)).

The direct path works, but it is the source of the local/remote structural split:
control flow uses a return value locally, while remote work would need a command
reader, correlation machinery, and a separate observation route.

It also produces an accidental observation order: Engine applies `JobFinished`
and starts the resulting step effects before publishing the reconstructed job
terminal event. The target intentionally changes the causal acceptance order to
Worker terminal publication → Engine consumption → resulting Engine Messages.
Both new carriers follow that order, while cross-route observation interleaving
remains unspecified.

### Engine and observability cannot yet report truthful handler completion

Two pre-existing behaviors matter once acknowledgement is real:

- Engine's reducer/planner loop calls async effect handlers without awaiting
  them. `handleJobFinished()` can therefore return before resulting step/run
  Messages have been accepted
  ([`engine.ts`](../../../../packages/components/engine/src/engine.ts)).
- `ObservabilityTap` catches and logs every sink failure. Some sinks also return
  before their work is durable: `ReplaySink` discards the promise from
  `recordEvent()`, and `SqlRunProjectionSink` starts a background flush and
  immediately returns
  ([`replay.sink.ts`](../../../../packages/components/observability/src/sinks/replay.sink.ts)
  and
  [`sql-run-projection.sink.ts`](../../../../packages/components/observability/src/sinks/sql-run-projection.sink.ts)).
- `EvalResultProjectionSink` deletes its shadow state before loading/validating
  the score and storing the result, then logs and returns success for query,
  artifact, schema, missing-export, and repository failures. It therefore cannot
  yet be a truthful required sink for the run Messages it handles
  ([`eval-result-projection.sink.ts`](../../../../packages/components/observability/src/sinks/eval-result-projection.sink.ts)).

The always-attached SQL and evaluation projection sinks are also omitted from
the runtime's returned sink map, so they do not participate in managed
start/stop. That ownership gap should be corrected when ingestion becomes a
managed Message consumer.

If a Redis runner acknowledged on those current return values, it could remove a
delivery before the promised work actually succeeded. Truthful async completion
is therefore a first-slice correctness requirement, not optional hardening.

### `MessageLogPort` is implemented but not integrated

`MessageLogPort` currently combines provisioning, append, group read,
acknowledgement, pending claim, and client close. `RedisMessageLog` maps those
methods directly to `XGROUP CREATE`, `XADD`, `XREADGROUP`, `XACK`, and
`XAUTOCLAIM`
([`message-log.port.ts`](../../../../packages/ports/src/message-log/message-log.port.ts)
and
[`redis-message-log.ts`](../../../../packages/adapters/src/message-log/redis-message-log.ts)).

Its real-Redis integration tests establish the primitive group/ack/recovery
behavior, but no production runtime or component uses the port yet. That is a
good point at which to place the higher-level boundary correctly; there is no
installed consumer API to preserve.

### Runtime messaging configuration is still a placeholder

`LocalSystemConfig` requires a `messaging` field, but its only variant is
`{ kind: "direct" }` and `createLocalSystem()` does not read it. The profile
always constructs `InMemoryEventBus`, constructs Worker as an unmanaged direct
dependency of Engine, and starts managed resources in the order bus → optional
sinks → tap → Engine → Limiter
([`local-system.profile.ts`](../../../../packages/runtime/src/profiles/local-system/local-system.profile.ts)).

The new carrier should make this config real without creating one universal
deployment matrix: each explicit profile selects an allowed carrier and declares
only the roles it hosts.

## Architecture options considered

| Option                                                                            | What it gets right                                                                             | Decisive cost                                                                                                                                      | Decision                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Keep direct `JobExecutionPort` locally and add a correlated Redis client remotely | Lowest local overhead and familiar request/return control flow                                 | Two protocols, two observability paths, a pending-call registry, reply routing, and deployment-specific component wiring                           | Reject for autonomous component communication      |
| Make an in-memory implementation of `MessageLogPort`                              | Literal adapter swap at one port                                                               | Forces group IDs, entry IDs, ack, claiming, and retention-shaped behavior into the simple local case                                               | Reject as the product-local carrier                |
| Replace `EventBusPort` with one ambient `MessageCarrier` injected everywhere      | Easy mechanical migration                                                                      | Retains arbitrary topic authority, component-owned topology, magic routing, and shared lifecycle ownership                                         | Use only as a runtime resolver                     |
| Runtime-resolved typed publishers and subscriptions                               | One semantic protocol, static topology, least authority, transport swap hidden from components | Requires a modest binding layer and explicit managed subscriptions                                                                                 | Adopt                                              |
| Separate “queue” and “fanout” publishing APIs                                     | Makes one delivery intent visually explicit                                                    | One job submission is both competing work for Worker and an independent copy for Observability; it would need double publication or another router | Reject; delivery mode belongs to subscriptions     |
| Require every core to return a list of outgoing Message effects                   | Pure and testable                                                                              | A broad rewrite, especially awkward around long-running Worker I/O                                                                                 | Use where already natural, not as a universal rule |

The direct-port approach remains correct for passive infrastructure and for
ordinary calls inside one component boundary. It is rejected here specifically
because job submission/result is the protocol between independently deployable,
autonomous components.

## Recommended high-level shape

```text
                                      runtime only
                           ┌──────────────────────────┐
                           │ MessageCarrier resolver  │
                           └─────────────┬────────────┘
                                         │ resolves from static topology
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
        MessagePublisher<T>                    MessageSubscription<T>
         given to a producer                   bound to a component-owned
                                                    async handler

        InMemoryMessageCarrier
                  or
        LogBackedMessageCarrier ──→ MessageLogPort ──→ RedisMessageLog
```

`MessageCarrier` is a composition-time endpoint resolver. It is not a service
locator passed into Engine, Worker, Limiter, or Observability. A resolved
publisher is bound to one declared publication and cannot choose arbitrary
topics. A resolved subscription is bound to one logical purpose and hides
delivery identity and acknowledgement.

Illustrative interfaces:

```ts
import type { AnyEvent, EventType } from "@lcase/types";

type MessageOf<T extends EventType> = {
  [K in T]: AnyEvent<K>;
}[T];

interface MessagePublisher<T extends EventType> {
  // Resolves when the carrier has accepted the Message, not when handlers end.
  publish(message: MessageOf<T>): Promise<void>;
}

type MessageHandler<T extends EventType> = (
  message: MessageOf<T>,
) => Promise<void>;

interface MessageSubscription<T extends EventType> {
  start(handler: MessageHandler<T>): Promise<void>;
  stopIntake(): Promise<void>;
  // Explicit same-process retry; never an implicit hot loop.
  retryFailed(options?: { limit?: number }): Promise<void>;
  drain(options: { timeoutMs: number }): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<
    { status: "healthy" } | { status: "unhealthy"; reason: string }
  >;
}
```

The mapped `MessageOf<T>` form matters: a union of event type strings remains a
discriminated union of complete envelopes.

Both carriers need the same schema check, but a generic carrier need not import
the global registry directly. Runtime may inject a narrow Message
validator/codec implemented by `@lcase/events`; the important invariant is that
both locally submitted values and Redis-decoded values are validated before a
semantic handler runs. The bound publisher also applies the same configured
maximum encoded Message size before either local fanout or Redis append.

Schema validity alone is not enough today: nested `args`/body fields use
`unknown`, so values such as `{ x: undefined }`, `BigInt`, cycles, non-finite
numbers, sparse arrays, or class instances can validate while JSON drops,
coerces, or rejects them. The shared codec must recursively accept only JSON
primitives, dense arrays, and plain string-keyed objects; numbers must be finite
and not negative zero, and every present property must itself be accepted. It
then verifies an encode/decode round trip preserves the structure. This is a
protocol validation error before acceptance, not a backend difference. Refine
the schemas later, but do not let local delivery accept values Redis would
change.

The static declarations distinguish a publication, a stable logical
subscription, and a running member:

```ts
type Publication<T extends EventType> = {
  id: string;
  types: readonly T[];
};

type LogicalSubscription<T extends EventType> = {
  id: string; // stable across restarts; maps to mailbox or consumer group
  role: string;
  publication: Publication<T>;
};

type SubscriberInstance = {
  id: string; // unique for one running member
  // Subscriptions hosted by one component instance share this capacity budget.
  capacityGroup: string;
  maxInFlight: number;
};

interface MessageCarrier {
  publisher<T extends EventType>(
    publication: Publication<T>,
  ): MessagePublisher<T>;

  subscription<T extends EventType>(
    subscription: LogicalSubscription<T>,
    instance: SubscriberInstance,
  ): MessageSubscription<T>;
}

// Backend-specific runtime control, not given to components.
interface InProcessDrainControl {
  drainAndSeal(options: { timeoutMs: number }): Promise<DrainReport>;
}

type DrainReport =
  | {
      clean: true;
      sealed: true;
      queued: 0;
      inFlight: 0;
      failed: readonly [];
    }
  | {
      clean: false;
      sealed: false;
      queued: number;
      inFlight: number;
      failed: readonly {
        subscriptionId: string;
        deliveryId: string;
        messageId: string;
      }[];
      reason: "failed-deliveries" | "timeout";
    };
```

These are design sketches, not a demand to copy every name literally. The
important constraints are:

- publisher authority is declaration-bound;
- logical subscription identity is stable;
- instance identity is unique per running member;
- `maxInFlight` is the aggregate budget for one `capacityGroup`, shared by all
  subscriptions hosted by that component instance;
- handlers never receive a delivery/ack token;
- runtime alone declares/selects routes and instance IDs, while the carrier sees
  the resolved declarations it must implement; and
- only the carrier/subscription implementation owns delivery acknowledgement.

The first interface intentionally has no transport `AbortSignal`. A forced
shutdown is not an application cancellation: if it interrupts uncertain remote
work, the handler rejects and the command remains unacknowledged. A future
caller-requested cancellation is an explicit Message and a Worker-owned
controller policy, not an accidental consequence of the subscription stopping.

Keep three topology layers distinct:

1. The deployment-wide logical topology declares publications and all intended
   subscription branches. An optional role is omitted here; it is not modeled by
   silently dropping Messages behind a `required` flag.
2. A physical binding plan maps each publication to exactly one local route or
   namespaced Redis stream and each logical subscription to one mailbox/group.
   A deployment provisioner runs the complete Redis plan idempotently before any
   external publisher reports ready.
3. A host binding says which subscriber instances this process actually runs.
   Every host-local binding must be ready before that host's producers start. A
   remote logical subscription may have no live member temporarily, but its
   Redis group already exists and retains its independent position.

Topology compilation must reject duplicate publication/subscription IDs,
unknown references, multiple physical routes for one publication, physical name
collisions, inconsistent limits within one capacity group, and a local
deployment subscription with no hosted member. A logical subscription receives
every type in its referenced publication. Observability that wants everything
declares one subscription per publication; there is no ambiguous deployment-wide
`all` selector.

`retryFailed()` is a runtime/operator control for a delivery retained by the
same live subscription. It never exposes a transport ID to the component and
does not imply automatic retry. For Redis crash recovery by a different member,
the separate pending-claim policy still applies. Retrying uncertain external
work can duplicate it, so the runtime must not invoke this operation blindly. A
successful retry retires/acknowledges only that delivery; the instance returns
healthy only after no retained handler failures or transport faults remain.

The runtime usage should read like this:

```ts
const submitted = carrier.publisher(httpJobSubmittedPublication);
const terminal = carrier.publisher(httpJobTerminalPublication);

const workerInstanceId = runtimeIdentity.newMemberId("worker");
const workerSubscription = carrier.subscription(workerHttpJobsSubscription, {
  id: workerInstanceId,
  capacityGroup: `worker:${workerInstanceId}`,
  maxInFlight: config.worker.maxConcurrentJobs,
});

const engineInstanceId = runtimeIdentity.newMemberId("engine");
const engineSubscription = carrier.subscription(
  engineHttpJobTerminalSubscription,
  {
    id: engineInstanceId,
    capacityGroup: `engine:${engineInstanceId}`,
    maxInFlight: 1,
  },
);

const workerHandler = createHttpJobMessageHandler({
  worker: commandWorker,
  terminal,
});

await workerSubscription.start(workerHandler);
await engineSubscription.start((message) =>
  engine.handleHttpJobTerminal(message),
);
```

`runtimeIdentity` is illustrative new host infrastructure, not an existing
Worker/Engine config field. It should combine a useful role/host label with a
fresh boot UUID so two live processes never share a Redis consumer member name.
The stable recovery identity is the logical subscription/group; a restarted
member deliberately gets a new instance ID.

There is no object whose job is to integrate Engine with Worker. Runtime wires a
producer to a publication, and separately wires each role's subscription to that
role's handler. Adding Observability or Limiter adds another logical
subscription, not another pairwise bridge.

For example, if Limiter later needs job terminal Messages to release global
capacity, runtime adds a `limiter.http-job-terminal.v1` subscription. Worker does
not gain a Limiter adapter and the carrier does not gain Limiter logic. Likewise,
the Worker boundary needs no generic state bridge between ingress and egress: its
one async handler invokes the core and uses its injected terminal publisher.
Correlation lives in Message identity plus the owning Engine's run/job state.

### Component host responsibility

A component-owned boundary handler is the unit that turns a Message into core
work and core output back into a Message. For Worker:

```ts
function createHttpJobMessageHandler(deps: {
  worker: JobCommandExecutor;
  terminal: MessagePublisher<"job.httpjson.completed" | "job.httpjson.failed">;
}): MessageHandler<"job.httpjson.submitted">;
```

Its success path is:

```text
validate canonical submitted Message
→ translate to ExecuteJobCommand
→ execute Worker core
├─ modeled JobResult
│  → construct canonical terminal Message once
│  → await terminal publication acceptance
│  → resolve handler
│  → carrier acknowledges submitted delivery
└─ unexpected thrown/rejected dependency
   → reject handler; publish no terminal; leave remote command pending
```

This handler belongs with Worker because Worker owns how a job submission is
interpreted and how its outcome is described. It knows nothing about Engine,
Observability, Redis stream names, consumer groups, or local mailboxes.

Engine similarly owns a terminal handler, and Observability owns a general
Message ingestion handler. Runtime binds them; carrier code does not import
components.

### Why `maxInFlight: 1` does not mean “one whole run at a time”

For Engine, it means only that one Engine-wide inbox handler mutates Engine state
at a time. The same capacity group must cover the new terminal subscription and
the still-live EventBus ingress/self-loop adapters during migration; otherwise
two transport paths can race the same reducer state. The handler may publish
several new job submissions quickly, and many jobs can remain outstanding while
Engine later consumes their terminal Messages serially.

For Worker, it corresponds directly to how many job handlers may be executing.
Set it to `maxConcurrentJobs`; retain the existing semaphore as a defensive core
invariant, but do not prefetch a large Redis batch merely to wait behind that
semaphore. For Limiter and Observability, start at `1` across all subscriptions
hosted by that component instance until their state and sink behavior justify
concurrency.

## In-process carrier

The local carrier should model the agreed application semantics, not Redis
commands. Its central structure is one mailbox per logical subscription and a
set of competing instances under that mailbox.

```ts
type Mailbox = {
  queued: Delivery[];
  queuedBytes: number;
  inFlight: Map<string, Delivery>;
  failed: Map<string, FailedDelivery>;
  instances: Map<
    string,
    {
      handler: MessageHandler<EventType>;
      capacityGroup: string;
      state: "healthy" | "unhealthy" | "stopped";
    }
  >;
  state: "stopped" | "running" | "draining" | "unhealthy";
  nextInstance: number;
};

type CapacityGroup = {
  maxInFlight: number;
  inFlight: number;
};
```

### Publication algorithm

1. Reject if the carrier is stopping or stopped.
2. Check that the bound publication permits `message.type`.
3. Validate the full envelope through the existing schema registry and the
   strict lossless-JSON codec.
4. Encode one canonical snapshot, verify its round trip, and reject it if it
   exceeds the profile's maximum serialized Message size.
5. Resolve every matching logical subscription from compiled static topology.
6. Check count and byte capacity for every destination before mutating any
   mailbox.
7. Enqueue an independently decoded,
   deeply immutable Message in every matching mailbox.
8. Schedule dispatch in a microtask to prevent reentrant component execution.
9. Resolve `publish()` without waiting for a handler.

Capacity must be checked atomically across subscriptions. If one destination
cannot accept, enqueue nowhere and reject with a typed error naming the
subscription. Partial fanout followed by a publisher retry would create obscure
duplicates.

A shallow `Object.freeze()` is insufficient because nested `data` and extension
fields can still be mutated by one role and observed by another. After strict
lossless-JSON validation, the in-process carrier should use the same injected
codec to snapshot the Message and decode once per logical subscription, then
recursively freeze it. Local and Redis deliveries preserve the accepted
structure and application identity without sharing mutable object references.

### Dispatch and competition

Dispatch is coordinated by a fair carrier-level arbiter, not by independent
mailbox loops. In particular, a busy command mailbox cannot reacquire a shared
Observability/Engine capacity lane forever while another subscription waits.
For each available lane:

1. Choose the next ready logical mailbox for that capacity group, round-robin
   across subscriptions.
2. Shift its oldest queued delivery and choose the next healthy competing member
   with a free lane, round-robin within that mailbox.
3. Move the delivery to the mailbox's `inFlight` map and increment the capacity
   group's `inFlight` count.
4. Invoke its handler asynchronously.
5. On resolution, retire it from the in-flight map, decrement the
   capacity-group count, and schedule more work.
6. Assign queued deliveries in FIFO order. With one member this also gives FIFO
   handler starts; with multiple concurrent members, do not expose a global
   wall-clock start-order guarantee.

Mailbox selection, member selection, and the move to `inFlight` are one atomic
reservation, so two capacity-group arbiters cannot assign the same competing
delivery.

Registering a second instance under the same logical subscription increases
competing capacity; it does not duplicate delivery. Registering a new logical
subscription creates a new fanout branch.

### Failure and overflow

On handler rejection, the first local version should:

- move every failed in-flight delivery into a diagnostic map keyed by delivery
  ID and release its lane;
- mark the assigned subscriber instance unhealthy across all subscriptions it
  hosts;
- let its already-running handlers settle;
- let other healthy instances in the same logical subscription continue
  competing, without automatically reassigning the failed delivery;
- keep every other logical subscription and instance running;
- perform no automatic local retry or reassignment; and
- if a matching logical subscription has no healthy member, reject later
  publications immediately, atomically before enqueueing to any branch.

Automatic claiming and redelivery would simulate broker mechanics without
providing broker durability. `retryFailed()` permits controlled same-process
retry after the cause is addressed; replacing/restarting the whole profile loses
the ephemeral backlog. Publications for subscriptions with a healthy member and
for unrelated routes continue, while deliveries already accepted by healthy
roles are not cancelled. This matches Redis failure granularity: one failing
runner/host becomes unhealthy, but other consumer-group members keep competing.

Bound each logical-subscription backlog by both count and encoded bytes. `256`
Messages is a reasonable initial count default, but count alone is not a memory
bound because HTTP bodies vary in size. The profile must also set a maximum
serialized Message size and mailbox byte budget, derived from the API's request
limit and measured workload rather than an arbitrary hidden default. This is
separate from `maxInFlight`: queued Messages have not started; in-flight
Messages have. A capacity group is shared across every subscription hosted by
the same component instance. Thus Observability with command and lifecycle
subscriptions at `maxInFlight: 1` receives no concurrent handler calls; the
order selected across those routes remains nondeterministic.

When a mailbox reaches either bound, fail the next publication immediately,
enqueue it nowhere, mark carrier health unhealthy, and report subscription ID,
count/byte capacity, Message `source`/`id`, type, and encoded size. Reject an
oversized individual Message before fanout. Never silently drop the oldest or
newest Message.

There is an unavoidable tradeoff here: lossless fanout, bounded memory, and
permanent isolation from a failed subscriber cannot all be guaranteed at once.
With this policy, a failed Observability instance does not stop Engine or Worker
from finishing already-accepted deliveries, and another healthy Observability
instance can continue the role. If none remains, new fanout publications that
require that logical subscription reject immediately. If the desired policy later
becomes “Observability must never exert backpressure,” that subscription must
either be best-effort/drop-capable or use durable storage locally. Hiding this
tradeoff in an unbounded array would only postpone it until an out-of-memory
crash.

### Local lifecycle

Startup:

```text
construct and validate topology
→ construct carrier
→ attach all configured subscriber instances
→ initialize component cores and install all legacy/internal handlers
→ start Message subscriptions and verify readiness
→ emit component lifecycle Messages
→ start external producers
```

Shutdown:

```text
stop external producers/intake
→ keep publishers available to in-flight handlers
→ let ordinary work reach quiescence while every subscription still dispatches
→ run component before-stop/final-lifecycle hooks; await publication acceptance
→ call carrier.drainAndSeal() to drain those causal Messages and atomically
  reject every later publication
→ stop subscriptions
→ dispose component hosts/sinks
→ close carrier last
```

Stopping or draining subscriptions sequentially can break a causal chain: a
Worker handler may need to publish a terminal Message to an Engine subscription
that was already stopped. Coordinate quiescence across the whole local carrier,
allow handler-caused and final lifecycle publications, and wait for a stable
empty graph. `drainAndSeal()` must observe the graph and transition publication
state under the same carrier lock/generation mechanism, so a racing publication
is either included in the drain or rejected; sequential endpoint calls cannot
provide that boundary. “Empty” means queued, in-flight, and retained-failed
counts are all zero. If failed deliveries exist, return `clean: false` immediately
with their subscription/delivery/Message IDs and leave the carrier unsealed so
an operator can repair and call `retryFailed()` before trying the drain again. A
timeout likewise reports all three counts and stays unsealed. A separate forced
stop may abandon ephemeral Messages, but must preserve the non-clean report and
never describe that shutdown as drained.

Current component `stop()` methods that publish `.stopped` and close the shared
bus must be split: a before-stop hook publishes while ingress is alive, and a
later disposal hook releases only component-owned resources without publishing
or closing a shared carrier.

The existing `ManagedResource`/`createManagedRuntime` machinery already provides
ordered startup, reverse stop, rollback, and health aggregation
([`managed-resource.ts`](../../../../packages/runtime/src/assembly/managed-resource.ts)
and
[`managed-runtime.ts`](../../../../packages/runtime/src/assembly/managed-runtime.ts)).
The carrier and each active subscription should become real managed resources rather
than relying on always-healthy default wrappers.

## Redis/log-backed carrier

The Redis implementation has two layers:

```text
component Message handler/publisher
              │
              ▼
LogBackedMessageCarrier + managed subscription runner
  - resolves logical route to physical log
  - binds logical subscription to group and instance to consumer name
  - shares and enforces each component instance's maxInFlight budget
  - validates Messages
  - acks only after handler success
  - owns pending recovery and health
              │
              ▼
MessageLogPort capability views
              │
              ▼
RedisMessageLog / node-redis
```

Redis documents exactly the delivery relationship required here: members inside
one consumer group share the stream's entries, while multiple consumer groups
read the same stream independently. Successfully processed entries require an
explicit acknowledgement and unacknowledged entries remain in a pending entries
list for recovery
([Redis Streams overview](https://redis.io/docs/latest/develop/use-cases/streaming/)
and
[`XREADGROUP` documentation](https://redis.io/docs/latest/commands/xreadgroup/)).

Those mechanics implement the logical model; they are not themselves the
component protocol.

### `MessageLogPort` belongs below the common abstraction

The current port is too Redis/log-shaped for the normal in-process carrier, but
it is not “too heavy” in the layer where it belongs. Its methods should be
reassessed as follows:

| Current method                                | Correct owner                   | Recommendation                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publish(stream, message)`                    | Data-plane writer               | Keep the append capability, but move Message JSON/schema decoding to the carrier and let this lower view carry a serialized payload. Return a transport position for diagnostics, never as application identity. |
| `readGroup(stream, group, consumer, options)` | Bound group-consumer session    | Keep the capability, but bind stream/group/consumer once when constructing a subscription. Add cancellation or use finite blocking reads for managed shutdown.                                                   |
| `ack(stream, group, ids)`                     | Bound group-consumer session    | Keep below the runner. Return the acknowledged count so a mismatch is observable. Components never call it.                                                                                                      |
| `claimPending(...)`                           | Bound group-consumer recovery   | Keep, but return the continuation cursor, claimed entries, and IDs whose payload was deleted. The current implementation always starts at `0` and discards that information.                                     |
| `ensureConsumerGroup(...)`                    | Topology provisioner            | Move to an administrative capability. `startAt` applies only on first creation; validate existing topology rather than assuming a repeated call moved its cursor.                                                |
| `ensureStream(...)`                           | Topology provisioner            | Remove or reimplement without the fake `__ensure_stream__` consumer group. A real `XGROUP CREATE ... MKSTREAM` can create the command/lifecycle streams required here.                                           |
| `close()`                                     | Redis provider/managed resource | Remove from the semantic port. The current adapter quits an injected client, which becomes unsafe once multiple writers/readers share a provider.                                                                |

A low-churn split is:

```ts
type MessageLogEntry = {
  id: string;
  // Undefined represents a record whose expected payload field is absent.
  // Malformed JSON remains a raw string so diagnostics retain both it and id.
  payload: string | undefined;
};

interface MessageLogWriter {
  append(log: string, payload: string): Promise<string>;
}

interface MessageLogGroupSession {
  readNew(options: ReadGroupOptions): Promise<MessageLogEntry[]>;
  acknowledge(ids: readonly string[]): Promise<number>;
  reclaim(
    cursor: string,
    options: ClaimPendingOptions,
  ): Promise<{
    nextCursor: string;
    entries: readonly MessageLogEntry[];
    deletedIds: readonly string[];
  }>;
}

interface MessageLogProvisioner {
  ensureLog(definition: LogDefinition): Promise<void>;
  ensureGroup(definition: GroupDefinition): Promise<void>;
}

interface MessageLogProvider {
  writer(): MessageLogWriter; // shared writer capability; provider owns client
  provisioner(): MessageLogProvisioner; // shared administrative capability
  openGroupSession(binding: {
    log: string;
    group: string;
    member: string;
  }): Promise<{
    session: MessageLogGroupSession;
    release(): Promise<void>; // provider closes only this lease's connection
  }>;
  close(): Promise<void>; // closes shared writer/admin clients last
}
```

One passive Redis command-adapter class may initially implement several of these
capability views for one injected client, while consumers receive only the
narrow view they need. The provider can construct that class over distinct
connections; splitting interfaces does not require three unrelated concrete
implementations.

The managed provider/session factory is the ownership seam missing from the
current port. Runtime opens one group-session lease—and therefore one dedicated
blocking-read connection—for each hosted `(log, group, member)` binding. A
runner releases only its lease; the provider closes that connection and later
closes shared writer/administrative clients after every runner stops. To
preserve the repository's passive-adapter rule, client construction and lease
ownership belong in runtime hosting while `RedisMessageLog` remains a passive
capability over an injected client.

The lower entry must preserve transport ID even when its payload is malformed.
The current adapter performs `JSON.parse(...) as AnyEvent` inside `readGroup()`;
one malformed entry therefore rejects the entire batch before the carrier can
identify or quarantine the offending delivery. Move JSON encode/decode into the
log-backed carrier's injected Message codec, and have the driver return raw
payload (or a structured decode failure containing entry ID). The carrier then
validates the decoded value against the existing schema registry before invoking
a semantic handler.

This is not an attempt to build a reusable arbitrary-byte broker API. It is a
small honesty boundary: the log driver knows records and transport IDs; the
Message carrier knows `AnyEvent`, JSON encoding, schemas, and poison policy. It
also makes malformed-JSON tests possible without throwing away the entry ID
needed for operator action.

The comment that every durable broker fits this exact port should be softened.
Consumer groups, idle-time claiming, and pending entries define a useful
grouped-log capability, but Kafka, JetStream, RabbitMQ Streams, and Redis do not
have identical recovery and provisioning semantics. This initiative only needs
to prove the Redis driver.

### Minimal first-slice physical topology

Use two job-specific streams for the skeleton:

```text
<namespace>.lowercase.job.httpjson.commands.v1
  worker.httpjson-jobs.v1
    worker-<unique-instance>             # members compete
  observability.httpjson-commands.v1
    observability-<unique-instance>      # members compete

<namespace>.lowercase.job.httpjson.lifecycle.v1
  engine.httpjson-terminal.v1
    engine-<unique-instance>             # one member in v1
  observability.httpjson-lifecycle.v1
    observability-<unique-instance>      # members compete
```

`<namespace>` is a required configured deployment/tenant boundary (for example,
`dev.alice`, `test.ci-42`, or `prod`). It is part of the physical Redis key, not
the application Message, and prevents development, test, and production hosts
that share Redis from consuming one another's traffic. The remaining names are
stable logical examples, not globally sufficient literal keys.

Each indented stable name is a Redis consumer group; the final name is a running
consumer member. The same command is stored once but independently delivered to
Worker and Observability. The same terminal fact is stored once but independently
delivered to Engine and Observability.

“Commands” and “lifecycle” here are physical route responsibilities, not new
fields in the Message schema. `job.httpjson.submitted` keeps its current name and
shape; runtime knows that this type belongs on the job-command publication.

Job-specific streams are preferable to a single global command stream initially.
Redis consumer groups do not server-filter an arbitrary event union. Putting
unrelated acting consumers on one physical stream would make each group read and
discard all other command families, wasting work and making an accidental ack
dangerous. Logical routes leave room to consolidate or split physical topology
later without changing components.

Provision every configured group from the beginning (`0`) for the first deployment and
make provisioning idempotent. A group created at “latest” after producers have
started would skip already-published work. Existing group position must
not be silently rewritten by ordinary boot.

Use unbounded retention for the proof slice unless an explicit, tested retention
policy is supplied. `XACK` removes an entry from a group's pending list; it does
not delete the stream record, and trimming can remove a payload another group
still needs. “Redis-backed” also does not automatically mean durable history:
Redis persistence, replication, backups, and retention are deployment policy.

### Managed consumer runner

Each resolved log-backed `MessageSubscription` is driven by a managed consumer
runner and a group session. Runners hosted for one component instance share its
capacity group. A steady-state loop should:

1. Compute `available = capacityGroup.maxInFlight - capacityGroup.active`.
2. Never start a handler when `available` is zero.
3. Call `readNew` only under the host scheduler's bounded read allowance, with
   `COUNT <= available` in the ordinary case and at most one read-ahead delivery
   per subscription when blocking reads must overlap. Never bulk-fill the
   pending list with work that will merely wait in local memory or behind
   Worker's semaphore.
4. Decode and validate each full Message.
5. Invoke handlers concurrently only within the available capacity.
6. Acknowledge an entry only after its own handler resolves.
7. On handler rejection, record the error, leave the entry pending, mark this
   runner/component instance unhealthy, and avoid a hot retry loop. Other live
   members of the consumer group continue competing for other entries.
8. Expect redelivery if handling succeeds but acknowledgement fails.

The shared limit must be enforced by one fair host-level scheduler/semaphore,
not by separate runners each reading `active` and racing to claim the same last
lane. Validate at topology compilation that every subscription naming one
`capacityGroup` declares the same limit. A runner may hold at most one bounded
read-ahead delivery while waiting for the shared gate; alternatively, a single
host scheduler can arbitrate reads. The gate covers handler starts, while small
per-route read-ahead prevents one quiet/blocked stream from reserving the only
lane and starving another.

Use a dedicated Redis connection for each blocking read loop, with separate
writer/administrative connections or pools. One blocked `XREADGROUP` must not
delay terminal publication or acknowledgement. A finite `blockMs` is the simple
first shutdown mechanism; an abortable read session is better if the chosen
client supports it cleanly.

Pending recovery must be capacity-aware and cursor-driven. The current
`claimPending()` always passes a start cursor of `0` and drops the next cursor;
with a count limit it cannot reliably walk a large pending list. Redis returns a
continuation cursor from `XAUTOCLAIM`, including `0-0` when a scan reaches the
end
([`XAUTOCLAIM` documentation](https://redis.io/docs/latest/commands/xautoclaim/)).

Long-running commands require special caution. An entry becomes “idle” while its
handler may still be legitimately executing; claiming it too soon causes two
workers to perform the job concurrently. For the first version:

- do not run aggressive periodic reclaim for job commands;
- require an explicit `commandRecoveryIdleMs` longer than the complete bounded
  job-execution deadline, not merely the HTTP protocol timeout;
- reclaim only while the new member's shared capacity group has a free lane; and
- retain the existing Worker capacity gate as a last defense.

If complete job duration cannot yet be bounded honestly, disable automatic
command reclaim and expose pending work operationally rather than choosing a
dangerously short timeout. Lifecycle consumers may use a separate shorter
recovery policy only after their handlers are short, completion-aware, and
idempotent.

Runner startup:

```text
connect owned clients
→ provision/validate physical stream and stable group
→ bind unique member identity
→ recover eligible stale pending entries within capacity only when the
  configured automatic or operator-authorized policy permits it
→ start bounded new-read loop
→ report ready
```

Runner shutdown:

```text
report not-ready
→ stop issuing reads and claims
→ wake/finish blocking read
→ drain handlers to deadline
→ ack only known successes
→ leave uncertain work pending
→ stop runner and release its owned group-session/read-connection lease
→ provider closes its owned clients last
```

### Delivery guarantee and duplicate window

The Redis machinery is at-least-once-capable, not exactly-once. It provides an
at-least-once processing attempt only when pending work is eventually reclaimed
under a safe automatic policy or an operator explicitly confirms the old owner
is dead and requests recovery:

```text
execute external job
→ publish terminal Message
→ acknowledge submitted command
```

If automatic command reclaim is disabled because total execution time is not
bounded, a crash leaves retained pending work visible for manual recovery; it is
not unattended at-least-once delivery. If the process crashes after terminal
publication but before command acknowledgement, a recovery can execute the
command again. If it crashes after the external HTTP effect but before terminal
publication, that external effect may also repeat. Redis acknowledgement cannot
solve either gap by itself.

The first version should be explicit about this and add idempotence where it is
immediately required:

- Engine must record the active `jobid` for a step and ignore a duplicate or
  stale terminal Message instead of advancing twice.
- A duplicate resend of the same terminal occurrence should preserve its
  CloudEvent `source` + `id`; transport entry IDs are never dedupe keys.
- Stable identity is only a hook for idempotency, not idempotency itself. The
  first Worker has no durable command ledger, so automatically retrying an
  uncertain command `XADD` can execute the external job twice even when both
  entries contain the same Message ID.
- A reclaimed and re-executed command may construct a new terminal occurrence
  with a new `id` for the same `jobid`. Engine's job guard must handle that, and
  Observability projections must tolerate both duplicate Message identity and
  multiple terminal occurrences for one job. Deterministic terminal identity or
  a durable outbox can tighten this later.
- A later durable execution ledger/outbox is needed before promising that
  arbitrary external HTTP side effects execute only once.

Current Engine state has no active-job identity, and `jobFinishedReducer`
selects only `runid`/`stepid`. A duplicate terminal can plan another
`step.completed`/`.failed`, and duplicate step completion can decrement run
accounting again
([`job-finished.reducer.ts`](../../../../packages/components/engine/src/reducers/job-finished.reducer.ts)
and
[`step-finished.reducer.ts`](../../../../packages/components/engine/src/reducers/step-finished.reducer.ts)).
This guard must land with, not after, Redis delivery.

### Engine-replica constraint

One stable Engine group is safe today only with one Engine member. Engine's run
state is in process, so two Engine instances competing in one group could route a
terminal Message to an instance that does not own that run. Do not solve this
with per-request groups or reply streams. Keep one Engine instance in the first
remote profile; before scaling it, move run coordination to durable shared state
so any Engine member can continue any run, or introduce an explicit ownership
partitioning design.

The same limitation applies to an Engine restart: Redis can retain a terminal
Message, but the restarted Engine cannot safely apply it after losing the
corresponding in-memory run state. The first remote version can prove Worker
restart recovery; it must not claim Engine crash recovery until Engine state is
durable or reconstructable.

## Common semantics, different mechanics

The two carriers share a deliberately small behavioral contract:

| Concern                  | Common guarantee                                                                                                                                             | In-process mechanism                                                                               | Redis mechanism                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Message                  | The same schema-valid, lossless-JSON `AnyEvent` content and application identity                                                                             | Per-subscription immutable codec snapshot                                                          | The same codec output in one stream entry                                                                          |
| Publish completion       | Carrier accepted the Message; no handler wait                                                                                                                | Atomic enqueue to matching mailboxes                                                               | Successful `XADD`                                                                                                  |
| Fanout                   | Every logical subscription gets an independent delivery                                                                                                      | One enqueue per logical mailbox                                                                    | One consumer group per logical subscription                                                                        |
| Competition              | One member of a logical subscription handles a delivery                                                                                                      | Shared mailbox and member scheduler                                                                | Consumers within one group                                                                                         |
| Capacity                 | Started, unfinished handlers never exceed a component instance's aggregate `maxInFlight` across its subscriptions                                            | Shared capacity-group lane count                                                                   | Shared host gate; each read `COUNT` is bounded by currently available lanes                                        |
| Dispatch order           | Normal new-delivery handling starts FIFO with one member; competing members have ordered assignment but no global start-time guarantee; recovery may reorder | Mailbox assignment order                                                                           | Stream/group assignment order plus later pending recovery                                                          |
| Completion order         | May differ when concurrency is greater than one                                                                                                              | Concurrent promises                                                                                | Concurrent handlers                                                                                                |
| Handler success          | Delivery may be retired                                                                                                                                      | Remove from mailbox                                                                                | `XACK`                                                                                                             |
| Handler failure          | Never silently treated as success; disable the failing instance while other members/roles continue                                                           | Retain every failed delivery; reject new matching publications only when no healthy member remains | Leave pending and mark that runner unhealthy; other group members continue; recover by policy                      |
| Offline/restart recovery | No common guarantee                                                                                                                                          | Lost on process exit                                                                               | Retained subject to persistence/retention/group position; processing resumes only under an enabled recovery policy |

This is the right level of symmetry. Implementing a pending entries list,
consumer claims, or Redis entry IDs in memory would create surface resemblance,
not useful correctness. Conversely, bypassing a local mailbox with direct
invocation would discard the fanout, failure, and lifecycle semantics that the
components now depend on.

## HTTP JSON job vertical slice

### Current flow

```text
Engine planner
  ├─ build/publish submitted representation ── EventBus ──→ Observability
  └─ build flattened request ── direct JobExecutionPort ──→ Worker
                                                        │
                                                        └─ JobExecutionOutcome
                                                                  │
Engine reconstructs terminal AnyEvent, advances state first ─────┘
  └─ publishes reconstructed terminal ── EventBus ──→ Observability
```

### Target flow

```text
Engine builds one job.httpjson.submitted Message
  └─ publish once to http-job-commands
       ├─ Worker subscription (instances compete)
       │    └─ execute core
       │         └─ Worker builds one completed/failed Message
       │              └─ publish once to http-job-lifecycle
       │                   ├─ Engine terminal subscription
       │                   │    └─ update state and accept resulting Messages
       │                   └─ Observability lifecycle subscription
       └─ Observability command subscription
```

The target does not include a separate correlated reply. `jobid`, `runid`, and
`stepid` already correlate the terminal Message. A future API facade may await a
terminal Message by `jobid` for convenience, but that facade must observe the
canonical lifecycle publication; it must not create a second protocol answer.

### Ownership by stage

#### Engine submission

Engine should construct one literal `AnyEvent<"job.httpjson.submitted">` with
`buildEvent()` and publish it through a bound
`MessagePublisher<"job.httpjson.submitted">`.

The existing pair of `EmitJobHttpJsonSubmitted` and `ExecuteHttpJsonJob` effects
becomes one publish effect. The old bus publication and direct
`JobExecutionPort.execute()` call disappear together for this type. Engine does
not know whether its publisher is local or log-backed.

#### Worker ingress and terminal egress

Worker's component-adjacent handler receives the canonical submitted envelope
and maps it into `ExecuteJobCommand`. Reuse the current mapper's logic, not its
request type unchanged: today's `JobExecutionRequest` uses `traceId` while the
envelope carries `traceid`, and the new boundary must deliberately choose the
attempt `executionId` (initially `jobid` is sufficient). It then invokes the
existing transport-free `JobCommandExecutor` and current
capacity/resource-permit layers.

After `JobResult`, the handler builds the canonical terminal event once, with
Worker as `source` and the submitted Message as trace/correlation origin. It maps
the existing result into the unchanged current schemas:

- completed: `status: "success"`, output hash, and export hashes;
- failed: `status: "failure"`, optional output hash, and message.

It then awaits terminal publication acceptance. Only after that may the command
subscription consider its handler successful and acknowledge the submitted
delivery.

Do not catch every thrown value and convert it to `job.httpjson.failed`. The
existing explicit `JobResult` failure variants—including timeout, cancellation,
input/protocol/output failures—are modeled terminal outcomes and do publish the
failed Message. An unexpected dependency/programming exception means execution
did not reach a trustworthy modeled result: publish no terminal, reject the
handler, retain the Redis command, and mark that Worker instance unhealthy.

The private `WorkerLifecycleEvent` terminal representation and console-only sink
should not remain as a second authoritative fact. They can be retired when this
boundary lands. Internal execution hooks may remain if they are explicitly
telemetry rather than another component protocol.

`job.httpjson.started` already exists in the schema but has no live production
publisher today. Adding it is not required to prove this slice and should not be
smuggled into the migration. It can later be another Worker-owned Message on the
lifecycle route.

#### Engine terminal ingress

Engine's new subscription accepts only
`job.httpjson.completed | job.httpjson.failed` and feeds the existing
`JobFinished` reducer/planner path. It must first validate that:

- the run and step exist;
- the Message `jobid` is the active job for that step or matches its recognized
  already-terminal attempt; and
- any processing record for that job says whether effect obligations are still
  in progress or complete.

A duplicate terminal may have the same Message identity after a transport retry
or a new identity after command re-execution. If the recognized job's earlier
terminal processing record is complete, record it diagnostically and return
success without planning effects again. A terminal for a structurally invalid
or unknown run/step/job combination should fail the handler and remain pending
remotely;
the current reducer actually dereferences a missing run before its guard and
throws, while a missing step is silently ignored. Neither accidental behavior is
a sufficient delivery policy.

The handler may resolve only after the state transition and its immediate
resulting effects have completed to their own acceptance boundaries. Therefore
Engine needs one awaitable serialized inbox/effect loop used by every stateful
ingress during the transition: the new terminal subscription, `run.requested`,
replay/MCP callbacks that remain live, and legacy self-loop adapters. Serializing
only the new subscription would still let an EventBus callback race the same
state. The current `processAll(): void` plus fire-and-forget `handler(effect)` is
insufficient.

Do not implement this as “mutate state, try effects, then treat terminal state as
dedupe.” If an effect rejects after mutation, redelivery would see terminal
state, skip the missing effect, and incorrectly acknowledge the input. The
minimum safe non-durable boundary is an Engine processing record keyed by the
ingress Message identity and `jobid`:

1. Serialize the transition and capture its complete immediate effect list,
   assigning stable effect/Message identities once.
2. Record which effects reach their acceptance boundary.
3. If one fails, retain the in-progress record and reject the handler.
4. On redelivery, resume only outstanding effects; terminal state alone is not a
   completion marker.
5. Mark the processing record complete only after every required acceptance;
   only then may a duplicate return success immediately.

The Engine inbox—not transport redelivery—is the owner of this record and the
ability to resume it. That matters because `run.requested` and Engine self-loop
callbacks still arrive through the fire-and-forget EventBus during this slice.
On effect failure, pause further Engine state transitions, mark host health
unhealthy, and retain the record. A controlled `retryIncomplete()` host
operation resumes outstanding effects after the dependency is repaired;
ack-backed redelivery may invoke the same path but is not its only trigger. Once
the record completes, `MessageSubscription.retryFailed()` can re-enter and
acknowledge a retained Redis terminal without repeating effects. Without that
explicit recovery action, the Engine is fail-stopped rather than silently
progressing.

Recovery remains effect-aware. A definitive pre-acceptance failure may be
retried; an uncertain Redis command append must stay paused until an operator or
future idempotent append mechanism determines whether it landed, because a blind
retry can execute the job twice.

This record and recovery control may remain in memory for the first slice
because Engine restart is already explicitly unsupported. It closes the
ordinary same-process failure hole for both old-bus and carrier ingress without
pretending to be a durable transactional outbox. “Effect acceptance” means
enqueue/publication acceptance, not waiting for a downstream Engine self-loop
to run, so the single inbox cannot deadlock on itself. This remains incremental
and does not require replacing the reducer/planner model.

#### Observability ingress

Refactor the tap into a bus-independent ingestion core, conceptually:

```ts
interface ObserveMessage {
  handle(message: AnyEvent): Promise<void>;
}
```

Two temporary ingress adapters can call it:

- the legacy `EventBusPort` observability subscription for unmigrated types; and
- new Message subscriptions for HTTP job commands and lifecycle.

The migrated HTTP types publish only through the new carrier, so the two
ingresses remain type-exclusive and cannot double-record them. Observability
receives the canonical submitted and terminal envelope content and application
identity emitted by the acting components, not independently reconstructed
events. Local delivery may use an immutable clone; JavaScript reference identity
is not part of the protocol.

Give sinks explicit policy:

- configured durable projections/recorders are required and their returned
  promises must mean the work was accepted at the documented persistence
  boundary;
- console and WebSocket presentation sinks may be best-effort; and
- failure of a required sink rejects the observability handler, leaves only its
  Redis group pending, and marks only that subscription/runtime role unhealthy.

Partial sink success makes idempotency mandatory. If required sink A succeeds
and required sink B rejects, redelivery will invoke the ingestion path again.
The proportionate first rule is that every required sink be idempotent on
CloudEvent `source` + `id`; a sink that cannot enforce that in its own storage
must use a durable per-sink receipt written atomically with its effect, or be
classified best-effort. An in-memory “seen” set is insufficient for Redis
redelivery after process restart. This avoids building a central observability
outbox while still defining partial completion honestly.

`EvalResultProjectionSink` is irrelevant to the three HTTP job types and may
return an immediate no-op for them. For the run types it does handle, classify it
as a required projection: retain shadow state until its repository write
succeeds, distinguish an intentional “not an eval run” no-op from missing/failed
score production, and propagate required query/artifact/schema/repository
failures. That hardening must precede migration of those run types; otherwise
the profile must explicitly label the sink best-effort instead of claiming
durable observability.

All Observability subscriptions for one host share a capacity group, so sinks
receive no concurrent calls with observability `maxInFlight: 1`. Each route is
FIFO with one member, but the serialized order selected across command and
lifecycle routes is not predetermined. The temporary legacy EventBus ingress
must enter the same Observability-wide gate as the new subscriptions; otherwise
old and new paths can still race SQL/Eval shadow state. Because the old bus does
not await callbacks, failures on that compatibility path affect managed health
but cannot acquire Redis-style acknowledgement semantics. `ReplaySink` must not
merely return today's `recordEvent()` promise: `JsonlEventLog` currently treats
the boolean from `writeStream.write()` as if it were completion, does not wait
for the write callback/`drain`, and does not surface later stream errors. Define
and implement its actual acceptance boundary (and fsync if “durable on disk” is
claimed), plus `source`+`id` idempotency. SQL projection must expose completion
of the flush it promises and make reapplication idempotent. Catching an error
for logging is fine only if the handler rethrows when the failed sink is
required.

Because command and lifecycle use separate streams/subscriptions, Observability
may receive a terminal before the corresponding submitted Message under
scheduling or recovery. That is within the accepted “no global order” rule.
Preserve identity and timestamps so projections can correlate; do not add a
cross-stream merge coordinator in the first version.

The acknowledgement boundaries for the conversation are consequently:

| Logical subscription            | Handler success means                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Worker command                  | Execution reached a terminal result and the canonical terminal Message was accepted by its carrier.                         |
| Engine terminal                 | The active matching job transitioned once and immediate resulting Messages/effects reached their own acceptance boundaries. |
| Observability command/lifecycle | Every configured required sink accepted the Message at its documented persistence boundary.                                 |

Each row is independent. Worker does not wait for either terminal subscriber,
and Engine does not wait for Observability.

### Transition rule

Switch all three HTTP types as one atomic protocol slice:

- `job.httpjson.submitted`
- `job.httpjson.completed`
- `job.httpjson.failed`

Do not dual-publish any of them to the old bus. Do not keep the direct return as
an alternate way for Engine to advance. During development a feature branch may
contain both implementations, but one profile invocation must select one
authoritative path for the whole three-type conversation.

All other bus traffic stays unchanged. In particular, do not expand this slice
to Engine's run/step self-loop, replay mode, MCP, or the dormant Limiter protocol.

## Runtime composition and lifecycle

The same logical bindings should be assembled against either carrier:

```text
compile HTTP job topology
→ build in-memory OR log-backed MessageCarrier
→ resolve typed publishers and subscriptions
→ create component-owned handlers
→ bind handlers to subscriptions
→ register carrier/subscriptions/hosts in managed runtime
```

Placement is independent. An embedded profile hosts Engine, Worker, and perhaps
Observability in one process. A remote profile can construct the same logical
endpoints in separate Engine, Worker, and Observability processes. Only the
hosted subscription instances and physical carrier provider differ; component
code does not gain `local`/`redis` branches.

For Redis processes, a shared topology manifest gives all roles the same stable
stream/group names. A deployment preflight must provision the complete manifest
before opening external publication; it may be a dedicated step or an
idempotent full-manifest step run by every host. Each process then validates the
bindings it uses before reporting ready. A publisher does not synchronously
check that remote consumers are live or healthy; health federation is a later
operational feature.

The managed start order is:

```text
providers/carrier
→ topology provisioning
→ required observability sinks and ingestion core
→ initialize component cores and install legacy/internal handlers
→ bind and start Message subscriptions; verify readiness
→ emit component lifecycle Messages
→ external API/CLI intake
```

The readiness split is intentional. Current `Engine.start()` emits lifecycle
work and only then installs some EventBus subscriptions; that ordering must be
refactored before retained terminal Messages can be admitted. Initialization
must make every handler/state dependency ready without producing work. Only
after all ingress is ready may lifecycle emission or external production begin.

`stopIntake()`, `drain()`, and `stop()` are separate operations:

- `stopIntake()` prevents that subscription from starting another transport
  delivery; unread Redis work remains in the group/log;
- `drain()` waits only for handlers already admitted and does not itself change
  intake state; and
- `stop()` releases the stopped subscription's resources after drain or a
  reported timeout.

An embedded in-memory profile can provide the stronger causal drain the user
expects because runtime owns every producer and subscription. Its reverse
shutdown is:

```text
stop external intake
→ drain ordinary local work while all subscriptions remain active
→ run component before-stop/final-lifecycle publication hooks
→ carrier.drainAndSeal() reaches a fixed point and atomically seals publication
→ stop subscriptions and dispose component hosts
→ required sinks flush
→ carrier/provider connections close
```

A Redis process cannot infer global cluster quiescence: another host may still
publish. It stops its local external producers, quiesces and drains the
subscriptions appropriate to that hosted role, runs component final-lifecycle
hooks while publishers remain alive, then stops remaining local intake and
drains admitted handlers. If a co-hosted Observability subscription is meant to
record the final lifecycle Message, stop it last; otherwise the Message remains
in its provisioned Redis group for another member/restart. Unread and uncertain
work stays retained.
Dependency-aware deployments may stage role shutdown, but the first version
must not claim a distributed causal drain. The current reverse-ordered
`ManagedResource` hooks need an explicit runtime drain phase for these semantics;
do not overload `stop()` with three contradictory meanings.

Components must detach their own legacy bus subscriptions while that bus exists,
but must never close the shared bus or new carrier. Runtime is the sole owner of
shared transport lifecycle.

## Suggested package structure

This tree is an endpoint, not a requirement to move every existing core file in
the first Change:

```text
packages/
  ports/
    src/
      messaging/
        message-publisher.port.ts
        message-subscription.port.ts
        message-carrier.port.ts
        message-topology.types.ts
      message-log/
        message-log.port.ts                 # lower grouped-log capabilities

  adapters/
    src/
      message-log/
        redis-message-log.ts                # concrete Redis driver

  components/
    worker/
      src/
        message-boundary/
          httpjson-submitted.handler.ts
          httpjson-terminal.factory.ts
        job.contracts.ts                    # internal core vocabulary remains
        worker.ts
        worker-capacity.ts

    engine/
      src/
        message-boundary/
          httpjson-submitted.publisher.ts
          httpjson-terminal.handler.ts
        ...                                 # reducer/planner/effect core

    observability/
      src/
        core/
          message-ingestor.ts
        ingress/
          event-bus-observability.ingress.ts
          message-observability.ingress.ts

  runtime/
    src/
      messaging/
        carrier/
          in-memory-message-carrier.ts
          subscription-mailbox.ts
          log-backed-message-carrier.ts
          message-log-subscription-runner.ts
          redis-message-log-provider.ts
        http-job.topology.ts
        build-message-carrier.ts
        bind-http-job-hosts.ts
      profiles/
        local-system/
        engine-process/                     # when separately deployable
        worker-process/
        observability-process/
```

This satisfies the preference that component-specific adapter/mapping code live
next to the component. The passive Redis driver remains in `packages/adapters`;
managed dispatch loops, health, and lifecycle live with runtime hosting and
composition. There is no shared `integrations` package and no file named after
two components.

That placement deliberately honors
[`0005-package-tier-taxonomy.md`](../../../adr/0005-package-tier-taxonomy.md),
which says an adapter implements one port, owns no lifecycle, and is not
self-driven. A consumer loop is therefore not an adapter under the repository's
current vocabulary. If managed carriers later need reuse outside runtime,
introduce a dedicated messaging-host package and amend the ADR explicitly;
silently putting a long-lived runner under `adapters/` would contradict the
current package model.

Dependency direction:

```text
types
  ↑
ports
  ↑
adapters      events      components
       \         |         /
                runtime
```

- `ports` may type-import `types`.
- passive adapters import ports/types, never components; runtime carrier hosts
  may compose passive adapters and component-bound handlers.
- components may import ports/types/events, never concrete carriers or runtime.
- component core/protocol/domain files do not import Message transport types.
- component `message-boundary/` may import `AnyEvent`, `buildEvent()`, and narrow
  publisher/handler contracts.
- runtime alone declares/selects physical routes, topology, carrier selection,
  component placement, subscription IDs, and instance IDs; carrier
  implementations necessarily receive the declarations they execute.
- no component imports another component.

Worker's current architecture test bans `AnyEvent` in every source file. Narrow
that rule to core/protocol/domain directories and explicitly allow
`message-boundary/`. Moving the boundary to a new pairwise package merely to keep
the text scan unchanged would preserve the wrong invariant.

## Migration sequence

This is sequencing guidance, not a Change-by-Change implementation plan.

### 1. Establish and test the carrier contract

- Add the narrow messaging contracts and shared logical topology declarations.
- Implement the in-memory carrier.
- Implement `LogBackedMessageCarrier` and its managed runner over the existing
  Redis driver.
- Refine `MessageLogPort` capability ownership, pending cursor, acknowledgement
  result, and client lifecycle as part of that work.
- Run one common contract suite against both carriers for the semantics they
  genuinely share, plus backend-specific suites for failure mechanics.

Do this before modifying Engine/Worker control flow. It makes the behavior being
migrated to executable rather than aspirational.

### 2. Make consumer completion truthful

- Give Observability a bus-independent async ingestion method.
- Make required Replay/SQL sinks report actual acceptance/failure and be
  idempotent by Message identity. Harden the JSONL store's real write/error
  boundary rather than merely returning its current promise. Define and harden
  Eval projection completion for its relevant run types before those types
  migrate (or label it best-effort explicitly).
- Give Engine an awaitable, serialized external-message processing boundary.
- Add active `jobid` and terminal dedupe/staleness checks.
- Make subscription/handler failures visible through managed health.

These are prerequisites for meaningful acknowledgement in either carrier, not a
broad architecture cleanup.

### 3. Add component-owned HTTP Message boundaries

- Engine owns canonical submitted-Message construction and a narrow publisher.
- Worker owns submitted-Message interpretation and canonical terminal-Message
  construction/publication.
- Engine owns canonical terminal-Message interpretation.
- Observability consumes both HTTP routes under its own subscriptions.

Keep `ExecuteJobCommand`, `JobResult`, protocol executors, CAS, resource permits,
and Worker capacity internal and unchanged where possible.

### 4. Cut over the HTTP conversation atomically

In one coherent cutover:

- replace the two Engine HTTP effects with one Message publication;
- activate Worker command and Engine terminal subscriptions;
- remove old-bus publication of the three migrated types;
- remove direct HTTP execution from Engine; and
- retire `JobExecutionPort` request/outcome and the outer direct wrapper once no
  caller remains.

The local-system profile should use the in-memory carrier at this point. A Redis
profile may temporarily host Engine and Worker in one process to exercise the
real transport, but the binding is still Message-based and is ready to split by
process without component changes.

### 5. Prove separate Redis roles

- Run an Engine/API host without Worker core.
- Run a Worker host without Engine.
- Use artifact content and metadata storage reachable by both processes. The
  current per-process filesystem plus SQLite combination is not a valid
  remote-machine proof because Worker must resolve input references and publish
  output references that Engine can later use.
- Keep full Observability co-located with the Engine while unmigrated run/step
  traffic still exists only on that process's EventBus. A separate
  Observability host in this slice is explicitly an HTTP-job-only proof and will
  have partial records until the other Message families migrate.
- Verify command backlog, terminal progression, independent acknowledgement,
  bounded intake, health, and shutdown against real Redis. Scope restart proof
  to abandoned Worker commands under an enabled safe or explicit manual
  recovery policy; verify that Engine restart is rejected/reported as
  unsupported while its run state is in memory.

Only after that proof should other EventBus message families be selected one at
a time. Engine self-loop removal should be its own internal refactor, not a Redis
migration.

## Verification strategy

### Shared carrier contract tests

Run the same behavioral suite against in-memory and Redis-backed factories:

- one accepted publication preserves the exact envelope fields and identity;
- nested `undefined`, `BigInt`, cycles, non-finite/negative-zero numbers, sparse
  arrays, and non-plain objects reject before either backend accepts a branch;
- two logical subscriptions each receive it once;
- two members in one logical subscription divide work rather than duplicate it;
- a second Observability member competes instead of creating a second branch;
- `publish()` resolves after acceptance while a deliberately blocked handler is
  still running;
- an oversized serialized Message rejects before any fanout branch accepts it;
- handler starts across all subscriptions in one capacity group never exceed
  that component instance's `maxInFlight`;
- normal new messages start FIFO with one member; multi-member tests assert
  ordered assignment and exactly one initial owner per delivery rather than
  wall-clock start order; recovery tests explicitly permit older pending work to
  reappear after newer deliveries;
- concurrent completion may reorder without losing a delivery;
- one role's handler failure does not cancel a delivery already accepted and
  running in another role;
- a successful handler is retired/acked, while a failed handler is not; and
- shutdown stops new delivery and reports whether drain met its deadline.

The common suite must not pretend local crash recovery equals Redis recovery.

### In-memory-specific tests

- publication fanout is atomic across mailboxes;
- count or byte overflow enqueues nowhere and reports the full subscription
  context;
- a failed instance retains each failed delivery and stops receiving work while
  healthy competing members continue; publications reject only if a required
  logical subscription has no healthy member;
- multiple simultaneous rejections retain every failed delivery rather than
  overwriting one diagnostic slot;
- busy subscriptions sharing one capacity group cannot starve a quieter one;
- no automatic retry occurs;
- registering members under one stable subscription produces competition; and
- `drainAndSeal()` refuses a clean/sealed result while failed deliveries remain,
  then succeeds after an explicit successful retry; and
- forced shutdown reports abandoned queued/in-flight/failed Messages.

### Real-Redis tests

Keep unit fakes for scheduling and runner state, but use a real Redis instance for
the properties that mocks would merely assume:

- two consumers in one group divide entries;
- two groups each receive the same entry;
- `beginning` versus `latest` on first creation, plus idempotent reprovisioning;
- handler success acknowledges and handler/terminal-publication failure remains
  pending;
- a restarted runner with a new member identity recovers eligible abandoned
  Worker work only when a safe automatic threshold is enabled or recovery is
  explicitly operator-authorized;
- more pending entries than one reclaim count are all reached by cursor
  pagination;
- deleted/trimmed pending payload IDs are surfaced;
- `maxInFlight` remains bounded under large read batches and slow handlers;
- two subscriptions sharing one capacity group cannot race past its aggregate
  limit and neither quiet route permanently reserves the only lane;
- a legitimately long-running job is not claimed by another live Worker;
- a blocking reader connection does not stall writer/ack operations;
- disconnect/reconnect during read, terminal publish, and ack updates health
  honestly;
- malformed JSON and schema-invalid envelopes follow the poison policy;
- graceful stop wakes reads, drains successes, and leaves uncertain entries
  pending; and
- command publication → Worker execution → terminal publication → command ack is
  exercised with a crash injected at each boundary.

The existing suite already provides useful seeds for provisioning, round-trip,
ack, and basic claim behavior
([`redis-message-log.integration.test.ts`](../../../../packages/adapters/tests/message-log/redis-message-log.integration.test.ts)).

### Vertical-slice parity tests

Run the same HTTP job scenario through both carrier profiles and assert:

- the worker receives the same canonical submitted envelope (deep-equal across
  serialization, not necessarily the same JavaScript object reference);
- Observability receives that same envelope identity and content;
- Worker is the sole constructor/source of the terminal Message;
- Engine and Observability receive the same terminal Message identity/content;
- Engine reaches the same final run/step state;
- `maxInFlight` settings are respected;
- duplicate terminal delivery does not advance twice;
- a failed Observability subscription does not prevent Engine from consuming its
  independent terminal copy;
- after one required sink succeeds and a later sink fails, redelivery completes
  the missing work without duplicating the first sink's durable effect; and
- JSONL acceptance waits for its documented write boundary and propagates stream
  errors/backpressure rather than treating `write()`'s boolean as completion.

Compare semantic order per route and per job, not total interleaving across the
two routes. Timing and Redis entry IDs are intentionally backend-specific.

### Architecture checks

Add static tests or lint rules that enforce:

- topology compilation rejects duplicate IDs/routes/names, inconsistent
  capacity groups, and a local subscription with no hosted member;
- Redis deployment preflight provisions every namespaced group before an
  external publisher becomes ready;
- carrier implementations do not import components;
- component cores do not import Redis, runtime, or delivery/ack types;
- component Message-boundary code may import `AnyEvent` and narrow messaging
  ports;
- runtime is the only layer that names physical streams/groups and selects a
  carrier;
- no component closes a shared carrier; and
- there are no engine-worker, worker-observability, or worker-limiter pairwise
  integration modules.

## Risks and explicit first-version dispositions

| Risk                                                      | First-version disposition                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate job execution after a crash                     | Call the design at-least-once-capable; claim unattended at-least-once only with a safe enabled recovery policy. Add downstream terminal idempotence now and defer a durable execution ledger/outbox.                                                                                                                                            |
| Duplicate/stale terminal advances Engine twice            | Track active `jobid` plus completed ingress processing; ignore a terminal only after its effect obligations completed.                                                                                                                                                                                                                          |
| Handler return is not real completion                     | Make Engine effects and required Observability sinks awaitable before ack-backed consumption.                                                                                                                                                                                                                                                   |
| Engine effect fails after old-bus ingress                 | The Engine-owned processing record, not transport redelivery, retains outstanding effects. Fail-stop the Engine and expose controlled same-process `retryIncomplete()` recovery.                                                                                                                                                                |
| A slow local subscriber grows memory                      | Bound every logical mailbox by count and bytes; fail publication atomically and expose unhealthy state. A failed instance stops; new publication rejects only if that logical subscription has no healthy member.                                                                                                                               |
| Local shutdown discards retained handler failures         | Include failed deliveries in `DrainReport`; return non-clean and remain unsealed until explicit retry succeeds or the operator chooses a visibly forced stop.                                                                                                                                                                                   |
| Worker reads more than it can run                         | Set read count from available `maxInFlight`; keep the Worker semaphore as defense.                                                                                                                                                                                                                                                              |
| Premature `XAUTOCLAIM` duplicates a live long job         | No aggressive reclaim; require a complete-duration-safe threshold or disable automatic command reclaim.                                                                                                                                                                                                                                         |
| Poison Message remains pending forever                    | Validate at ingress, mark unhealthy, expose it operationally; design quarantine/DLQ when real operations require it. Never ack silently.                                                                                                                                                                                                        |
| Stream trimming removes work a group still needs          | Start unbounded; add retention only with group-lag and pending tests.                                                                                                                                                                                                                                                                           |
| Redis append succeeds but client times out                | A retry creates another stream entry. Do not automatically retry an uncertain command append in v1: surface it for operator resolution, or explicitly accept possible double execution until Worker has consumer-side dedupe/idempotency. A terminal retry preserves the same envelope identity and relies on Engine/Observability idempotency. |
| Multiple Engine replicas split in-memory run ownership    | One Engine member in v1; durable/partitioned Engine state before scaling.                                                                                                                                                                                                                                                                       |
| Engine restarts after losing run state                    | Do not promise Engine recovery in v1; retain/report terminal work until state can be restored or rebuilt.                                                                                                                                                                                                                                       |
| Different command/lifecycle streams reorder Observability | Accepted; correlate by IDs/timestamps. Do not promise global order.                                                                                                                                                                                                                                                                             |
| HTTP submission contains headers/body or other secrets    | Treat Redis and Observability as real disclosure surfaces: use ACL/TLS, restrict stream access, and review/redact credentials before remote deployment.                                                                                                                                                                                         |
| Large HTTP bodies inflate local or Redis memory           | Enforce a maximum encoded Message size in the common carrier and count-plus-byte local mailbox budgets; retain CAS references where already available. Tie limits to the API contract and measured payloads.                                                                                                                                    |
| Schema-valid `unknown` data changes during JSON encoding  | Add one strict recursive lossless-JSON codec check before acceptance in both carriers; reject unsupported values instead of giving local and Redis different Messages.                                                                                                                                                                          |
| Cancellation is not a transport signal                    | The initial handler intentionally has no subscription `AbortSignal`. Forced shutdown leaves uncertain work unacknowledged; a later caller cancellation is an explicit Message and Worker-owned controller policy.                                                                                                                               |
| Current failed-event schema drops error code/retryability | Keep schema unchanged for this slice; record as a later schema/taxonomy decision before automated retry/cancel behavior depends on it.                                                                                                                                                                                                          |
| Redis subscription cannot stop a blocked read             | Use finite blocking or an abortable dedicated connection and test shutdown.                                                                                                                                                                                                                                                                     |
| Component emits `.stopped` after subscriptions close      | Split before-stop lifecycle publication from disposal; publish and drain final lifecycle Messages before `drainAndSeal()` closes the boundary.                                                                                                                                                                                                  |

## Documentation supersession ledger

If this recommendation is accepted, implementation must not follow the current
unstarted plan verbatim.

### Swappable-infrastructure Initiative and Arc

The current unstarted entries in
[`INITIATIVE.md`](../INITIATIVE.md) and
[`queue-adapter.md`](../arcs/queue-adapter.md) assume:

- C9 makes `JobExecutionPort.execute()` accept and return literal events;
- C10 adds a Worker Redis host plus an Engine correlated client; and
- C11 selects a direct or Redis `jobExecution` binding.

This study replaces those assumptions with a carrier-level local/log-backed
choice and no RPC-shaped terminal return. Replan those unstarted Changes after
the architecture is accepted. Preserve merged C4-C8 discussion as history, with
a short supersession note rather than rewriting what was true when it landed.

### Component architecture model and Worker V2

[`model.md`](../../../component-architecture/model.md) and
[`worker-v2/README.md`](../../../component-architecture/worker-v2/README.md)
contain valuable core/host, capacity, idempotency, and dependency-direction
reasoning. Their direct-local/correlated-remote job-binding conclusion is
superseded for autonomous components. Their “prefer direct calls” rule remains
correct for internal self-loops and ordinary infrastructure ports.

The model's formal command/reply/fact taxonomy is also not a prerequisite here.
Current dotted event types remain unchanged and are treated as Messages by their
role in this protocol.

### Earlier research

Keep the following as point-in-time research, but add clear forward references if
they continue to guide implementation:

- [`runtime-composition-strategies.md`](./runtime-composition-strategies.md)
  correctly recommends explicit profiles and managed lifecycle, but recommends
  direct local component binding.
- [`runtime-composition-follow-up.md`](./runtime-composition-follow-up.md)
  correctly separates topology, routes, groups, and members, but recommends a
  private correlated result stream and direct local publication sinks.
- [`integration-architecture-revision.md`](./integration-architecture-revision.md)
  correctly rejects pairwise integration-package growth, but retains direct job
  invocation and a correlated remote result.
- [`app-services-components-boundary.md`](../../../component-architecture/research/app-services-components-boundary.md)
  recommends the superseded direct-local/two-port shape and still links to a
  deleted integration adapter. Preserve its boundary analysis as history, but
  do not use those paths or its transport conclusion for this migration.
- [`worker-tools-artifacts/INITIATIVE.md`](../../worker-tools-artifacts/INITIATIVE.md)
  contains useful observability-gap evidence, but its direct per-component
  `LifecycleEventIngress` sink recommendation is superseded by independent
  Message subscriptions under this decision.

### General architecture guidance

`CLAUDE.md`, `docs/architecture.md`, and older ADR descriptions still mention
the deleted Router/Queue path and describe every component as a self-driven bus
subscriber. They are already factually stale. Correct them in a documentation
pass after the HTTP architecture is implemented; do not expand this research
file into a retroactive rewrite of historical ADRs.

One specific contradiction should not survive: one part of the Queue Adapter Arc
describes the old EventBus as synchronous, while its own later inventory and the
implementation show microtask-deferred, fire-and-forget behavior.

## Non-goals for the first slice

- Retiring all of `EventBusPort`.
- Renaming events to Messages in code or changing current event schemas.
- Introducing a command/fact/reply taxonomy or a new `kind` field.
- Migrating Engine's internal run/step self-loop to Redis.
- Migrating MCP or the dormant Limiter protocol.
- Priority queues, worker capability routing, or multiple Worker classes.
- Multiple active Engine replicas.
- Exactly-once external HTTP effects.
- A comprehensive Redis retention/DLQ policy.
- Cross-process cancellation.
- Global ordering across physical streams.
- Federated health checks between separate deployments.

## Benefits and costs

### Benefits

- Local and remote deployments use one real component protocol.
- The exact Messages that drive behavior are the ones Observability records.
- Runtime combinations grow by roles/endpoints, not component pairs.
- Worker scale-out maps naturally to competing members.
- Observability and Engine fail/ack independently.
- Backpressure and handler completion become explicit and testable.
- Components remain free of Redis, consumer groups, delivery IDs, and deployment
  branching.
- `MessageLogPort` remains useful without dictating the local design.

### Costs

- Local operation gains asynchronous scheduling, queues, overflow policy, and
  lifecycle that a direct function call did not need.
- Error propagation moves from a direct call stack into subscription health and
  correlated diagnostic context.
- At-least-once-capable Redis recovery requires idempotent handling and accepts
  a duplicate-execution window until durable dedupe exists; with default-disabled
  automatic command reclaim, pending crash work needs explicit recovery.
- Truthful acknowledgement exposes existing Engine and Observability
  fire-and-forget behavior that now needs repair.
- Two physical streams do not provide one total observed order.
- The migration is larger than the currently written C9-C11 sequence.

Those costs are real, but they directly buy the property this project now values:
component topology can change without changing the protocol or inventing local
pairwise wiring for every new relationship.

## Recommended initial defaults

| Setting                                                 | Initial choice                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Engine host capacity-group `maxInFlight`                | `1` across old and new ingress                                                                       |
| Observability host capacity-group `maxInFlight`         | `1` across old and new ingress                                                                       |
| Limiter host capacity-group `maxInFlight` when migrated | `1`                                                                                                  |
| Worker host capacity-group `maxInFlight`                | `worker.maxConcurrentJobs`                                                                           |
| Local mailbox capacity                                  | `256` Messages plus a mandatory profile-configured encoded-byte budget per logical subscription      |
| Maximum Message size                                    | Mandatory profile setting derived from the API/body limit; reject before fanout/append               |
| Local handler retry                                     | No automatic retry; explicit runtime `retryFailed()` after the cause is addressed                    |
| Redis group initial position                            | Beginning for every configured first-deployment group                                                |
| Redis stream retention                                  | Unbounded for the proof slice                                                                        |
| Job-command reclaim                                     | Disabled unless a safe complete-job idle bound is configured                                         |
| Persistent Observability sinks                          | Required only after truthful, idempotent acceptance is implemented; otherwise explicitly best-effort |
| Console/WebSocket sinks                                 | Best-effort                                                                                          |
| Engine replicas                                         | One                                                                                                  |
| Worker instances in the proof profile                   | One (topology permits competing members later)                                                       |
| Observability instances in the proof profile            | Zero or one, according to the profile                                                                |

## Final answer

Do not choose between “simulate Redis locally” and “keep direct local calls.”
There is a third, cleaner layer boundary:

- Messages are the component protocol.
- Typed publishers, subscriptions, and handlers are the common semantic ports.
- The in-memory carrier implements those semantics with role mailboxes.
- The log-backed carrier implements them with consumer runners over
  `MessageLogPort`.
- Redis groups/acks/claims stay below that boundary.
- Runtime declares the graph and owns lifecycle.
- Component-adjacent boundaries own translation, with no pairwise integration
  package.

That architecture is more deliberate than conventional direct local hexagonal
wiring, but it is justified by this project's actual goal: the same independently
deployable components, observability fanout, and worker competition must work in
one process and across Redis without becoming two systems.
