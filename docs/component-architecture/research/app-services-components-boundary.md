# App-Services / Components Boundary

Status: research note, not an ADR.

This document investigates whether `packages/app-services` and
`packages/components/*` should continue to communicate exclusively through the
event bus. It is intentionally limited to that boundary. It does not decide the
separate `packages/artifacts` refactor.

## Recommendation

The current boundary is **partly right, but enforced by the wrong rule**.

Keep these constraints:

- component core must not import `@lcase/app-services`
- application services must not import concrete component implementations
- neither tier may reach into the other's internal state or bypass its public
  contract through implementation-owned storage
- only hosts, runtime composition, or explicit integration adapters may know both
  concrete sides
- shared behavior should move below both tiers only when it is genuinely the same
  capability or rule

Replace this constraint:

> Application services and components communicate only through the event bus.

With this one:

> Application services and components communicate through explicit, narrow port
> contracts. In-process adapters may call those ports directly. Remote adapters
> may implement the same semantic contract using HTTP, IPC, a command bus, or a
> queue. Lifecycle events remain facts for history, projections, fanout, and
> automation; they are not the default command path.

This is not permission for a component to call `RunService` or `ArtifactService`.
It is permission for a caller to depend on a small capability such as run
submission, artifact writing, or job execution without depending on the
application-facing facade or the provider's concrete core.

In short:

| Relationship                                                                | Recommendation                            |
| --------------------------------------------------------------------------- | ----------------------------------------- |
| Component core imports an application-service class                         | Do not allow                              |
| Application service imports a component class                               | Do not allow                              |
| Either side depends on a narrow contract in a neutral/contract-only package | Allow                                     |
| Local adapter calls a component inbound port                                | Prefer for command/request semantics      |
| Remote adapter sends the equivalent command                                 | Use when that boundary is remote          |
| Either side reacts to a lifecycle fact                                      | Allow when lag/retry/replay is acceptable |
| Component calls a full application-facing service facade                    | Do not allow                              |

The stable application-facing surface and the component execution surface are
genuinely different surfaces. The event bus is not what makes them different.
Their contracts, ownership, and semantics do.

## The Existing Premise Has Already Changed

[ADR-0005](../../adr/0005-package-tier-taxonomy.md) says application services and
components depend on the common foundation without depending on one another, and
defines a component as self-driven through bus subscription. That was an accurate
description of the code when the ADR was accepted. It is no longer an accurate
definition of the implemented Worker.

The newer [Component Architecture Draft](../model.md) explicitly says it would
supersede the self-subscribing definition. That direction has now been exercised,
not merely proposed:

- Worker has a callable `JobExecutionPort` and no event-bus dependency
  ([worker.ts](../../../packages/components/worker/src/worker.ts),
  [architecture.test.ts](../../../packages/components/worker/tests/architecture.test.ts)).
- Engine owns a narrow outbound `JobExecutorPort`
  ([job-executor.port.ts](../../../packages/ports/src/engine/job-executor.port.ts)).
- `LocalWorkerJobExecutor` translates and calls Worker directly without publishing
  a command event
  ([local-worker-job-executor.ts](../../../packages/integrations/src/engine-worker/local-worker-job-executor.ts)).
- Runtime wires the two together in-process
  ([runtime.ts](../../../packages/runtime/src/runtime.ts)).

The code therefore already demonstrates the better replacement rule: component
cores remain package-independent while an integration adapter performs a direct
local call through ports.

The premise that application services and components currently communicate
_exclusively_ through the bus is also incomplete. `SystemService` calls
`RouterPort`, `EnginePort`, `LimiterPort`, and `ObservabilityTapPort` directly for
start, stop, and sink management
([system.service.ts](../../../packages/app-services/src/system.service.ts)). This is
control-plane interaction rather than run execution, but it proves that the real
boundary has already been "no concrete imports," not literally "bus only."

## What `app-services` Is Actually For

The hypothesis in the research prompt is substantially correct:
`packages/app-services` is an application-facing facade over bounded external use
cases. HTTP routes and CLI commands call it directly, and it translates those
requests into validation, repository work, queries, and execution requests.

That role is visible in every service, although two files do not fit the tier as
cleanly as the others.

| Service           | What the code actually does                                                                                                                        | Boundary finding                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RunService`      | Validates a request using CAS, schemas, flow analysis, and artifact metadata; creates the requested Run row; starts execution; exposes run queries | A real application use case. Engine should not depend on this full facade. Its current final bus hop is separable from the rest of the use case.                                               |
| `FlowService`     | Validates definitions, handles CLI file input, coordinates CAS and flow metadata, and serves HTTP read models                                      | Application-facing overall. Its repeated "load JSON then parse flow" behavior is a candidate for a smaller shared operation, not a reason for Engine to call `FlowService`.                    |
| `ArtifactService` | Serves upload/read/list/edit/curation workflows and validates curation against flow declarations                                                   | Clearly shaped for API consumers. Worker correctly uses `ArtifactsPort` instead of this facade.                                                                                                |
| `SimService`      | Builds, stores, starts, lists, and reads simulations across five dependencies                                                                      | A multi-port application use case, not a component capability. Its run-start edge has the same command-as-event issue as `RunService`.                                                         |
| `EvalService`     | Resolves target/context data, starts an eval run through `RunServicePort`, updates metadata, and exposes result queries                            | A real application orchestration. It also demonstrates that direct orchestration through an interface is already accepted inside this tier.                                                    |
| `ReplayService`   | Thinly wraps `ReplayEnginePort` for replay and event-query endpoints                                                                               | An application facade, but almost no reusable behavior. A component needing replay mechanics should use a narrow replay capability, not this class.                                            |
| `SystemService`   | Starts/stops runtime pieces and attaches observability sinks                                                                                       | This is host/runtime lifecycle management, not a bounded business interaction. The newer component guidance says the host owns construction and shutdown, so this service is likely misplaced. |

Most methods are called directly from HTTP routes or CLI commands. The services
also shape errors and results for those callers. That is enough reason to keep an
application-service facade distinct from component inbound ports even when both
eventually use the same lower-level capability.

## The False Binary

"Expose all of `RunService`" versus "expose nothing and use the bus" is a false
binary. There are four useful sharing shapes, each for a different case.

### 1. Shared pure rule

If the behavior needs no I/O, put it in functional core and let both tiers import
it directly. Existing flow analysis and reference binding follow this rule.

### 2. Small operation over one port

If the behavior is the same small action over one external capability, the local
`Operations` convention is suitable. For example, loading JSON through
`ArtifactsPort` and parsing it as a flow definition could be one reusable
operation used by both `FlowService` and Engine.

This avoids making Engine depend on `FlowService`, while also avoiding duplicate
fetch/parse behavior. The current duplication is visible in
[`FlowService.getFlowDefByHash()`](../../../packages/app-services/src/flow.service.ts)
and
[`getFlowDefFx`](../../../packages/components/engine/src/effects/get-flow-def.effect.ts).

### 3. Shared capability behind a port

If behavior has its own coherent responsibility and legitimately coordinates more
than one dependency, give that capability its own API/port below both consumers.
An application service can wrap it for an external use case, while a component can
use only the narrower capability it needs.

This is the relevant general principle for the later artifacts investigation. It
does not decide what that capability is or where its implementation belongs.

### 4. A component inbound port

If the requested behavior is owned by a component, call its narrow inbound port.
For package and deployment independence, either:

- put the stable contract in a contract-only/shared-ports package, or
- let the caller own an outbound port and use an integration adapter to translate
  it to the component-owned inbound port

The second shape is what Engine-to-Worker now uses. It is useful when caller and
provider vocabularies should evolve independently. If both sides intentionally
share exactly the same contract, an identity adapter is ceremony and can be
omitted; the runtime may inject the narrow port directly.

The important restriction is that importing a type from a component's main npm
package can still create a package/install dependency even if TypeScript erases
the import. For a boundary intended to become independently deployable, keep wire
or shared contracts free of component implementation code.

## Concrete Boundary Friction Today

### `run.requested` has two jobs

`RunService.requestRun()` validates the request, creates a requested Run record,
and then `runFlow()` publishes `run.requested`
([run.service.ts](../../../packages/app-services/src/run.service.ts),
[run-flow.ts](../../../packages/use-cases/run-flow/src/run-flow.ts)). Engine subscribes
to that topic and treats its payload as the input that creates Engine run state
([engine.ts](../../../packages/components/engine/src/engine.ts),
[run-requested.reducer.ts](../../../packages/components/engine/src/reducers/run-requested.reducer.ts)).

At the same time, `run.requested` is a useful fact consumed by run-history and
observability projections. `SqlRunProjectionSink` uses it to populate run metadata
([sql-run-projection.sink.ts](../../../packages/components/observability/src/sinks/sql-run-projection.sink.ts)),
and the eval projection also consumes it.

Those are two valid semantics hidden behind one event:

1. command: ask Engine to accept and begin a run
2. lifecycle fact: a run was requested, for history and projections

The fix is not necessarily to delete `run.requested`. The fix is to stop making
that fact the only command channel. A target shape is:

```text
HTTP/CLI
  -> RunService
  -> RunSubmission/RunDispatch port
  -> Local adapter -> Engine inbound port
                    or
     Remote adapter -> command transport -> Engine inbound adapter

Run lifecycle owner
  -> records run.requested fact
  -> observability/history/projections
```

The owner of the `run.requested` fact remains a human design decision. The
component-architecture draft already records that question. The command owner is
clearer: the caller asks; Engine owns acceptance and execution.

The current bus also provides weaker acknowledgement than the method signature
suggests. `InMemoryEventBus.publish()` schedules handlers with `queueMicrotask()`
and returns before they run; asynchronous handler failures are not propagated
([inmemory.event-bus.ts](../../../packages/adapters/src/event-bus/inmemory.event-bus.ts)).
Consequently, a successful `RunService.requestRun()` means validation, SQL write,
and event scheduling succeeded. It does not mean Engine accepted the run. A port
contract can name that result explicitly: accepted, queued, rejected, or merely
submitted.

### Replay control is also command-shaped

`ReplayService` calls `ReplayEngine.emitReplayMode()`, which emits
`replay.mode.submitted`; Engine is its only behavior-driving subscriber
([replay.ts](../../../packages/replay/src/replay.ts),
[engine.ts](../../../packages/components/engine/src/engine.ts)). Telling Engine to
enable or disable side effects is a control command, even though its current
envelope is called an event. A future Engine replay-control inbound port would
state that ownership more clearly. Replaying historical lifecycle events through
Engine is a separate concern and may intentionally remain event-shaped.

### Persistence ownership is not clarified by the bus

`RunService` creates the initial Run row, while `SqlRunProjectionSink` also upserts
that row from lifecycle events. The shared write is currently made tolerant by
the repository's upsert behavior, but it leaves two owners for the same record.
This is not proof that either owner is wrong. It is proof that routing through a
bus does not by itself establish state ownership or transaction boundaries.

Before Engine becomes remote, the system will need to decide whether the Run row
is command-side state, a projection, or deliberately both with documented
idempotent reconciliation. That decision is orthogonal to whether the local call
uses a bus.

## In-Process And Remote

### In-process

Use the language runtime where the semantics are request/response:

```text
RunService -> narrow port -> Engine
Engine -> narrow port -> Worker
Worker -> narrow port -> artifact capability
```

This keeps failure propagation, typing, stack traces, and tests straightforward.
It does not couple concrete implementations when dependencies are interfaces and
runtime supplies the implementation.

Use an in-memory inbox or queue when local asynchronous acceptance, backpressure,
or independent scheduling is part of the desired semantics. That is still a
command path. It does not need to masquerade as a lifecycle event.

### Remote

When Worker or another component moves out of process, the local implementation of
the caller's port is replaced by a remote adapter. The standalone component host
contains:

- component core
- concrete infrastructure dependencies
- an inbound transport adapter that calls the same inbound port
- process health/control wiring

It does **not** need an application-service layer merely because it is now under
`apps/worker`. Application services exist for external use cases, not as mandatory
wrappers around every executable. Add a worker-local application service only if
that process develops a real human/API request-response use case beyond its
component command and operational endpoints.

The remote adapter must add distribution concerns that the local adapter should
not simulate by default: serialization, versioning, timeout, cancellation,
correlation, retry policy, idempotency, delivery acknowledgement, and remote
observability. The component core should not own those transport mechanics.

This means a strict **contract and implementation** boundary now genuinely makes
the remote split cheaper later. A strict **bus-only** boundary does not. The
current in-memory bus does not provide the guarantees a remote broker requires,
and modeling all local interactions as publication does not create those
guarantees.

Nor is a direct dependency on an application-service class today justified by
"we can re-architect it when remote." That would make the later split harder. The
low-cost path is a narrow port now, direct local implementation now, remote
implementation later.

## What Established Practice Suggests

The codebase's newer port-driven direction is closer to established
ports-and-adapters and modular-monolith practice than the older bus-only rule.

Alistair Cockburn's original
[Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture)
describes a port as a purposeful conversation and explicitly lists a direct
program-to-program adapter alongside UI, test, database, and other adapters. The
pattern isolates application semantics from technology; it does not require an
in-process message bus. Cockburn also says the granularity and number of ports is
largely a design choice. Therefore this repository's exactly-one-port
`Operations` rule is a useful local convention, not a standard requirement of
hexagonal architecture or DDD.

Microsoft's guidance distinguishes
[domain events from integration events](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation):
in-process domain reactions may be synchronous or asynchronous, while integration
events propagate committed changes across service or bounded-context boundaries
asynchronously. That supports keeping lifecycle facts while not using facts as the
only way to issue a command.

Azure's
[interservice communication guidance](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/interservice-communication)
chooses request/response when a caller needs a result and asynchronous messaging
when failure isolation, fanout, buffering, or load leveling is the requirement. It
also calls out the extra duplicate handling, correlation, and request/reply
complexity introduced by asynchronous messaging. Process placement matters, but
it is not the sole semantic decision rule.

Martin Fowler's
[Microservice Trade-Offs](https://martinfowler.com/articles/microservice-trade-offs.html)
and
[First Law of Distributed Objects discussion](https://martinfowler.com/articles/distributed-objects-microservices.html)
make the related distinction: a remote call is slower and can fail independently,
while an in-process call normally cannot fail for network reasons. Good module
boundaries are possible in a monolith; distribution makes boundaries harder to
cross but introduces its own cost. The local implementation should not pretend
those failure modes are identical.

The deciding questions used by these sources are closer to:

- Does the caller need acceptance or a result before continuing?
- Is there one intended handler or an open set of subscribers?
- Must the work share an immediate consistency/transaction boundary?
- May the receiver lag or be unavailable independently?
- Is buffering, load leveling, replay, or fanout a requirement?
- Who owns the state and the contract?

"Might run remotely someday" is a reason to define a stable port and avoid
concrete imports. It is not, by itself, a reason to route every local command
through a bus.

## Revised Boundary Rule

The package taxonomy can retain its useful distinction with a narrower definition:

### Application service

Orchestrates one bounded interaction initiated by an external actor and exposes a
surface shaped for HTTP, CLI, desktop IPC, or another application entrypoint.

### Component

Owns a coherent behavior/state boundary and its lifecycle facts. It exposes
inbound ports and depends on outbound ports. It may be long-lived, but it is not
required to self-subscribe to a bus.

### Operation

A reusable, non-app-facing building block. The exactly-one-port restriction may
remain as a useful diagnostic convention, but should stay explicitly speculative
and should not be used to force every coherent multi-dependency capability into an
application service.

### Integration adapter / host

The allowed location for concrete knowledge of both sides. It selects local direct
calls, local inboxes, or remote transports without changing either core.

### Event

A fact that happened. It is appropriate for history, projection, fanout, optional
reaction, and integration after commit. A command may travel through the same
broker, but it remains a command with command-specific acknowledgement and failure
semantics.

## Suggested Next Decision

If this recommendation is accepted, write a narrow ADR that supersedes only these
parts of ADR-0005:

- a component is necessarily self-driven by bus subscription
- the absence of a direct package dependency implies bus-only communication

Preserve the rest:

- package-tier names and foundation layers
- component cores do not import one another or application-service cores
- runtime/hosts compose implementations
- adapters own infrastructure and transport mechanics
- pure logic remains directly reusable

The Worker vertical slice has now met the trigger already recorded in the Worker
V2 plan for writing that superseding ADR. `docs/architecture.md` and `CLAUDE.md`
would then need their component definitions updated in a later implementation
change; this research note intentionally does not edit them.

## Human Decisions Still Required

The architectural direction is clear enough to recommend, but these details are
not settled by this investigation:

1. Whether Engine's run-submission call acknowledges receipt, queueing, validation,
   or actual start.
2. Whether `run.requested` is formed by the application service after durable
   request creation, by Engine after acceptance, or split into two differently
   named facts.
3. Whether cross-deployable contracts remain in the existing `packages/ports`,
   move to component-specific contract packages, or use caller-owned and
   provider-owned ports joined by integrations.
4. Whether `SystemService` moves into runtime/host lifecycle code or remains an
   application facade over that code for compatibility.
5. Whether the local exactly-one-port `Operations` rule survives contact with the
   next real shared orchestration case.
6. Which state and storage each future standalone component owns. A bus boundary
   cannot answer that question.

Those are suitable follow-up design decisions. None requires preserving the
bus-only rule in the meantime.
