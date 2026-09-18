# Capability Modules

Status: research note, not an ADR.

This document defines the category previously called "shared capability behind a
port" in the
[App-Services / Components Boundary](./app-services-components-boundary.md).
It accepts that document's boundary conclusion: application services and
components may use narrow ports directly, and local versus remote placement does
not by itself determine whether an interaction is a command or an event.

The question here is narrower: what kind of thing owns reusable behavior that is
larger than a small `Operation`, smaller and less autonomous than a component,
and not shaped around one external application request?

## Recommendation

Use **application-core capability module**, shortened to **capability module**:

> A capability module is a runtime-composed, non-entrypoint module that exposes a
> cohesive application capability through one or more narrow inbound ports and
> owns the technology-independent policy for using its outbound ports.

The defining property is **policy ownership**, not port count. A capability
module decides what an operation means across its dependencies: ordering,
success, partial failure, idempotency, fallback, compensation, or
reconciliation. Its callers ask for the result of that capability instead of
coordinating the underlying dependencies themselves.

For the primary case in this repository:

- `packages/artifacts` is a legitimate physical home for an artifact capability
  module.
- Artifact writes should remain fused behind one writer port because a successful
  write means both content and metadata were recorded.
- Content reads should be exposed through a separate, narrower reader port that
  does not require the metadata repository.
- These can remain in one artifact package while using separate interfaces and
  implementation objects. One module does not imply one class or one wide port.
- Application services and components may both depend directly on the narrow
  capability ports. Neither should import the concrete implementation.
- `runtime` or a standalone host constructs the local implementation or supplies
  a remote adapter.

This is a different category from `Operations`. Keep both, with the distinction
described below.

## Why This Name

The full name is deliberate:

- **Application-core** says the behavior is part of the application's semantics,
  not an infrastructure adapter and not an HTTP/CLI-facing application service.
- **Capability** says the API names something the system can do, independent of
  a particular caller or transport.
- **Module** says the capability has an owned API, implementation boundary,
  dependencies, construction, and policy. It is more than a helper function, but
  the word does not imply a process or network service.

"Shared" is omitted from the category name. Sharing is evidence for extracting
the boundary, not an intrinsic property. If one consumer disappeared tomorrow,
the artifact writer would still own the same CAS/metadata consistency policy.

"Service" is also omitted. In this repository, application service already means
an externally initiated use-case facade. In established usage, Fowler's
[Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) defines the
application boundary for client-facing operations, and Microsoft's
[DDD guidance](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design)
uses application service for use-case orchestration and domain service for
business rules that do not belong to an entity or value object. Neither meaning
fits every capability in this category. Artifact encoding and cross-store
consistency are application-core policy, but calling them a domain service would
overstate their relationship to a domain model.

"Module" is intentionally modest. Eric Evans's
[DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
describes modules as cohesive sets of concepts whose names tell the system's
story. `artifacts` already meets that conceptual test. This document adds local
construction and dependency rules; it is not claiming that capability module is
a standard DDD pattern name.

Finally, ports do not supply an arity-based taxonomy. Cockburn's original
[Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture)
defines a port by the purpose of a conversation and treats the useful number and
granularity of ports as a design choice. The repository's one-port `Operations`
rule can still be a useful local constraint, but it is not a general law that
anything using two ports belongs to the same architectural category.

## Membership Rules

A candidate qualifies as a capability module when all of these are true.

### 1. It has a consumer-independent responsibility

The capability can be named without naming an endpoint, UI action, component, or
specific caller. "Write an artifact" qualifies. "Handle the create-artifact HTTP
request" and "prepare the Engine's branch effect" do not.

Its API uses the capability's language. It does not expose Prisma calls,
filesystem paths, broker topics, HTTP status codes, or another adapter's
vocabulary.

### 2. It provides an owned port

The module exposes one or more narrow inbound ports describing what it provides.
Consumers receive those ports through dependency injection. They do not import a
helper and pass all of its dependencies on every call.

From a consumer's point of view, the same interface is an outbound dependency.
That does not require two duplicate interfaces when both sides intentionally use
the same vocabulary. A caller-owned outbound port plus an integration adapter is
still appropriate when the caller and provider need different contracts.

### 3. It owns meaningful policy behind the port

The implementation does more than forward each method to one lower-level port. It
owns stable behavior that callers should not independently reproduce, such as:

- canonicalization and content identity
- ordering writes across independent resources
- defining when a result counts as successful
- translating lower-level failures into capability-level outcomes
- retry, idempotency, fallback, compensation, or reconciliation policy
- access or consistency rules shared by materially different callers

Two or more outbound ports are strong evidence because their relationship must
have an owner. They are neither necessary nor sufficient. A one-port content
reader may still own artifact decoding and error semantics. A two-port function
that sequences one caller-specific use case may still belong in an application
service.

### 4. It has an independent construction boundary

The runtime or host constructs the module from its outbound ports and gives
consumers only the inbound interfaces they need. Construction is normally once
per runtime scope, even when the implementation is stateless.

This is a semantic ownership rule, not an argument for a dependency-injection
container. Plain constructors and factory functions are enough.

### 5. Its work is bounded by calls

A capability module may keep an internal cache or other incidental state, but it
does not own an autonomous control loop, work inbox, independently advancing
state machine, start/stop protocol, or lifecycle-event stream. Its work begins
because a caller invokes a port and the call has a defined outcome.

If those operational properties become central, the candidate is becoming a
component. Running a capability in another process does not cause that change by
itself; a host and transport adapters can expose the same call-scoped core
remotely.

### 6. The boundary is justified by current behavior

Do not create a capability module only because something might be shared later.
There should be real reusable policy, materially different consumers, an already
required placement boundary, or a failure invariant that needs one owner.
`Artifacts` has all four. A thin pass-through with one speculative caller does
not.

## Disqualifiers

Use the narrowest category that owns the behavior:

| Candidate shape                                                                         | Place it as            | Why it is not a capability module                                     |
| --------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| No I/O; result is only a function of inputs                                             | Functional core        | It needs no runtime construction or port                              |
| Small function over a port already held by its caller                                   | `Operation`            | The caller owns construction and the larger policy                    |
| One bounded HTTP/CLI/desktop interaction                                                | Application service    | Its workflow and result are shaped around an external actor           |
| Behavior already owned by Engine, Worker, or another component                          | Component inbound port | A neutral middle layer would hide the real owner                      |
| Autonomous processing, durable inbox, state machine, start/stop, or lifecycle ownership | Component              | It owns an operational role, not only call-scoped capability behavior |
| Serialization or translation to SQL, filesystem, HTTP, broker, or IPC                   | Adapter                | The behavior is technology-specific translation                       |
| Interface that only repeats another port with no policy or vocabulary change            | No new abstraction     | It adds indirection without an owner or semantic boundary             |

A broad class that contains several unrelated conveniences is also disqualified.
Having several consumers does not turn a utility drawer into a coherent module.

## Relationship To `Operations`

Capability modules and `Operations` solve different reuse problems. A capability
module is not `Operations` generalized from one port to many.

| Property             | `Operation`                                     | Capability module                                                |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Typical unit         | Function-scale action                           | Module-scale capability                                          |
| Invocation           | Direct function import                          | Injected inbound port                                            |
| Dependency ownership | Caller already holds and passes the port        | Runtime constructs the implementation with outbound ports        |
| Current port rule    | Exactly one, as a conservative local convention | One or more; arity is not the membership test                    |
| Policy scope         | One small reusable step                         | Stable capability semantics and dependency relationships         |
| Failure ownership    | Maps the one action's immediate result          | Defines success and recovery across its dependency boundary      |
| Runtime wiring       | Never                                           | Yes                                                              |
| Remote substitution  | Not an architectural goal of the helper         | Local implementation or remote adapter may satisfy the same port |

Both should coexist:

- Do not promote every small helper into a runtime-wired object. That would add
  ports and composition without buying policy ownership.
- Do not generalize `Operations` to arbitrary bags of ports. That would erase its
  value as a small, portable building-block convention.
- Keep exactly one port as the conservative admission rule for `Operations` for
  now. Treat it as a diagnostic, not as proof that every multi-port relationship
  must be decomposed.
- When a candidate needs multiple ports, first ask who owns their relationship.
  If a reusable capability owns it, use a capability module. If one external use
  case owns it, keep it in the application service. If an existing component owns
  it, use that component's port. If the relationship is accidental, decompose it.

This qualifies one claim in [ADR-0005](../../adr/0005-package-tier-taxonomy.md):
using more than one port does mean that orchestration exists, but it does not mean
the immediate caller must own that orchestration. A capability module can be the
legitimate owner. If this research is accepted, that clarification requires a
follow-up ADR; this note does not change the accepted taxonomy by itself.

`runFlow()` remains useful only as an example of the current `Operation` shape: a
directly imported function whose caller supplies one `EmitterFactoryPort`.
Its current package location is not precedent, and its event-based implementation
may disappear when run submission gets a command port.

## Taxonomy And Physical Location

Recommend adding capability module as a **named package role**, but not adding a
generic `packages/capabilities/*` directory now.

The role has dependency and construction rules distinct from `Operations`,
application services, components, and adapters, so it should eventually appear
in the package taxonomy if accepted. Physical packages should still use the
domain concept as their name:

```text
packages/
  artifacts/                  # concrete artifact capability module
  ports/
    src/artifacts/             # capability and infrastructure contracts
  adapters/
    src/artifact-store/        # ArtifactStorePort implementations
    src/artifact-repository/   # ArtifactRepositoryPort implementations
  app-services/                # external use cases consuming artifact ports
  components/                  # component cores consuming artifact ports
  runtime/                     # constructs and connects all of the above
```

Creating `packages/capabilities/artifacts` would add a structural word already
expressed by the package role, while `capability` also has a separate meaning in
the Worker's job vocabulary. A common container may become useful after several
real modules expose a repeated build/configuration convention. One example is not
enough evidence.

The dependency shape is:

```text
app-service core ----\
                      -> narrow capability contract in packages/ports
component core ------/

runtime/host -> concrete capability module -> outbound infrastructure ports
             -> concrete adapters ---------> filesystem / SQL / remote systems
```

Application services and components import the contracts, not
`@lcase/artifacts`. `runtime` imports the concrete implementation and adapters.
The capability module itself may import types, ports, and functional-core rules,
but not app-service or component implementations.

## Construction And Consumption

### Local construction

For an embedded runtime, composition is a direct call graph:

```text
runtime
  -> creates FsArtifactStore
  -> creates PrismaArtifactRepository
  -> creates ArtifactWriter(store, repository)
  -> creates ArtifactContentReader(store)
  -> injects writer/reader ports into each consumer
```

There is no in-memory event bus or integration bridge merely to invoke the
capability. When both sides intentionally share the contract, runtime injects
the local implementation directly and no separate integration adapter is needed.

### Remote construction

If artifacts later run out of process, the consumer receives a remote adapter
implementing the same semantic port. A standalone artifact host constructs the
real module with its store and repository and exposes an inbound HTTP, RPC, IPC,
or command adapter.

```text
consumer -> ArtifactWriterPort -> remote client adapter
                                  -> transport
artifact host -> inbound adapter -> ArtifactWriter -> store + repository
```

Timeouts, serialization, correlation, authentication, and transport retries
belong in the remote adapters/host. The capability core still owns whether an
artifact write is complete and how its two durable writes relate. The local
implementation should not simulate network failure by default.

### Direct use versus wrappers

Both application services and components may consume a capability port directly
and identically. Tier membership does not require an application-service wrapper.

An application service should wrap or combine the capability when it adds an
external use case, such as request validation, authorization, HTTP-facing result
shaping, curation rules, or coordination with Flow/Sim records. A component
should receive only the narrow artifact reader or writer it needs. A component
must not call `ArtifactService` merely to reach artifact content.

## Failure-Mode Obligations

A capability module must own failures created by the relationship among its
dependencies. That is part of why the category exists.

Every capability module should define:

1. What successful completion guarantees.
2. The order in which independent effects occur and why that order is safest.
3. Which stages are idempotent and what a retry repeats.
4. Which partial states can remain after failure.
5. Whether it compensates immediately, retries, records work for reconciliation,
   or returns enough information for an operator/caller to recover.
6. Which failures are capability failures and which are transport/unavailability
   failures added by a remote adapter.
7. Tests for each dependency failing before and after every irreversible effect.

Do **not** define one universal `PartialFailure` result for every capability.
Partial success has domain-specific meaning. An artifact whose bytes exist but
whose metadata row does not is different from a permit that was acquired but
whose reply was lost. A common result shell such as `{ code, message, retryable }`
can be reused, but codes, recovery data, and success guarantees belong to each
capability contract.

Placement independence still requires transport failure to be representable.
A remote adapter should map a timeout or unreachable host into a documented
capability-level unavailable/timeout outcome, or into a deliberately separate
transport error channel. It should not leak raw `fetch` or broker exceptions, and
the local core should not pretend that those failures occurred.

## Case 1: Artifacts

### Current facts

[`Artifacts`](../../../packages/artifacts/src/artifacts.ts) currently implements one
large [`ArtifactsPort`](../../../packages/ports/src/artifacts/artifacts.port.ts). The
class combines:

- canonical JSON sorting, encoding, hashing, and format defaults
- content reads and writes through
  [`ArtifactStorePort`](../../../packages/ports/src/artifacts/artifact-store.port.ts)
- metadata reads and writes through
  [`ArtifactRepositoryPort`](../../../packages/ports/src/artifacts/artifact-repository.port.ts)
- metadata-aware format inference for `getAuto()`

The repository dependency is optional. That makes one class mean two materially
different things: a store-only content API in tests and a content-plus-metadata
API in production. It also makes `getAuto()` fall back to bytes whenever no
repository can supply a format, even when the stored content was JSON or text.

The production runtime always supplies both
[`FsArtifactStore`](../../../packages/adapters/src/artifact-store/fs-artifact-store.ts)
and
[`PrismaArtifactRepository`](../../../packages/adapters/src/artifact-repository/prisma-artifact-repository.ts)
through [`runtime.ts`](../../../packages/runtime/src/runtime.ts). Consequently, every
real `put*()`/`write()` call currently attempts both writes:

- Worker writes execution outputs and declared exports.
- `ArtifactService` writes uploads and curated artifacts.
- `SimService` and `startForkedSim()` write fork specifications.
- `FlowService`, through `addFlowToCas()`, writes flow definitions.

No production caller intentionally asks for an untracked blob. The store-only
success path is verified by tests, not by a real runtime use case.

The reads divide differently:

- Worker and all three Engine effects read content by a known hash and format.
- Flow, Run, Sim, and Eval application services also perform known-format reads.
- `EvalResultProjectionSink` is an additional content-only reader in
  Observability, so the prompt's consumer list was representative rather than
  exhaustive.
- Only `getAuto()` needs metadata to determine a content format.
- `ArtifactService` and `RunService` separately use artifact metadata for lists,
  curation, and run-parameter compatibility without needing content on those
  paths.

This is real interface-segregation evidence. Most execution-path consumers should
not receive metadata methods or a dependency whose read availability silently
depends on SQL.

### The write invariant

Current writes put bytes first and metadata second. The filesystem store is
content-addressed and treats an existing file as a successful idempotent write.
The Prisma repository uses an upsert and makes its nested curation updates atomic
inside SQL. The upsert prevents a duplicate row, but a full `Artifacts.write()`
retry currently creates a new `time` value and writes it back, so exact
idempotency is not yet defined. There is no transaction across filesystem and
SQL.

If the store fails, no metadata row is attempted. If SQL fails after the store
succeeds, an orphaned but valid CAS blob remains. `PutError` reports
`INDEX_PUT_FAILED` and includes the hash in `details`, but there is no compensation
or reconciliation path and many callers reduce the error to its message.

The order is reasonable: an orphaned content-addressed blob is safer than a
metadata row pointing to absent content. Deleting the blob as compensation would
also be unsafe without knowing whether identical content already existed or is
referenced elsewhere. The natural recovery is a metadata retry/upsert or a
reconciler, after deciding which metadata must remain stable across retries, not
distributed rollback.

The writer port should therefore define success as:

> Content bytes are durably addressable by the returned hash, and the required
> metadata record has been durably written.

A SQL failure after the CAS write should be a typed incomplete-write outcome that
preserves the hash and says whether retry/reconciliation is valid. The existing
`INDEX_PUT_FAILED` plus `details.hash` is the beginning of that shape, but the
guarantee and recovery semantics are not yet explicit.

### Recommended shape

Keep one physical `packages/artifacts` module, but split its provided interfaces
and implementation responsibilities:

```text
packages/artifacts
  artifact writer
    inbound:  ArtifactWriterPort
    outbound: ArtifactStorePort + ArtifactRepositoryPort
    owns: encoding, hashing, write order, success, incomplete-write policy

  artifact content reader
    inbound:  ArtifactContentReaderPort
    outbound: ArtifactStorePort
    owns: declared-format decoding and content-read errors

  optional metadata-aware reader, only when justified
    inbound:  ArtifactContentLookupPort
    outbound: ArtifactContentReaderPort + metadata lookup
    owns: format inference for an unknown-format read
```

The names are sketches, not an implementation decision. The stable decisions are:

- Do not split a logical artifact write into CAS and SQL calls at every consumer.
- Do not require SQL for known-format content reads.
- Do not preserve one broad `ArtifactsPort` merely because one class currently
  implements it.
- Do not split the code into separate npm packages until independent ownership,
  release, or composition provides a concrete reason.
- Make the writer's metadata repository required. Store-only construction should
  satisfy a reader/store use case, not silently weaken writer success.

The content reader is not merely an `Operation` over `ArtifactStorePort` because
execution-path consumers should depend on artifact semantics, not on the raw CAS
infrastructure contract. It is a stable provider surface used by several tiers,
owns decoding/error behavior, and may later be supplied by a remote artifact
adapter. A smaller action such as "load JSON through this reader and parse it as
a Flow" can still be an `Operation` over `ArtifactContentReaderPort`.

`getAuto()` has only one direct consumer today, `ArtifactService`. It can either
remain a small metadata-aware surface in the artifact module or be composed by
`ArtifactService` from metadata lookup plus the content reader. Do not add a third
port solely for structural symmetry. Extract it when its generic format-selection
policy or a second consumer justifies the boundary.

Likewise, this research does not decide whether metadata list/update methods stay
as direct repository dependencies of application services or become an
`ArtifactCatalogPort`. The writer invariant must not be bypassed, but a thin
repository-shaped pass-through with no additional policy would not qualify as a
capability merely because it is artifact-related.

### Consumers after the split

| Consumer                      | Narrow dependency                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Worker                        | Artifact content reader + artifact writer                                                                 |
| Engine                        | Artifact content reader                                                                                   |
| Observability eval projection | Artifact content reader                                                                                   |
| Flow/Run/Sim/Eval services    | Reader and/or writer according to the method                                                              |
| `ArtifactService`             | Writer, reader or metadata-aware lookup, and metadata/query dependencies needed by its external workflows |

`ArtifactService` remains useful. Its creation and curation methods validate an
external request against Flow definitions and coordinate metadata-facing use
cases. It wraps the artifact capability for those interactions. That does not
make it the mandatory gateway for Worker or Engine.

The capability boundary also does not absorb every later failure. For example,
`SimService.saveSim()` can successfully write an artifact and then fail to create
the Sim row. That cross-capability outcome belongs to the Sim application use
case. The artifact writer's narrower guarantee has already been satisfied.

## Case 2: `startForkedSim()`

[`createForkSpec()`](../../../packages/use-cases/run-flow/src/create-fork-spec.ts) is
a zero-I/O functional-core rule. `startForkedSim()` then:

1. creates a fork specification and run ID
2. creates an event emitter
3. writes the fork specification through `ArtifactsPort`
4. emits `run.requested` only if the write succeeds

Its use of both `ArtifactsPort` and `EmitterFactoryPort` does **not** make it a
capability module. The sequence is the caller-specific "start this forked
simulation" use case. It has no consumer-neutral provided port, independent
construction, or reusable failure policy. The current non-archived caller is
already `SimService`, whose broader method loads parent-run data before invoking
it.

The cleaner decomposition is:

```text
SimService/application use case
  -> pure createForkSpec(...)
  -> ArtifactWriterPort.write(...)
  -> RunSubmissionPort.submit(...)
```

The application use case owns the ordering and the outcome where the fork
artifact exists but run submission fails. The artifact writer owns only whether
the artifact itself was completely written. Engine owns run acceptance.

If several external entrypoints need the same forked-sim workflow, they can call
one application-service method. Reuse by multiple endpoints does not move an
external use case into a lower capability module.

This case therefore confirms the membership rule rather than expanding it:
multiple ports reveal orchestration, but responsibility decides where that
orchestration belongs.

## Case 3: Run Submission

The target path from the boundary research is:

```text
HTTP/CLI -> RunService -> RunSubmission port -> local or remote adapter
                                          -> Engine inbound port
```

A thin `RunSubmission` or `RunDispatch` abstraction is **not** a capability
module. It is one of these two ordinary port arrangements:

1. `RunService` owns an outbound submission port and an integration adapter maps
   it to Engine's inbound port.
2. Both sides intentionally share the same semantic contract, so runtime injects
   Engine's narrow inbound port directly.

In either arrangement, Engine owns acceptance and execution. A local adapter that
calls Engine directly and a remote adapter that serializes the same command are
adapters, not new capability cores. Adding a neutral pass-through would obscure
the owner.

The classification could change only if a real subsystem acquires independent
policy. A durable dispatcher that owns an inbox, deduplication state,
backpressure, scheduling, retries, and operational lifecycle would most likely be
a component. A bounded call-scoped coordinator with genuinely reusable policy
could become a capability module, but there is no such requirement today.

## Classification Summary

| Example                              | Classification                                        | Deciding reason                                           |
| ------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------- |
| JSON canonicalization/hash           | Functional core                                       | Pure deterministic rule                                   |
| Load artifact JSON and parse as Flow | Likely `Operation`                                    | Small reusable action over one reader port                |
| Artifact writer                      | Capability module surface                             | Owns one semantic write across CAS and metadata           |
| Known-format artifact reader         | Narrow capability module surface                      | Owns artifact decoding while avoiding metadata dependency |
| `ArtifactService.createArtifact()`   | Application service method                            | External validation and curation workflow                 |
| `startForkedSim()`                   | Application-service orchestration after decomposition | Forked-run use case owns the sequence                     |
| `RunSubmission` pass-through         | Component port/integration adapter                    | Engine owns terminal command semantics                    |
| Future durable run dispatcher        | Probably component                                    | Would own autonomous state, buffering, and lifecycle      |

## Costs And Benefits

This category buys:

- one owner for cross-resource success and partial-failure policy
- narrow dependencies for read-only and write consumers
- direct, typed local calls without requiring infrastructure simulation
- a stable semantic port that a remote adapter can later implement
- reuse by application services and components without either tier depending on
  the other's facade or implementation
- a place for technology-independent coordination that does not fit a pure rule,
  one-port helper, external use case, or autonomous component

It costs:

- more contracts and runtime wiring than a directly imported helper
- another package role that must be kept narrow
- explicit error and consistency design instead of relying on call order by
  convention
- interface migration away from broad ports such as `ArtifactsPort`

Those costs are justified for `Artifacts` because the policy and consumers
already exist. They are not a reason to manufacture capability modules around
every pair of ports.

## Proposed Taxonomy Rule

If this research is accepted, the durable rule should be:

> A capability module provides a cohesive, call-scoped application capability
> through narrow ports. Runtime constructs it from outbound ports. It owns the
> technology-independent semantics and failures created by coordinating those
> dependencies. Application services and components may consume its contracts
> directly; only runtime/hosts import its concrete implementation.

And the diagnostic sequence should be:

1. Can the behavior be pure? Put it in functional core.
2. Is it a small action over one caller-held port? Use an `Operation`.
3. Does an existing component own the requested behavior? Use its inbound port.
4. Is it one externally initiated use case? Keep it in an application service.
5. Does a consumer-neutral, call-scoped capability own durable policy across its
   dependencies? Use a capability module.
6. Does it instead own autonomous work, state transitions, and lifecycle? Make it
   a component.
7. Is it only translating technology? Make it an adapter.

## Open Decisions

This investigation supports the category and the artifact split, but does not
settle every implementation detail:

1. Final names and method shapes for artifact writer, content reader, and any
   metadata-aware reader ports.
2. Whether `getAuto()` remains a module surface or stays application-service
   composition until it gains another consumer.
3. Whether artifact metadata listing/update eventually deserves a
   capability-level catalog port or remains a direct repository dependency.
4. The exact typed outcome and reconciliation mechanism for CAS-success/SQL-fail
   writes.
5. Whether remote capability ports use one error union containing
   timeout/unavailable or a separate transport-error channel.
6. The migration sequence away from optional repository construction and the
   broad `ArtifactsPort`.
7. The follow-up ADR wording needed to add the role and qualify ADR-0005's
   one-port orchestration claim.
8. Whether the speculative `Operations` convention survives additional real
   examples after `runFlow()` is replaced or moved.

None of those uncertainties requires callers to split CAS and metadata writes,
route local artifact calls through a bus, or make components depend on
`ArtifactService` in the meantime.
