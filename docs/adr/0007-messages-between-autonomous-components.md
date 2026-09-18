# ADR-0007: Messages between autonomous components

Date: 2026-09-07
Status: Proposed

## Context

lowercase needs the same component interaction model when components share a
process and when they run in separate processes. The project has exercised two
different models instead:

- the legacy `EventBusPort` lets components subscribe to broad topics and
  receive CloudEvent-shaped events asynchronously; and
- the newer local Engine-to-Worker path invokes a request/return port directly,
  while the proposed remote path would have to reconstruct that interaction
  over Redis.

Direct local invocation is simple in isolation, but it makes the local and
remote protocols behaviorally different. It also makes runtime composition
grow pairwise wiring as Engine, Worker, Observability, Limiter, and future
components need independent reactions to the same occurrence. Wrapping a remote
command/result exchange so that it resembles an awaited local call would add
correlation and pending-call machinery while preserving the mismatch.

The existing event values already supply a strict, typed protocol envelope:
identity, source, time, scope, trace context, type, and data. The term
**Message** describes the role of that existing CloudEvent-shaped value between
components; it does not rename the schemas or yet divide them into command,
fact, reply, and telemetry taxonomies.

The first live Engine -> Worker -> Engine conversation now uses this model for
HTTP JSON jobs. The same topics and handlers run over either an
in-process mailbox carrier or a Redis-backed carrier, while all components are
still cohosted by the `local-system` profile. That is evidence for the protocol
boundary, not yet evidence for separate process hosts or a mature deployment
topology. This ADR is intentionally Proposed: it records the current decision
thread for review and further implementation evidence, and does not change any
Accepted ADR.

## Decision

Use canonical CloudEvent-shaped Messages as the protocol between autonomous
components in every deployment profile.

An autonomous component is a logical unit such as Engine, Worker, Limiter, or
Observability that may be hosted independently and owns its behavior or state
transitions. This decision does not require Messages for:

- calls between a component and its internal collaborators;
- bounded capability-module calls;
- application-service calls from an app boundary; or
- passive infrastructure ports such as artifact storage or SQL repositories.

Those interactions may remain ordinary typed calls where their semantics are
call-scoped.

### Component-facing contracts

- A producer receives a `MessagePublisher<T>` already bound to one declared
  topic.
- A consumer implements a `MessageHandler<T>` through a method on the actual
  component.
- Shared protocol and deployment declarations own stable topic,
  subscription, and physical-route identity. A process profile selects its
  carrier, resolves publishers, binds the handlers it hosts, and validates its
  local host plan.
- Components do not receive a router, mailbox, Redis client, consumer group,
  acknowledgement handle, or dynamic subscription API.
- The process profile retains the real component instance. Binding a handler
  must not wrap the component in another object that becomes its apparent
  identity.
- Local and remote profiles bind the same publisher and handler contracts. A
  transport change does not select a different Worker or Engine implementation.

Inbound and outbound remain useful directions relative to a component. They do
not require mirrored inbound/outbound port and adapter directories when the
shared Message contracts and a component method already express the boundary.

### Topology and fanout

A topic is a stable delivery conversation with an exact set of Message
types. It is not mechanically one topic, mailbox, or Redis stream per event
type. The initial topic names are narrowly HTTP-JSON-shaped
because that is the first migrated slice; the durable concept is a Worker job
conversation containing its command and terminal outcomes. Another job
protocol such as MCP may join that conversation when its real semantics are
known, without requiring one physical route per lifecycle event.

A logical subscription is one independent delivery purpose and may select one
or more explicit topics. One published Message is independently admitted
to every matching logical subscription. Engine, Observability, and Limiter
therefore receive their own deliveries when each has a real reaction; none is
wired as a side effect of another recipient. If several running consumers later
perform the same logical role, they compete within one logical subscription
rather than receiving a new fanout copy each.

Topology has three static layers:

- the **protocol catalog** defines stable topic and logical-subscription
  identities and their Message types;
- a **deployment manifest** enables declarations and maps them to physical
  carrier routes shared by every process in that deployment; and
- each **process host plan** selects the publishers and subscriptions that the
  process serves and binds only its local handlers.

The carrier compiles those declarations into its own resources, such as local
mailboxes or Redis streams and consumer groups. Process validation can prove
that every subscription assigned to that host has a local handler. Deployment
validation can prove that every enabled subscription is assigned to a process
role. Neither static check proves that a remote process is alive.

There are no wildcard or ambient subscriptions. Observability is one explicit
logical subscription selecting the topics it records, and a host presents
those deliveries to one serial ingestion lane so its sink observes one settled
sequence rather than independent per-event mailboxes.

The exact Redis realization of that ordered lane remains open. A Redis consumer
group belongs to one stream even when one read waits on several streams, and
Redis provides no global order across those streams. Mirroring one Message to a
work route and an observation route also needs an atomic-write or reconciliation
policy before admission can honestly cover both. The topology must permit one
ordered physical observation route without claiming that those delivery
mechanics are already solved.

### Admission and handler truth

The central temporal rule is:

> A sender may await carrier admission, but it never awaits recipient
> processing.

For the in-process carrier, admission means that every declared destination
accepted an independent Message snapshot. For the current Redis-backed
carrier, admission means that the required append succeeded. A future topology
that writes one occurrence to multiple physical routes must define whether
admission covers all routes and how partial writes are recovered. These are
carrier guarantees, not a claim that a recipient started, completed, or
succeeded.

A handler's returned Promise is the truth boundary for one delivery. It resolves
after the component-owned work it claims to perform has finished and its
immediate authoritative resulting Messages have reached admission. It does not
wait for downstream recipients to process those Messages. An authoritative
publish must be awaited or owned by an explicitly supervised task; a bare
unobserved Promise is not an asynchronous architecture.

Carrier `maxInFlight` bounds how many deliveries one subscription presents
concurrently. A stateful component still owns its final internal capacity and
serialization invariants; host scheduling is not a substitute for component
policy.

### Protocol and authority

- The complete inbound Message is the canonical source of identity, scope, and
  trace context for that interaction.
- Internal translation is justified when meaning changes, not merely to rename
  envelope fields.
- Each logical occurrence has exactly one authoritative producer and
  publishing path.
- A migration moves one complete conversation together. A running profile must
  not both invoke a component directly and publish the same actionable Message,
  or advance from both a returned result and a terminal Message.
- A modeled business failure produces its modeled terminal Message. An
  unexpected programming or dependency failure rejects the handler and does not
  fabricate a business outcome.
- Independent subscription failure does not undo or block successful delivery
  to another subscription.

The in-process carrier delivers asynchronously and non-reentrantly, but it does
not pretend to provide Redis entry IDs, consumer groups, acknowledgement,
pending recovery, retention, durability, or redelivery. The implemented Redis
carrier provides a stronger admission boundary while keeping its mechanics
outside components; retry, reclaim, and retained-failure policy remain further
work.

### Relationship to existing decisions

If accepted, this ADR would supersede only these parts of existing decisions:

- ADR-0005's definition of components as necessarily self-driven by subscribing
  themselves to the event bus; profile-bound Message handlers become the
  component boundary.
- ADR-0006's statement that Worker owns event-bus and queue infrastructure
  coupling; Worker instead owns its Message semantics while process profiles
  and carriers own delivery infrastructure.

It preserves ADR-0005's architectural package dependency direction, as refined
by ADR-0008's proposal that each process profile is a composition root rather
than `runtime` being a privileged package. It preserves ADR-0006's fixed,
first-party protocol set, rejection of a tool registry, and Worker ownership of
external-call policy. Because this ADR is Proposed, ADR-0005 and ADR-0006 remain
Accepted and unchanged.

The [Worker architecture](../component-architecture/worker/README.md) and
[Worker migration guide](../component-architecture/worker/MIGRATION.md) apply
this decision to one component. They remain implementation guidance rather than
part of this ADR's decision.

## Consequences

- Local and remote deployments share one component protocol and differ honestly
  in carrier guarantees.
- Engine no longer treats Worker completion as a function return; it progresses
  from the terminal Message delivered to its own subscription.
- Observability and other concerns receive independent fanout without
  component-pair integration objects.
- Deployment definitions and process-profile tests must describe explicit
  topics, subscriptions, host assignments, bindings, and concurrency.
- Local interaction has additional scheduling and queue machinery compared with
  a direct call, and state changes become intentionally asynchronous.
- Message construction, correlation, failure policy, and single-authority rules
  become correctness concerns that must be tested.
- The legacy EventBus can be retired incrementally, one coherent conversation
  at a time, instead of through a system-wide rewrite.
- Direct request/return remains appropriate outside autonomous component
  boundaries; this is not a rule that every call becomes a Message.

The following alternatives are rejected for this boundary:

- **Direct calls locally and Messages remotely:** two behavioral protocols and
  two wiring models would remain.
- **A correlated remote client that imitates an awaited call:** adds pending
  state and reply routing while keeping the sender coupled to completion.
- **An ambient EventBus as the component API:** hides topology, grants arbitrary
  routing authority, and makes subscription ownership difficult to inspect.
- **A Redis-shaped in-memory implementation:** imports remote recovery concepts
  into a profile that cannot honor their guarantees.
- **Redis for every profile:** adds an operational dependency merely to achieve
  local decoupling.

This decision deliberately leaves delivery hardening open: bounded
backpressure, graceful draining, retry and retained failures, Redis claim and
acknowledgement policy, idempotency, duplicate terminal handling, multi-route
atomicity or reconciliation, cancellation Messages, shared capacity groups,
health, and the physical realization of one ordered Redis observability route.
Those policies require separate evidence and decisions; they are not implied by
the word Message.
