# In-Process Message Delivery

Status: active architecture guide; the C9 mailbox foundation is implemented,
and the first component slice remains proposed.

This document defines the deliberately small in-process Message router and
mailbox that lowercase is building first. C9 landed the inert foundation; the
first live component slice is still proposed. This is the durable guide to the
local architecture and its growth path, not a claim that every capability
described here already exists.

## Read this with

- [`MVP-IMPLEMENTATION.md`](./MVP-IMPLEMENTATION.md) applies this design to the
  repository's current Engine, Worker, Observability, EventBus, and runtime
  wiring.
- [Message Carrier Architecture](../../initiatives/swappable-infrastructure/research/message-carrier-architecture.md)
  describes the more complete local and Redis-backed destination. This guide
  intentionally chooses a much smaller first implementation.
- [Component Architecture Draft](../model.md) supplies the broader component,
  host, port, and adapter vocabulary.
- [Worker Component Architecture](../worker/README.md) defines the current
  Worker root, collaborator, and Message-boundary design.
- [Worker Migration](../worker/MIGRATION.md) sequences the structural runway
  before the first live Message cutover.
- [ADR-0005](../../adr/0005-package-tier-taxonomy.md) defines the repository's
  package tiers and dependency direction.

## Executive decision

Build a runtime-owned, statically configured in-process router with one private,
asynchronous FIFO mailbox per logical subscription.

Use the existing CloudEvent-shaped `AnyEvent` values as Messages. A component
publishes through a narrow, declaration-bound `MessagePublisher`; a component
receives through an async `MessageHandler`. Components never import the router,
mailboxes, runtime, or one another.

The central semantic rule is:

> A sender may await infrastructure admission, but it never awaits recipient
> processing.

For the MVP, admission means that every configured destination mailbox accepted
an independent Message snapshot into process memory. Because the mailboxes are
unbounded, admission normally completes immediately. Each destination then
processes its own queue independently.

This is not an in-memory simulation of Redis Streams. It has no durability,
consumer groups, acknowledgement, pending-entry recovery, retention, or Redis
delivery guarantee. Local and Redis deployments should eventually share the
Message protocol and component boundaries while honestly retaining different
infrastructure guarantees.

## Three separate concerns

Do not conflate protocol, topology, and delivery mechanics:

| Concern  | MVP decision                                                   |
| -------- | -------------------------------------------------------------- |
| Protocol | Existing CloudEvent-shaped Messages                            |
| Topology | Static publications and logical subscriptions owned by runtime |
| Delivery | One ephemeral FIFO mailbox per logical subscription            |

The mailbox is not what prevents pairwise component wiring. Static runtime
topology does that. The mailbox adds a real asynchronous boundary so publishing
a Message does not become an awaited method call on its recipient.

This separation leaves a stable growth path:

```text
MVP local:       publisher -> router -> mailbox -> handler
Later local:     publisher -> richer in-process carrier -> handler
Later remote:    publisher -> log-backed carrier -> Redis -> handler runner
```

The component-facing ends remain the same even if the delivery implementation
is substantially rewritten.

## Vocabulary

### Message

The existing `AnyEvent<T>` value: a CloudEvent-shaped envelope containing its
type, identity, source, time, trace context, scope, and typed data.

“Message” names its role as the protocol between components. This work does not
rename the current event schemas or reorganize them into command, fact, reply,
or telemetry taxonomies.

### Publication

A runtime declaration with a stable ID and a fixed set of Message types that a
producer is allowed to publish. A bound publisher cannot choose an arbitrary
topic string.

Example publications for the first use case:

```text
http-job-command.v1  -> job.httpjson.submitted
http-job-terminal.v1 -> job.httpjson.completed | job.httpjson.failed
```

### Logical subscription

A stable, runtime-declared delivery purpose attached to one publication. Each
logical subscription receives its own copy of every Message on that
publication.

Examples:

```text
worker.http-job-command.v1
observability.http-job-command.v1
engine.http-job-terminal.v1
observability.http-job-terminal.v1
```

These IDs name durable topology, not one process boot or one handler instance.
They can later map to local mailbox identities or Redis consumer-group
identities.

### Bound publisher

The only messaging dependency a producer receives. It is bound to one declared
publication and therefore cannot route to arbitrary infrastructure destinations.

### Message handler

An async component-owned boundary that interprets one accepted Message. It may
translate the envelope into the component's internal vocabulary, invoke core
behavior, and publish resulting Messages.

Its returned Promise is the truth boundary for that delivery: it resolves only
after the component-owned work it claims to perform has finished and every
immediate resulting Message has reached its own publication-acceptance boundary.
It does not await processing by those downstream recipients. A handler must not
launch an authoritative publication as an untracked `void` Promise.

### Mailbox

A runtime-private FIFO queue and serial processing loop for one logical
subscription. It is an implementation detail, never a component port.

### Router

The runtime-private object that resolves a bound publication to its complete
static set of logical-subscription mailboxes. It owns no business routing rules;
runtime topology supplies them.

## Stable component-facing contracts

The exact filenames may be adjusted during implementation, but the public
surface should remain this small:

```ts
import type { AnyEvent, EventType } from "@lcase/types";

export type MessageOf<T extends EventType> = {
  [K in T]: AnyEvent<K>;
}[T];

export interface MessagePublisher<T extends EventType> {
  publish(message: MessageOf<T>): Promise<void>;
}

export type MessageHandler<T extends EventType> = (
  message: MessageOf<T>,
) => Promise<void>;
```

The mapped `MessageOf<T>` form preserves the relationship between each event
type and its complete envelope when `T` is a union.

An authoritative `publish()` call must be awaited by its caller or attached to
an explicitly owned task whose rejection is observed. The mailbox decouples
recipient processing; it does not make admission failure safe to ignore.

Components should not receive a `MessageCarrier`, generic router, subscription
registry, or mailbox. Runtime resolves and binds those pieces during composition,
then injects only the publisher or handler relationship each component needs.

## Runtime-owned topology

Retain the stable topology nouns from the larger carrier design without taking
on its lifecycle and scheduling machinery. Conceptually, runtime needs only:

```ts
type Publication<Types extends readonly EventType[] = readonly EventType[]> = {
  id: string;
  types: Types;
};

type LogicalSubscription<
  Types extends readonly EventType[] = readonly EventType[],
> = {
  id: string;
  publication: Publication<Types>;
};

type MessageBinding<Types extends readonly EventType[] = readonly EventType[]> =
  {
    subscription: LogicalSubscription<Types>;
    handler: MessageHandler<Types[number]>;
    maxInFlight?: number;
  };
```

The tuple is authoritative and its union is derived as
`Types[number]`. Runtime's `definePublication()` preserves that tuple;
`definePublicationFor<Union>()` additionally checks that an independently
defined union is listed completely. Do not annotate a publication as
`types: readonly T[]`: that proves only that every listed value belongs to `T`,
not that the list contains every member of `T`.

The declaration types may live beside the messaging ports so a later carrier
can share them, but runtime alone owns their values. They are not APIs for
dynamic component subscription. The concrete design may combine declarations
and bindings in a builder as long as topology is complete and validated before
external intake begins.

Topology construction should reject:

- duplicate publication IDs;
- duplicate logical-subscription IDs;
- a subscription that references an unknown publication;
- a locally usable publication with no logical subscriptions;
- a local subscription without exactly one bound handler;
- and a publisher request for an undeclared publication.

At publication time, a bound publisher rejects a Message whose type is not
allowed by its declaration before any destination receives it.

There are no wildcard subscriptions in the MVP. Observability is an explicit
logical subscription on every publication it needs to see.

## Exact MVP semantics

### Static topology

Runtime creates publications, subscriptions, publishers, and handler bindings
during assembly. Components cannot add routes at runtime. All handlers are bound
and topology has been validated before application services can introduce work.

Static topology is how the design avoids an ambient EventBus-style service
locator while still preventing pairwise integration packages.

### Independent fanout

One publication may have multiple logical subscriptions. Publishing one Message
enqueues one independent delivery for each subscription:

```text
job.httpjson.completed
  -> engine.http-job-terminal.v1 mailbox
  -> observability.http-job-terminal.v1 mailbox
```

Those subscriptions do not compete. A later second Worker instance under the
same Worker subscription would compete, but competing members are not part of
the MVP.

### Publication acceptance

`publish()` means:

> Every configured destination mailbox accepted its copy into process memory.

It does not mean that a handler started, completed, or succeeded.

The MVP publication algorithm is:

1. Verify that the Message type belongs to the bound publication.
2. Resolve the complete destination set from static topology.
3. Prepare an independent immutable snapshot for every destination.
4. If snapshot preparation fails, enqueue nothing and reject publication.
5. Increment the global outstanding-delivery count for all copies.
6. Enqueue every copy.
7. Schedule any idle destination mailbox asynchronously.
8. Resolve without awaiting a handler.

Because queues are unbounded and topology is static, there is no normal
partial-admission case. Memory exhaustion is a process failure, not an atomicity
guarantee the MVP can recover from.

Calling `publish()` twice with the same Message ID creates two deliveries. The
MVP performs no deduplication and promises no exactly-once behavior.

### Non-reentrant dispatch

A mailbox must never invoke its handler synchronously inside `publish()`.
Schedule its processing loop with a microtask or equivalent asynchronous turn.

This prevents a flow such as the following from re-entering Engine within the
original publication call stack:

```text
Engine publishes submitted
  -> Worker handles submitted
    -> Worker publishes completed
      -> Engine handles completed
```

Components must still commit any state required by a resulting Message before
publishing it. The MVP does not promise whether a scheduled handler or the
publisher's continuation after `await publish()` receives the next microtask.

### One mailbox with explicit concurrency per subscription

Each logical subscription owns:

- one unbounded in-memory FIFO queue;
- exactly one handler;
- one scheduled processing loop; and
- a positive `maxInFlight`, defaulting to one.

With `maxInFlight: 1`, one handler attempt must settle before that mailbox starts
its next Message, giving FIFO starts and completions. With a larger value,
assignment and handler starts remain FIFO but completions may be out of order.
There is no ordering guarantee between different subscriptions.

This does not serialize an entire component. Engine's new terminal mailbox and
its legacy EventBus ingress remain separate paths; Observability likewise has
two new mailboxes plus its legacy ingress. They may run concurrently in the MVP.
This is an explicitly weaker transition behavior than the mature carrier's
component-wide capacity groups. Verify the selected HTTP paths against current
state, then add a shared ingress gate or capacity group when component-wide
serialization becomes required.

A slow async handler blocks only its own mailbox. A CPU-bound handler still
blocks the shared JavaScript event loop; this is temporal isolation, not process
or CPU isolation.

For the first HTTP slice, Engine and Observability bindings remain at one.
Worker's binding uses `worker.maxConcurrentJobs`, avoiding a regression from
its current parallelism. This per-subscription delivery bound is not a
component-wide capacity group. Worker still owns its final execution-capacity
invariant, even when both values initially match.

### Failure isolation

If a handler throws or rejects, its mailbox must:

1. Catch the error at the delivery boundary.
2. Report the subscription ID, Message type, `source`, Message ID, and error.
3. Mark that attempt finished.
4. Continue with the next queued Message.

It must not:

- reject the already-resolved publisher call;
- stop another subscription's delivery;
- terminate its own processing loop;
- retry automatically; or
- log a complete Message body that may contain sensitive input.

The error reporter must be independent of this Message path and guarded so its
own failure cannot terminate a mailbox. A failed delivery is discarded after
one reported attempt in the MVP. Critical-component health and retained failure
handling are later features.

At the Worker boundary, a modeled failed `JobResult` produces one canonical
`job.httpjson.failed` Message. An unexpected dependency or programming
exception rejects the submitted-Message handler and produces no invented
business terminal Message. These are different outcomes and must remain
different as failure handling grows.

### Message isolation

Object identity and mutation are not protocol guarantees. A recipient must not
be able to mutate the publisher's object or another subscriber's copy.

Keep snapshot creation behind one `snapshotMessage()` seam. The MVP can use an
independent `structuredClone()` plus recursive freeze for each subscription,
preparing every snapshot before enqueueing any of them. This is mutation
isolation, not Redis serialization parity: the later strict lossless-JSON codec
replaces this seam without changing publishers, handlers, or topology.

This temporarily revises the research report's recommendation that strict
lossless-JSON validation be a first-slice requirement. The MVP is limited to
Messages created by the repository's canonical builders, and producers must
still supply recursively JSON-compatible data. `structuredClone()` accepting a
value does not make that value protocol-safe: it also accepts values such as
`BigInt`, maps, cycles, non-finite numbers, and `undefined` that a JSON wire may
reject or change. The MVP does not enforce that precondition and must not be
used as evidence of Redis parity. Any recursive freezer used here must be
cycle-safe.

### Diagnostic idleness

A runtime/test-only `whenIdle()` operation is worth including even though
graceful draining is deferred. Track a router-wide outstanding-delivery count:

- increment once per fanout copy before enqueueing;
- decrement after each handler settles, including failure; and
- resolve current idle waiters when the count reaches zero.

This lets a test await a multi-hop flow in which Worker handles a submitted
Message and publishes a terminal Message before its own handler resolves.
Handlers must await all immediate resulting publications for this accounting to
remain meaningful.

The count observes only work represented by this router's handler Promises. It
cannot see detached component tasks, timers, or callbacks still traveling
through the legacy EventBus.

`whenIdle()`:

- does not stop new intake;
- does not seal the router;
- does not mean every handler succeeded;
- may be followed immediately by new work; and
- must not be named or documented as `drain()`.

### Process-lifetime delivery only

The MVP has no graceful shutdown protocol. Process termination may abandon
queued or running deliveries. It also has no restart recovery: all mailbox
contents disappear with the process.

Do not add placeholder `start()`, `drain()`, or `stop()` methods that imply
guarantees the implementation does not provide.

## Responsibility boundaries

| Owner            | Responsibility                                                          |
| ---------------- | ----------------------------------------------------------------------- |
| Component core   | Business state, execution, and internal vocabulary                      |
| Component edge   | Interpret inbound Messages and construct canonical outbound Messages    |
| Runtime topology | Declare publications, subscriptions, fanout, and hosted handler binding |
| Local router     | Validate publisher authority, snapshot, route, and track idleness       |
| Mailbox          | Queue FIFO, invoke within its concurrency bound, and isolate failures   |
| Redis log driver | Later: append/read/ack/claim mechanics only                             |

Worker receives and retains the complete `job.httpjson.submitted` Message as the
canonical execution origin. It may temporarily project genuinely different
execution concepts into `ExecuteJobCommand`, then translates a modeled
`JobResult` into exactly one canonical terminal Message. Engine owns
constructing the submitted Message and interpreting the literal terminal
Message. Observability owns ingesting Messages into its sinks. Runtime only
connects those endpoints.

There is no Engine-Worker integration object and no file named after a pair of
components.

## Durable package shape

Start in the locations the fuller architecture can continue using:

```text
packages/
  ports/
    src/
      messaging/
        message-publisher.port.ts
        message-handler.ts
        message-topology.types.ts
        index.ts

  components/
    engine/
      src/
        message-boundary/
          httpjson-terminal.handler.ts

    worker/
      src/
        worker.ts                         # stable component root + handler
        execution/
          job-runner.ts                   # focused one-job algorithm
          worker-capacity.ts              # Worker-owned capacity policy
        messaging/
          httpjson-submission.ts          # pure interpretation/projection
          worker-messages.ts              # canonical envelope construction

    observability/
      src/
        core/
          tap.ts                         # exposes bus-independent ingestion

  runtime/
    src/
      messaging/
        in-process/
          in-process-message-router.ts
          subscription-mailbox.ts
        log-backed/                       # later sibling; no local relocation
        http-job.topology.ts
```

The exact number of files is not an invariant. Their ownership is:

- stable publisher/handler types in `ports`;
- stable publication/subscription declaration types in `ports`, owned and used
  by runtime rather than components;
- Message interpretation and construction beside the owning component;
- static topology, router, scheduling, and mailbox state in `runtime`; and
- Redis's passive grouped-log implementation under `adapters/message-log`.

The local router belongs under runtime rather than `packages/adapters`: it
combines topology and active scheduling, while this repository defines adapters
as passive implementations of one port without lifecycle ownership. If this
host machinery later needs reuse outside runtime, introduce a deliberately
named messaging-host package and amend the package taxonomy rather than quietly
moving it into `adapters` or recreating `integrations`.

Treat `runtime/src/messaging/in-process/` as the permanent local-backend
directory. A later Redis implementation gets a `log-backed/` sibling; growing
the carrier does not require relocating the local files merely to insert a
generic `carrier/` directory.

Do not reuse the existing in-memory stream implementation for this work.
`StreamPort` is chunk-oriented, single-consumer, and exposes sequence/end/close
semantics that do not model Message fanout or logical subscriptions.

## MVP non-goals

The first implementation deliberately excludes:

- bounded queues or backpressure;
- queue byte accounting;
- graceful drain, seal, or coordinated shutdown;
- automatic or operator-triggered retry;
- retained failed deliveries or dead-letter storage;
- managed health state;
- shared component capacity groups;
- fair scheduling across subscriptions;
- multiple competing handler instances;
- delivery IDs and acknowledgements;
- durability, restart recovery, or retention;
- a file-backed queue;
- Redis subscription runners;
- strict JSON encoding parity with Redis;
- dynamic or wildcard subscriptions;
- cancellation Messages;
- global ordering across subscriptions;
- a message taxonomy or events-to-messages rename; and
- retirement of the entire EventBus.

For the first HTTP slice specifically, do not add MCP, Limiter participation,
Engine self-loop cleanup, or a new `job.httpjson.started` protocol requirement.

These omissions are explicit semantics, not unfinished claims. Add each feature
only with its policy and tests.

## Guardrails

The following choices would turn incremental growth into another migration:

- exposing a mailbox to component code;
- injecting an ambient router or service locator into components;
- restoring arbitrary `publish(topic, message)` authority;
- defining routing inside Engine, Worker, Limiter, or Observability;
- naming infrastructure after component pairs;
- putting pairwise glue in an `integrations` package;
- using one shared queue for recipients that should receive independent copies;
- creating a mailbox per event type instead of per stable logical subscription;
- invoking handlers inline during publication;
- awaiting recipient completion from `publish()`;
- launching `void handler()` without tracking and catching its Promise;
- returning a recipient result from publication;
- adding a pending-result registry, private reply mailbox, or correlated
  request/reply side channel around publication;
- exposing one mutable Message reference to every recipient;
- treating `whenIdle()` as graceful drain;
- adding blocking backpressure without analyzing cyclic publication;
- adding retries before consumer idempotency is understood;
- implementing local delivery as an in-memory `MessageLogPort`;
- dual-publishing one logical occurrence onto old and new authoritative paths;
- migrating every EventBus interaction at once; or
- promising durability, deduplication, global order, or Redis-equivalent
  behavior that the local implementation does not provide.

## Growing the mailbox deliberately

The order below is guidance, not a requirement to implement every item. Each
subject should be a focused change with its own semantics and verification.

### Instrumentation

Add observation before adding control:

- queued count per logical subscription;
- in-flight count;
- high-water mark;
- handler duration;
- total accepted, completed, and failed attempts; and
- Message snapshot size where measurable.

Keep operational telemetry out of the same mailbox it reports on, or telemetry
failure can recursively amplify an overload.

### Strict serialization parity

Replace the initial snapshot function with the shared Message validator/codec
described in the research report:

- validate the complete envelope;
- recursively reject values JSON would drop, coerce, or fail to encode;
- enforce a configured encoded-size limit;
- decode an independent canonical copy for each subscription; and
- recursively freeze delivered values.

This makes local acceptance match Redis wire acceptance. It does not require
making local queues Redis-shaped.

### Graceful draining and shutdown

Add lifecycle only when its meaning is implementable:

1. Stop external sources from creating new work.
2. Continue accepting causal Messages published by already-running handlers.
3. Wait for global queued and in-flight delivery counts to reach zero.
4. Seal publication atomically.
5. Stop components and infrastructure.

This is more than `whenIdle()`: draining controls intake and closes a race in
which new work arrives immediately after an idle observation. A timeout must
report incomplete and failed deliveries rather than pretending shutdown was
clean.

### Capacity and backpressure

Measure first. Then add both count and encoded-byte limits per logical
subscription.

Do not default to waiting indefinitely for mailbox space. Components publish in
cycles, so blocking admission can deadlock when each side waits for another
mailbox to free capacity. The first hard-limit policy should normally prepare
and capacity-check all fanout branches, enqueue everywhere or nowhere, and
reject immediately with the full subscription ID.

Alternative policies such as waiting, best-effort dropping, or disk spooling
must be explicit per use case. A file-backed queue increases backlog capacity;
it does not solve a sustained producer/consumer rate mismatch.

### Shared capacity across subscriptions

The foundation already supports `maxInFlight > 1` within one mailbox. FIFO then
describes assignment/start order, not completion order.

Before one stateful component consumes several subscriptions concurrently, add
a component-level capacity group shared by those subscriptions. Engine and
Observability initially serialize each binding independently; Worker uses its
existing `maxConcurrentJobs` as the command subscription's limit and retains a
Worker-owned capacity collaborator as its final invariant.

If multiple subscriptions share a capacity group, add fair scheduling so a
busy mailbox cannot monopolize every lane.

### Failure health and explicit retry

Replace report-and-discard with retained failed-delivery diagnostics and managed
health. Keep retries explicit until handlers and side effects have suitable
idempotency.

A handler failure should still affect only its logical subscription and hosted
component health. It must not undo successful deliveries to other fanout
branches.

### Competing members

Allow multiple running handler instances to join one logical subscription and
divide its queued work. This is competition within a role, not fanout:

```text
one Worker subscription + two Worker members -> one delivery to one member
two logical subscriptions                 -> one delivery to each subscription
```

Keep stable subscription identity separate from ephemeral process/member
identity.

### File-backed persistence

A disk spool can replace the mailbox's in-memory storage behind the same local
delivery boundary. Doing this robustly requires append integrity, cursors,
restart recovery, acknowledgement or commit rules, corruption handling,
retention, disk limits, and shutdown behavior.

It moves the backlog out of memory and can survive restarts, much like Redis
holds unread work outside a consumer process. It still requires backpressure
when disk or the producer's write rate becomes the limiting resource.

### Redis/log-backed delivery

Keep `MessageLogPort` below the common Message boundary. A managed runtime
runner should translate logical subscriptions into Redis groups, read only up
to available handler capacity, invoke the same component handlers, and
acknowledge only after the handler's documented success boundary.

Redis entry IDs, consumer names, pending claims, acknowledgement, and retention
remain invisible to components. The local mailbox does not gain those concepts
merely to make the implementations look alike.

### Cancellation

An `AbortSignal` cannot cross a process boundary. If Engine-initiated
cancellation becomes real, model it as a separate Message correlated to a job
attempt and let Worker own the corresponding controller. Do not leak a local
object reference into the shared protocol.

## Relationship to the full carrier research

The research report remains the destination for a mature carrier. This guide
narrows only what must be built first.

Stable in both designs:

- Messages are the component protocol;
- publishers are declaration-bound;
- runtime owns static topology;
- logical-subscription identity is stable;
- fanout occurs across subscriptions;
- components own Message interpretation and construction; and
- `MessageLogPort` remains a lower Redis/log driver.

Deferred from the research report's first-version recommendation:

- bounded count/byte capacity;
- strict lossless-JSON codec enforcement;
- subscription lifecycle and coordinated drain;
- retained failures, health, and explicit retry;
- aggregate capacity groups and fair scheduling;
- competing member identity; and
- the log-backed carrier and managed runner.

The future work may replace much of the router and mailbox internals. It should
not require relocating the feature, changing the Message protocol, importing
components into one another, or rewriting component cores. The MVP is the first
thin implementation of that architecture, not a competing architecture.

## MVP completion test

The mailbox foundation is successful when one real HTTP JSON job conversation
uses it end to end and proves:

- Engine publishes one canonical submitted Message;
- Worker receives it asynchronously without Engine waiting for execution;
- Worker constructs and publishes exactly one canonical terminal Message;
- Observability receives its independent submitted-Message copy;
- Engine and Observability receive independent terminal deliveries;
- each logical subscription starts work FIFO within its declared
  `maxInFlight` bound;
- one blocked or failing subscription does not block another;
- handler execution is never inline with publication;
- Message snapshots cannot mutate one another;
- tests can await the complete multi-hop flow through `whenIdle()`; and
- no migrated Message is also delivered through a second authoritative path.

Everything beyond that is an improvement, not a prerequisite for proving the
boundary.
