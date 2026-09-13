# Prove Swappable Infrastructure Initiative — Arc: Remote Worker (Changes C19–C25)

**Previous:** [SQL Adapter](./sql-adapter.md) (Changes C15–C18)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log. This Arc turns the
carrier-swap proof into the process-boundary proof the Initiative exists to
reach: Engine and Worker run as separate deployable applications while keeping
one Message protocol and shared durable infrastructure. It builds directly on
the carrier work in the [Queue Adapter Arc](./queue-adapter.md).

The existing HTTP JSON Message path is intentionally a minimum vertical slice.
It proves that the component boundary can stay unchanged when delivery moves
from in-process mailboxes to Redis Streams, but the `local-system` profile still
constructs Engine, Worker, and every handler in one process. This Arc first
separates the package responsibilities that would otherwise make a Worker
deployable install the whole system, then gives one logical subscription a
shared delivery lane across several topics, separates deployment topology
from process-local bindings, gives Observability one ordered Redis route, gives
Worker truthful lifecycle and ingress control, and finally runs the two roles
apart.

The seven Changes below are the current best review seams, not a quota. Before
each Change starts, its expected moved and changed lines should be inventoried.
If one is too large to review comfortably, split it at the named responsibility
boundary and renumber the unstarted work. C21 and C22 are one such split,
taken at the seam the original Change named. Do not preserve the current count
by combining unrelated behavior or by hiding a large mechanical move inside a
semantic Change.

## Target shape

Four scopes must remain distinct:

- The **system** is the complete product, including all application processes
  and shared infrastructure.
- A **deployment definition** declares the supported process roles, shared
  protocol topology, physical routes, and infrastructure configuration.
- A **process profile** constructs and validates one process's local object
  graph and binds only the handlers that process hosts.
- An **app** is one deployable executable. It loads configuration, creates its
  process profile, and owns signals, readiness, exit behavior, and packaging.

A deployment where every behavioral component runs elsewhere is therefore not
an "empty profile." It is a deployment definition plus the real process
profiles it names. If an API gateway or application-services process remains,
that process has its own profile even when it hosts neither Engine nor Worker.
The [deployment and process-profile scenario guide](../research/deployment-profile-scenarios.md)
shows the embedded, transitional remote-Worker, later gateway, and possible CLI
shapes without committing all of them to this Arc.

C21 and C22 build only the messaging-topology slice of that broader deployment
definition: catalog selections, delivery routes, Message host assignments, and
one shared carrier realization. SQL, object-storage, secrets, process-launch,
and other infrastructure configuration remain with application and deployment
configuration unless later work establishes a broader shared deployment layer.

The target package ownership is equally narrow:

- `@lcase/assembly` owns `ManagedResource` and generic ordered lifecycle,
  rollback, health, and shutdown mechanics. It imports no application
  components or concrete adapters.
- `@lcase/message-router` owns active in-process and log-backed router hosting,
  delivery-lane and mailbox machinery, process-local binding checks, and
  carrier-compatibility checks. Its log-backed code depends on `MessageLogPort`,
  not a concrete Redis client.
- `@lcase/message-topology` owns dependency-clean product protocol declarations,
  deployment manifests, process host plans, delivery-route identities, and
  their pure static validation. It imports no application components, process
  profiles, concrete adapters, or executable graphs.
- `@lcase/profile-local-system` owns
  the complete embedded graph, its supported concrete providers, and
  `assembleEmbeddedSystem()`. It exists because HTTP server and CLI both use
  that graph.
- `apps/worker-host` owns its initial Worker-host profile because only that app
  uses it. The `api-engine-observer-host` profile for the first remote proof
  likewise remains local to its executable; initially it retains application
  services, Engine, Observability, Limiter, Replay, and other behavior not yet
  split out.
  Preserve `@lcase/profile-local-system` as the complete embedded graph; do not
  add a local/remote Worker placement switch to it. Promote either app-local
  profile only when a second real executable needs the same composition policy.
  A CLI acting only as a thin HTTP client is not such a consumer.

`@lcase/runtime` does not retain a special architectural meaning. If moving the
responsibilities above leaves it empty, remove it. Renaming the existing broad
package without narrowing its dependency closure would not achieve the goal.

Messaging topology has three corresponding static layers:

1. A **protocol catalog** defines stable topic and logical-subscription
   identities and their exact Message types.
2. A **deployment manifest** selects the catalog entries used by one deployment
   and maps them to physical carrier routes.
3. A **process host plan** names that process role's publisher permissions and
   assigned subscriptions; the process profile binds concrete local handlers
   against that data.

Deployment validation can reject an enabled subscription assigned to no
process role. A process profile can reject a subscription assigned to that host
without a local handler. Neither can prove that another process is running;
remote liveness belongs to deployment health and operations. This replaces a
non-enforceable `remote: true` option with explicit ownership.

A topic represents a durable delivery conversation, not mechanically one per
event type, mailbox, or Redis stream. The current HTTP JSON command and
terminal outcomes are the first Worker-job conversation. Future job protocols,
including MCP if its semantics fit, can extend that catalog without creating a
stream per lifecycle event.

Observability is one logical subscription over the explicit topics it
records. Locally, its selected Messages should enter one serial ingestion lane
so their observed order can settle consistently instead of being divided among
per-event mailboxes. C23 gives the migrated HTTP-job Messages one ordered
physical Redis observation route rather than accepting a nondeterministic merge
from their work streams. Components still publish once; router admission fans
the same occurrence out to its work and observation routes. The first version
uses Redis transaction-style admission for the controlled happy path and leaves
reconciliation, retries, and broader event-family migration explicit for later.

## Change C19 - Separate assembly, message-router, and local-system profile ownership - merged (PR #378)

### Discussion

This Change is a behavior-preserving package-boundary move. The current
`packages/runtime` contains roughly 4,200 TypeScript lines across source and
tests, so the line count may look large even when most edits are moves. Review
size should be assessed from rename-aware diff statistics and the amount of
changed behavior, not raw additions and deletions alone. If the real inventory
still exceeds a comfortable review, split lifecycle extraction from messaging
and profile extraction before implementation begins.

Move responsibilities to the nearest demonstrated owner:

- create `@lcase/assembly` for generic managed-resource types and lifecycle;
- create `@lcase/message-router` for generic routers, mailboxes,
  log-backed hosting through `MessageLogPort`, and reusable topology checks;
- create `@lcase/profile-local-system` for configuration, provider builders,
  the complete embedded graph, and `assembleEmbeddedSystem()`;
- repoint `apps/http-server` and `apps/cli` at the shared local-system profile;
  and
- remove `@lcase/runtime` if no coherent responsibility remains.

The Change must not alter which components the existing apps host, which
providers their three config axes select, how their Messages are routed, or the
order and guarantees of lifecycle operations. Existing unit, integration, and
end-to-end checks move with their owners and remain green for both messaging
carriers and both SQL and artifact-store branches.

The current protocol declarations may move with the local-system profile
temporarily if it is still their only honest owner. C20 first settles their
multi-topic shape; C21 then uses the second host as evidence for promoting
shared protocol and deployment declarations to `@lcase/message-topology`.
This avoids designing a supposedly generic package around one product topology
while still preventing generic router code from depending on the whole profile.

Do not split `@lcase/adapters` pre-emptively in this Change. A Worker host is
expected to need its Redis Streams, S3, and Postgres implementations, so the
present grouping may not inflate that artifact materially. C25 must inspect the
actual deployable dependency closure; only observed unrelated dependencies are
evidence for a further package split.

**Inventory, measured 2026-09-10 before starting.** The 4,197 lines split by
owner as follows, and the conclusion is that this can stay one Change: the
dependency cut already exists in the source tree, so the work is relocation plus
package scaffolding rather than untangling.

| Owner                | Approx lines |
| -------------------- | ------------ |
| Generic assembly     | 370          |
| Generic messaging    | 2,070        |
| Local-system profile | 1,740        |

- **`src/messaging` imports only `@lcase/types` and `@lcase/ports`** besides its
  own siblings. Nothing there reaches into `config`, `profiles`, or `worker`, so
  the largest slice is a straight lift.
- **The generic assembly kernel imports nothing but its own siblings.** The one
  file in that directory reaching outward is `assemble-embedded-system.ts`, which
  ADR-0008 already assigns to the profile. The import graph confirms that
  assignment rather than it being a matter of taste.
- **The product-shaped tests go with the profile, not with messaging.** The two
  HTTP-job slice tests and `tests/helpers/http-job-graph.ts` import Engine,
  Worker, and the observability tap; they move alongside `http-job.topology.ts`.
  Leaving them in the generic package would put exactly the three components its
  completion evidence disclaims into that package's test dependencies. Dev
  dependencies do not ship, so this is about what the package is for rather than
  about deployability.
- **Extract assembly first and get it green before touching messaging.** It is
  370 lines with no dependencies, so any friction in the new package scaffolding
  surfaces on the cheap one instead of inside the large move.

**Completion evidence.**

- Package dependency direction makes `@lcase/assembly` and generic messaging
  installable without Engine, Worker, application services, Observability,
  Replay, Limiter, or concrete adapters.
- The HTTP server and CLI still compose the same `local-system` graph through
  the new profile package.
- `@lcase/runtime` is gone, or any retained package has one explicitly named
  responsibility that is not already owned elsewhere.
- Workspace build, typecheck, lint, unit, and relevant integration suites are
  green, with one existing flow exercised over both in-process and Redis
  carriers.

### What actually landed

`@lcase/runtime` is gone. Three packages replaced it under a new
`packages/process-hosting/` folder, and the two generic ones have **no
production dependencies at all** -- not a short list, an empty one.
`pnpm list --prod --depth=Infinity` returns nothing for either. That is the
claim this Change existed to make, and it is checkable rather than asserted.

The folder is organizational, the same way `packages/components/` is: it gives
the packages involved in composing and running one process a home, and it is
where a Worker-host profile lands in C25 rather than sitting beside unrelated
domain packages.

| Package                       | Lines | Production dependencies |
| ----------------------------- | ----- | ----------------------- |
| `@lcase/assembly`             | 383   | none                    |
| `@lcase/message-router`       | 2,095 | none                    |
| `@lcase/profile-local-system` | 1,767 | 16                      |

- **The inventory held, and no behavior changed.** Every edit was a move, an
  import specifier, or new package scaffolding. The three risks named before
  starting -- Turborepo's task graph, `tsconfig.base.json` depth, and the profile
  test's working-directory assumption -- all turned out to be non-events.
- **Every real problem was the same one: tests that moved up a directory level.**
  Four files kept a `../` that had been correct at the old nesting and pointed
  one level too high at the new one. The compiler caught all four. Worth knowing
  because it is the only class of error a rename-aware diff will not show as
  suspicious.
- **`@lcase/message-router` needed no `redis` dependency, as predicted.** The
  log-backed router already took a factory for its log and named only
  `MessageLogPort`; the concrete client is still constructed on the profile side.
  The property the arc asks for was already true and only had to survive the
  move.
- **`assembleEmbeddedSystem` moving to the profile was the one non-mechanical
  call, and the import graph made it.** It names the router type and the portable
  SQL client, so it could not have come to a dependency-clean assembly package
  without dragging both behind it. ADR-0008 had already assigned it there;
  the imports confirmed the assignment rather than the other way round.
- **The worker's architecture test kept its meaning.** It banned `@lcase/runtime`
  by name, which would have become an inert entry for a package that no longer
  exists. It now bans the two new package names instead.
- **Verification.** Workspace `build` 28/28, `typecheck` 27/27, `lint` 27/27,
  unit `test` 26/26, integration green across all three packages, prettier clean.
  A two-step flow with a param and a chained export ran end to end through
  `apps/http-server` on the default branches, and the Redis vertical slice still
  passes, which covers the other carrier.

## Change C20 - Support multi-topic logical subscriptions through one delivery lane - merged (PR #379)

### Discussion

A logical subscription represents one durable consumption purpose, not one
topic mechanically. The current representation forces Observability's
interest in Worker-job commands and terminal outcomes into two subscriptions
with two independent lanes. Locally, that permits a later Message to overtake
an earlier blocked Message even though both belong to one observation purpose.

Allow one logical subscription to select a non-empty, explicit set of
topics. Its handler accepts the exact union of the Messages those
topics carry, while one binding owns one delivery lane and one aggregate
`maxInFlight`. Do not add wildcard subscriptions or event-family matching.

Both carriers must preserve that single logical-lane boundary:

- in-process delivery registers the same lane for every selected topic,
  so `maxInFlight: 1` preserves handler start and settlement order across local
  enqueue order; and
- Redis delivery may read each selected stream independently, but every reader
  feeds one local lane and shares the subscription's aggregate concurrency
  limit.

A Redis consumer group remains scoped to one stream. Reusing the logical
subscription ID as the group name on several streams does not create one
cross-stream checkpoint or total order. The guarantee is therefore serialized
handler invocation in local lane-enqueue order, not reconstructed causal order
between streams.

Merge the two current HTTP-job Observability subscriptions into one
multi-topic subscription and one serial local ingestion lane. Preserve
independent admission to the Engine/Worker work subscription and the
Observability subscription. `ObservabilityTap` remains a normal awaited handler;
Observability must not become a side effect of another component's delivery.

Keep the current single-host topology ownership temporarily intact in this
Change. Do not introduce deployment manifests or host plans at the same time as
changing subscription cardinality. Also exclude a multi-stream
`MessageLogPort`, one physical observation stream, multi-route publishing,
atomic fanout or reconciliation, ordering against legacy `EventBusPort` ingress,
and retry or recovery behavior. C21 first introduces neutral route mappings;
C23 then owns the ordered Redis observation route and transaction-style fanout.
Those guarantees do not belong in this Change.

**Inventory, estimated from the
[C20–C21 seams research](../research/c20-deployment-topology-and-host-bindings.md)
before implementation.** The relevant existing files total approximately 2,692
lines, but expected semantic churn is 320–520 changed or new lines. If the
roughly 100-line subscription mailbox becomes a carrier-neutral delivery lane,
review that work as a rename plus a focused behavioral change rather than as a
delete and rewrite.

| Responsibility                          | Expected changed/new lines |             Expected moved lines |
| --------------------------------------- | -------------------------: | -------------------------------: |
| Port cardinality and catalog assertions |                      30–50 |                                — |
| Shared lane and carrier adaptations     |                    105–180 | 80–100 if the mailbox is renamed |
| Existing topology/profile updates       |                      20–35 |                                — |
| Unit, type, and slice tests             |                    125–205 |                                — |
| Mechanical fixture updates              |                      40–50 |                                — |
| **Total**                               |                **320–520** |                        **0–100** |

**Completion evidence.**

- A logical subscription selects more than one explicit topic, and its
  handler type accepts exactly their Message union while rejecting unrelated
  Messages.
- Empty, duplicate, and undeclared topic selections fail loudly.
- One in-process binding receives both selected topics exactly once; with
  `maxInFlight: 1`, a blocked first delivery prevents the second from starting.
- Redis readers for distinct selected streams feed one handler and share one
  concurrency limit. Tests do not claim which stream wins a race.
- The Worker-job slice retains independent work and observation delivery while
  Observability uses one logical subscription and one local lane.
- Existing in-process and real-Redis vertical slices remain green without
  claiming cross-stream or legacy-event order.

### What actually landed

`Publication` was renamed to `Topic` and `LogicalSubscription` to
`Subscription`, matching the Google Cloud Pub/Sub and Azure Service Bus pairing
for this same relationship. Logical is the default here and a route is what
wires it up, so neither name carries the qualifier. Prose may still say
"logical subscription" where the distinction is the point.

**The Redis delivery lane may be scaffolding, and whether C23 retires it needs
its own research rather than being assumed either way.** Its job there is to
hold one concurrency bound across the several readers a multi-topic subscription
needs, because Redis has no primitive for that: a consumer group distributes
across consumers, not within one. It also fits that carrier only partly, which
is what raises the question. The microtask deferral that prevents re-entrancy
in-process is inert off the wire, and the Redis binding passes a no-op for the
lane's idle bookkeeping.

The case for retiring it is that once C23 gives Observability a single ordered
observation route, every subscription reads exactly one stream and the
cross-reader coordination has no users left.

The case against is stronger than it first looks, and at least these three
points should be weighed before anything is removed:

- **It would undo the `readCount` split.** Without a lane, concurrency comes
  back from awaiting the read batch as a whole, so the batch size becomes the
  concurrency bound again. That is exactly the conflation C20 separated, and it
  cannot hold alongside a `readCount` that is free to exceed `maxInFlight`.
  Keeping both would mean reintroducing a semaphore, which is a lane with fewer
  features.
- **One reader per subscription is a property of C23's presets, not of the
  representation.** A subscription selecting topics that map to different routes
  brings the readers back, and that is precisely what Observability is today.
- **The retire hook and its ordering would have to move.** Acknowledging only
  after a handler settles is currently the lane's contract, and the Redis path
  would have to re-establish it.

The research should also say what replaces the lane if it goes, rather than
leaving "restore the previous loop" implicit, since the previous loop predates
both the `readCount` split and multi-topic subscriptions.

The lane serializes Redis deliveries; it does not order them. Separate streams
have separate group instances and cursors, so the in-process slice asserts
observation order while the Redis slice deliberately does not. C23 is what makes
that order real.

`readCount` is named separately from `maxInFlight` even though it defaults to
it. The first decides how many entries a consumer claims responsibility for, the
second how many handlers run at once. Nothing reclaims a pending entry, so
claiming more than the lane can work through only widens the window a crash
loses.

## Change C21 - Declare deployment topology as standalone static data - merged (PR #380)

### Discussion

The current `MessageRouterTopology` is sufficient while one profile declares
the full subscription graph and binds every handler. It cannot honestly
describe a distributed deployment: either the Worker process would need Engine
and Observability handlers it does not host, or a locally valid partial topology
could silently disagree with its peers about logical identity and physical
routing.

ADR-0007 stays Proposed through C21 and C22 rather than being accepted first.
It specifies the three-layer topology these Changes build, but it was written
before any of it existed, and the intent is to let the implementation find the
real seams and then revise the ADR against them. Treat this Arc as
authoritative wherever the two disagree, and revisit 0007 once C22 lands.

Fixing that is two Changes, split at the seam between describing a deployment
and consuming one. C21 builds the static shapes, their validation, and the
deployment presets. C22 makes the routers, carriers, and the local-system
profile read them. The split is a review seam, not two independent goals: C21
lands with nothing consuming a manifest, so the embedded profile still composes
from `MessageRouterTopology` until C22 replaces that path.

Use the dependency-clean `@lcase/message-topology` package to separate four
static shapes:

1. a protocol catalog declares stable topics and logical subscriptions;
2. a delivery-route binding maps one
   `(topic, logical subscription)` edge to a carrier-neutral route ID;
3. a deployment manifest selects enabled catalog identities, holds all route
   bindings and role assignments, and selects one shared carrier realization;
   and
4. a process host plan names one role, the topics it may emit, and the
   subscriptions it must serve.

The edge-to-route mapping is important even though this Change retains one route
per topic in the working presets. C23 uses it to send one topic to both its
work route and a shared observation route without changing the manifest
shape. A component still receives a topic-bound publisher and does not see
subscriptions, consumer identities, or process roles; the router derives its
route set from the manifest.

Carrier family and namespace or key derivation are selected once for the
deployment and consumed by every host. Redis endpoints, credentials, and
consumer-member names remain process configuration. Do not add carrier-shaped
records to every route until a real carrier needs externally fixed names,
partitions, retention, mixed-carrier routing, or other non-derivable policy.

One deployment manifest contains the complete set of cooperating roles. A host
plan is not coupled to a particular counterpart plan and does not construct a
component graph. Real deployment presets must name only roles and conversations
they actually support.

Name a role for what it hosts, enumerated explicitly. A role is never named for
being the remainder, so there is no `main-host` and no
`companion-non-worker-host`. The transitional deployment's non-Worker role
hosts the HTTP API, Engine, and Observability, so that is its name. A role that
later loses Engine is then a different role in a different deployment rather
than the same `main-host` quietly meaning less than it did:

```
deployments/
├── local-system
│   └── local-system            # hosts the complete embedded graph
├── remote-worker               # transitional deployment
│   ├── api-engine-observer-host
│   └── worker-host
└── distributed-system          # later deployment, not built here
    ├── gateway-host            # HTTP routes and application services only
    ├── engine-host
    ├── worker-host
    └── observer-host
```

C21 builds the first two deployments. The third is shown to fix the naming
convention against a case where the remainder role no longer exists, not to
commit the shapes to this Arc.

Promoting the catalog is the point at which its identities are renamed, so do
it once here. The conversation becomes `job` rather than `http-job`: it is the
channel for Worker jobs, not a channel for one capability, and an `mcp` job
belongs on the same topics rather than on a parallel set. Topic and
subscription identities lose the `http-` prefix with it. The type unions stay
the enforcement, so adding an `mcp` submitted type to `JobCommandType` without
listing it on the topic still fails to compile. Subscription IDs are Redis
consumer-group names, so a development instance keeps orphaned groups under the
old IDs, exactly as C20's rename did. Event type strings do not move: the
existing `job.httpjson.*` taxonomy names the capability and is matched against
real schemas, and renaming a conversation is not a reason to disturb it.

Name the manifest and host-plan types with a `Messaging` prefix. Both cover
only the messaging slice, and the unqualified names belong to a real deployment
layer if one ever arrives. The package name does not qualify them where they
are read, which is inside a profile.

`@lcase/message-topology` sits under `packages/process-hosting/` beside the
router it feeds. Declaring topology and validating a deployment are part of the
same general mechanism as hosting one, even though this package hosts nothing
itself. `defineTopic`, `defineTopicFor`, and `defineSubscription` move into it
from `@lcase/message-router`, along with the declaration-level assertions over
unique identities and non-empty declared selections. No production code in the
router calls those helpers today, only its tests and the profile, so the router
keeps its empty production closure and gains a devDependency. It stops
re-exporting them from its barrel. The process-local checks stay where they
are: canonical binding resolution and sealing remain router concerns, and C22
is what replaces sealing with exact equality against a host plan.

Validate at the boundary where each claim can be known. C21 owns the two claims
a deployment definition can settle on its own:

- protocol declarations have unique identities, and subscriptions select
  non-empty, declared topic sets; and
- deployment values contain only enabled identities, bind every enabled logical
  delivery edge exactly once, invent no edge, assign every enabled subscription
  to exactly one role, and contain unique role and route identities.

The complete catalog-to-manifest assertion belongs at the deployment-definition
boundary or in its tests and preflight. A running process consumes the shared
ID-based manifest and imports only the conversation declarations it publishes
or handles. The manifest module must not runtime-import the aggregate catalog
and thereby pull unrelated protocol modules into every host.

This Change does not add external manifest loading, a placement compiler,
dynamic role registries, mixed carriers, remote liveness, replica enforcement,
Worker lifecycle, application entry points, or delivery hardening. It also
changes no router, carrier, or profile behavior; that is C22. Do not shrink the
validation matrix or pull router adoption forward to make this Change feel
complete on its own.

**Inventory, estimated from the
[C20–C21 seams research](../research/c20-deployment-topology-and-host-bindings.md)
before implementation.** Expect 390–615 semantic changed or new lines plus
100–140 rename-aware moved lines, before the `job` rename, which moves further
files without changing their contents. The upper range reflects the negative
validation matrix, not a target to fill.

| Responsibility                                                               | Expected changed/new lines | Expected moved lines |
| ---------------------------------------------------------------------------- | -------------------------: | -------------------: |
| Static data shapes, deployment assertion, host derivation, and focused tests |                    300–455 |                    — |
| Shared job catalog and package scaffolding                                   |                      20–40 |              100–140 |
| Embedded and remote-Worker manifest values and tests                         |                     70–120 |                    — |
| **Total**                                                                    |                **390–615** |          **100–140** |

**Completion evidence.**

- `@lcase/message-topology` imports no components, profiles, adapters, router
  implementations, or executable graphs.
- Embedded and remote-Worker manifests use one shared job catalog and derive
  their host plans rather than copying identities between processes.
- A synthetic four- or five-role fixture proves that the representation is not
  limited to one companion/Worker pair, including a role with no Message
  subscriptions.
- Deployment validation rejects missing, duplicate, invented, and unassigned
  edges or subscriptions.
- The `http-job` conversation is renamed in one sweep, and the existing
  in-process and Redis slices still pass unchanged in behavior.

### What actually landed

`@lcase/message-topology` exists under `packages/process-hosting/` with three
entry points rather than one. That split was not planned and is the one
structural surprise. The declaration assertions are called by both carriers at
runtime, so moving them makes the router depend on this package for real. With
a single barrel that dependency would have pulled the job topics into the
generic router, which is the coupling the package exists to prevent. So the
root is the generic layer, `/catalogs` holds the conversations, and
`/deployments` holds the presets. `@lcase/message-router` therefore gained one
production dependency instead of the planned devDependency; its closure is
still effectively empty, because the package it now depends on has none of its
own.

Review settled the vocabulary, which took more argument than the shapes did. A
role holds `publishesTo` and `consumesFrom`, because in the Topic and
Subscription model you publish to a topic and consume from a subscription. The
verbs are symmetric while what they hold is not, and that is the point: a
publisher names a topic and never a consumer list, which is what lets two ends
of one conversation live in different processes. The host plan keeps both verbs
rather than renaming them for its richer entries, so a role and its plan read
side by side without translation.

A manifest holds `topicIds` and `subscriptionIds`. The bare plurals belong to
`MessageCatalog`, where they hold declarations rather than references, and
`assertManifest` is the function with both in scope at once. That is where
identical names holding `Topic` objects on one side and strings on the other
would have bitten.

`PlannedSubscription.topicRoutes` names a new `TopicRoute`, the recurring pair
of a topic and the route carrying it. The Redis router's `BoundReader` already
mirrors it at runtime by pairing a topic ID with a stream key, which is what
suggested the pair was the real unit. Its counterpart stays bare `routeIds`,
since a publisher entry is already scoped to one topic.

`PlannedPublisher` is the one name left unsettled. There is no static publisher
anywhere for it to correspond to, and the record is closer to a publish
permission than to a publisher.

Catalogs and deployments are siblings rather than the presets nesting under the
job conversation. A deployment is of the whole system: `local-system` enables
only job identities today purely because that is the only migrated
conversation, and it gains run and step identities without moving file.
Catalogs are organized by protocol family, mirroring
`packages/types/src/events/`, so adding an event type touches one folder on
each side. Grouping commands, lifecycle, and telemetry onto shared physical
streams stays a routing question, answered by route IDs in a manifest rather
than by how these modules are arranged.

`canonicalSubscriptionFor` and `assertTopologySealable` stayed in the router as
planned, so what moved is exactly the declaration-level half.

The embedded deployment ships as two manifests, `local-system-in-process` and
`local-system-redis`, built from one shared role and route base. Carrier family
belongs to the deployment while endpoints stay process configuration, so the
existing `messaging.kind` config axis becomes a manifest selector in C22 rather
than a separate switch. A test asserts the two differ in exactly one field.

Route IDs equal topic IDs in every shipped preset, which is what will let C22
adopt routes without changing a Redis stream key or stranding a consumer group.
A test pins that equality, and names C23 as the Change that deliberately breaks
it.

The rename reached further than the topology. Engine's `httpJobCommands` and
`handleHttpJobTerminal` and the `EnginePort` declaration were renamed too,
because Worker already called its own union `JobTerminalType` and Engine was
the inconsistent side. The httpjson-specific test fixture kept its name: the
conversation generalizes and that fixture does not. Event type strings were not
touched.

Two things were deliberately left open. The rename made it visible that
`JobTerminalType` is now declared identically in Worker and in the catalog with
nothing proving the two agree; Worker cannot import the catalog, so this is
recorded in `docs/todo.md` rather than patched. And nothing yet consumes a
manifest, which is the point: the profile still composes from
`MessageRouterTopology`, and the unchanged slice tests are the evidence that
C21 changed no delivery behavior.

## Change C22 - Bind each process to its host plan rather than the full topology - in review

### Discussion

C21 leaves a deployment description that nothing reads. This Change makes the
routers, both carriers, and the local-system profile consume it, and is what
actually removes a process's need to know the whole graph.

The two remaining validation claims are the ones only a running process can
settle:

- a selected process may resolve only publishers allowed by its host plan and
  bind only canonical subscriptions assigned to it; and
- process sealing requires exact equality between planned and locally bound
  subscription IDs. Missing and extra bindings both fail, while subscriptions
  assigned to other roles are irrelevant to that process.

Preserve the embedded deployment as one complete host plan. Reject an
in-process realization unless every enabled Message publisher permission and
subscription assignment belongs to the selected host, and every enabled topic
has a local publisher permission. That prevents a split manifest from sealing an
object-only graph that silently drops remote destinations.

That rejection is a deliberate restriction of the current deployment model, not
a limit of the representation, and it should say so where it fails. A
deployment picks one carrier for everything, and the manifest encodes that by
selecting one shared carrier realization. Nothing in the shapes forbids a
finer choice: routes are already keyed per delivery edge, so a per-conversation
carrier would live there. Supporting that is not planned. The embedded preset
also remains a singleton process assumption; topology data cannot prove how
many OS processes an operator launched.

The Redis carrier must likewise reject a topic whose delivery edges
resolve to several routes until C23 adds multi-route admission. It must reject
route layouts a grouped log cannot realize without filtering. These are
carrier-capability failures, not restrictions in the neutral topology
representation.

**Those two checks are also where the `message-router` and `message-topology`
split gets tested, so decide during this Change whether it still pays.** C21
left the two packages with a real production dependency in one direction, and
the protection originally claimed for the boundary is actually supplied by
`message-topology`'s separate entry points: a merged package with the same
`/catalogs` subpath would keep product topics out of a generic router just as
well, and would have the same empty production closure. What the split does buy
is a compiler-enforced direction, since a static declaration cannot import a
carrier. That is worth something while this Arc's whole subject is boundaries
that hold, and it costs five config files.

Carrier-capability checks are the strain. They read manifest and host-plan
shapes and judge them against what a grouped log can do, so they sit on the
seam. If they end up wanting to live in both packages, or needing a round trip
between them, the boundary has stopped paying and merging is the answer. Note
also that `MessagingCarrierKind` already leaks the wrong way: the static layer
enumerates the carrier families, so a third carrier means editing topology. It
is not an import, so the direction holds, but it is the weakest point in the
current split and worth re-reading before deciding.

This Change does not add Worker lifecycle, application entry points, remote
liveness, or delivery hardening. Although the manifest makes every Redis
route/group pair derivable, provisioning and the publisher-before-group startup
race remain remote-host startup work and must be settled in C25 before that
host accepts external intake.

**Inventory, estimated from the
[C20–C21 seams research](../research/c20-deployment-topology-and-host-bindings.md)
before implementation.** Expect 225–380 semantic changed or new lines.

| Responsibility                                                       | Expected changed/new lines | Expected moved lines |
| -------------------------------------------------------------------- | -------------------------: | -------------------: |
| Exact router binding/publisher checks and carrier-plan adaptation    |                    130–210 |                    — |
| In-process compatibility and Redis route-capability checks and tests |                      50–90 |                    — |
| Local-system profile and slice adaptation                            |                      45–80 |                    — |
| **Total**                                                            |                **225–380** |                    — |

**Completion evidence.**

- Process validation rejects missing, extra, or counterfeit local bindings and
  unauthorized publisher resolution.
- The embedded host plan still binds and routes the complete graph over both
  carriers, while a split host plan seals without importing or binding remote
  component handlers.
- A split deployment paired with the in-process carrier fails at startup rather
  than silently producing disconnected mailboxes, with an error naming the
  one-carrier-per-deployment model as the reason.
- Every process derives compatible route identity from the same deployment
  definition, while no component imports topology, carrier, Redis, mailbox,
  consumer-group, or deployment-manifest mechanics.

### What actually landed

A host plan holds IDs so a process can read a manifest without importing
protocol families it takes no part in. Both carriers need `Topic.types` --
publish-side to refuse a foreign Message, which is what makes the one cast each
of them performs on delivery sound, and Redis read-side for `BoundReader`. Those
live only in a catalog, and `assertManifest` proves a manifest agrees with one
without copying anything out of it. So a third static shape was needed:
`ResolvedHostPlan`, produced by `resolveHostPlan(plan, catalog)`, mirroring the
plan field for field with the declaration swapped in where the ID was. The
manifest stays IDs; the join happens once, carrier-neutrally, in the one place
both halves are in scope.

That join is also where the declaration checks moved. `assertDistinctTopics` and
`assertDeclaredSubscriptions` no longer run inside each carrier on whatever it
was handed. The error worth having is the first direction of the check: a host
assigned a subscription whose protocol module it never imported now fails naming
the missing declaration, where before the same mistake surfaced much later at
`seal()` as a consumer nobody wired.

**The package split holds, and for a different reason than expected.** The
carrier-capability checks were the predicted strain and produced none: the
plan-to-carrier join is carrier-neutral by construction, and the in-process
restriction turned out to be a manifest predicate. Meanwhile the two assertions
were the only values `message-router` imported from `message-topology`, so
absorbing them left nothing but types -- and the production dependency C21
introduced went back to a devDependency. The two packages now share types and no
runtime code at all. What the boundary buys remains compiler-enforced direction
rather than independent consumers: nothing in the repo reads topology without
also building a carrier, and nothing planned will. The signal to revisit is a
consumer that does -- preflight validation, a deployment linter, a diagram
generator.

The in-process compatibility check was the structural surprise. The Change
description assumed a carrier would make it, and a `ResolvedHostPlan` cannot: it
names no role but its own, which is the property that lets two ends live in
different processes. It is a manifest question, and for a manifest
`assertManifest` has accepted it collapses to `roles.length === 1` -- every
enabled subscription is already assigned to exactly one role and every enabled
topic already has a publishing role, so one role means both belong to it. It
runs in the profile where a carrier choice and a manifest are both in scope,
before a router exists.

One guarantee had to change owner rather than disappear. `seal()` used to reject
a topic nothing subscribes to, which cannot stay local once roles split -- a
Worker host publishes terminals and consumes none of them. Nothing in
`assertManifest` covered it either, since its edges are built by iterating
subscriptions, so a topic nobody selects contributed no edge and passed every
route check. It is now a deployment-level loop paired with the existing
publisher one: a topic nobody may publish can never start, a topic nobody
consumes can never arrive.

Exact equality is enforced at two points rather than one. A binding this role
was not assigned is refused at `bind()`, so it cannot reach `seal()`, which
leaves `seal()` with the only claim nothing earlier can see. Publish permission
deliberately has no counterpart there: an unused permission is legitimate where
an unbound subscription is not, and that asymmetry is commented rather than left
to read as an oversight. Canonicalization also grew past selection to compare
the Message types each selected topic declares, since a same-ID topic carrying a
wider list would otherwise widen what a lane accepts.

Stream keys are derived from the route ID rather than the topic ID, and
`ensureStream` narrowed from every topic in the deployment to the routes this
role publishes -- safe because `ensureConsumerGroup` passes `MKSTREAM`, so a
consumer provisions its own stream. A real Redis run produced byte-identical
stream keys and consumer group names to a run recorded before the Change, which
is the direct evidence that no dev data was stranded. The Redis carrier now
refuses a topic resolving to more than one route, which is a carrier capability
rather than a limit of the representation: the plural is legal in the plan, and
C23 is what teaches this carrier to admit it.

Carrier tests build a single-role deployment through `assertManifest`,
`hostPlanFor`, and `resolveHostPlan` rather than hand-building a resolved plan,
so a carrier is only ever handed something the projection could actually emit.
Five tests migrated to `@lcase/message-topology` with the checks they cover. The
slice tests kept their assertions, which is again the evidence that delivery
behavior did not move.

## Change C23 - Add one ordered Redis route for Observability - not started

### Discussion

C20 gives Observability one logical subscription and one local delivery lane,
but its Redis realization still reads the command and terminal work streams
independently. That serializes whatever reaches the lane first without
preserving the causal order that already existed when the Messages were
published. Treat that as an intermediate carrier shape, not the final remote
Observability contract.

After C21 makes delivery edges and physical routes explicit and C22 makes the
carriers honor them, map both migrated
HTTP-job observation edges to one Redis observation route while preserving the
independent routes that drive Worker and Engine:

```text
command topic
├── Worker work route
└── observation route

terminal topic
├── Engine work route
└── observation route
```

A component still publishes one Message once. The router derives every required
destination from the deployment topology and admits the occurrence to its work
and observation routes. For the first Redis implementation, use
[transaction-style](https://redis.io/docs/latest/develop/using-commands/transactions/)
multi-route append so another client cannot consume the work entry between the
work and observation writes. Check every transaction result and fail publishing
loudly when admission is not confirmed. The exact passive port shape must be
planned before implementation; do not leak a Redis client into generic router
code or describe two sequential `publish()` calls as one atomic admission.

The observation route has one group for the existing logical Observability
subscription and one reader feeding its existing serial delivery lane and
`ObservabilityTap`. Do not create a group per Message type or replace the Tap's
application-level sink fanout with transport groups in this Change. Additional
groups remain available later if event history, metrics, alerting, or another
observer becomes an independently deployed consumption purpose.

Reaching one reader per subscription is also what raises the open question of
whether the Redis carrier still needs a delivery lane at all. Keep the lane in
this Change. C20's record lists the arguments on both sides, including that
removing it would undo the `readCount` split; retiring it is separate work that
should follow its own research rather than riding along here.

Keep this Change narrow. It covers the migrated HTTP-job Messages and the
controlled Redis happy path. It does not add reconciliation after ambiguous
failure, retry, exactly-once delivery, Redis Cluster policy, wildcard
observation, redaction, new event-family migrations, or ordering against legacy
`EventBusPort` ingress. Existing content-addressed artifact references continue
to keep large payloads out of Messages; broader disclosure policy remains later
work.

**Completion evidence.**

- One component `publish()` is admitted to both the required work route and the
  shared observation route without component awareness of either destination.
- Under real Redis, a submitted HTTP job and its resulting terminal Message
  appear in causal order on one observation stream while Worker and Engine still
  consume their independent work routes.
- Observability consumes that stream through one logical group, one reader, and
  one serial local lane; no cross-stream race determines its append order.
- Transaction errors fail publishing visibly, while tests and documentation do
  not claim reconciliation, retry, or exactly-once behavior.
- The in-process carrier and complete embedded profile retain C20's behavior.

## Change C24 - Give Worker truthful managed lifecycle and controlled ingress - not started

### Discussion

Worker is a long-lived autonomous component with real capacity and execution
state, so the remote process must not manage it through no-op lifecycle hooks.
Give the same Worker used by embedded and remote profiles meaningful
`start()`, `stop()`, and `health()` control. Its lifecycle state should express
whether it is accepting work, draining, or stopped, while preserving the
component's existing capacity and terminal-topic ownership.

Worker lifecycle and carrier lifecycle remain separate responsibilities.
Worker owns whether it accepts work and how its active executions settle. The
process host owns whether a subscription is polling or presenting deliveries.
Worker must not learn about Redis, consumer groups, mailboxes, or deployment
placement merely to coordinate those controls.

A truthful stop requires an ordered host policy rather than simply adding
methods to the class:

1. quiesce that host's Worker-command ingress so it presents no new work;
2. define honestly what happens to work already admitted or waiting for Worker
   capacity;
3. let active work reach its chosen finish-or-cancel boundary while terminal
   topic remains available;
4. stop Worker only after the executions covered by that policy settle; and
5. stop remaining messaging egress and infrastructure dependencies afterward.

The current managed runtime provides ordered start and reverse-order stop, but
the current router groups topic and several subscription loops into one
resource. C22's host-binding split supplies the right point to decide whether a
Worker subscription becomes an independently controlled managed ingress or
whether shared lifecycle needs an explicit quiesce/drain phase. Do not claim a
graceful drain while an embedded terminal consumer can stop before a draining
Worker publishes its result.

Redis entries not yet presented may remain in Redis for a later process; an
in-process carrier has no durable equivalent. C24 must state and test the
minimum common stop guarantee and each carrier's stronger behavior rather than
making the local carrier imitate Redis recovery. A delivery refused because
Worker is no longer accepting must not be silently acknowledged as successful.

Local Worker health reports only the component instance this process owns.
Whether a separately deployed Worker process is reachable or whether enough
Worker instances exist is deployment health, not a fake remote
`ManagedResource<Worker>` inside an Engine or gateway process.

Keep this Change independent of the new app and deployment proof. It should be
exercised through the existing embedded profile over both carriers first, then
the Worker-host profile in C25 can consume an already truthful lifecycle.

**Completion evidence.**

- The retained Worker instance exposes tested accepting, draining/stopping,
  stopped, and health behavior rather than no-op symmetry methods.
- Both local-system carrier branches start Worker before its command ingress
  and stop new ingress before Worker settles active work.
- Terminal topic needed by settling work remains available for the
  duration promised by the stop contract.
- Redis work not yet presented follows an explicit retained-entry policy, and
  in-process admitted work follows an explicit ephemeral policy.
- The `local-system` profile includes Worker as a real managed resource, while
  profiles that do not host Worker include no remote placeholder resource.
- Worker remains free of carrier, topology, deployment, and process-supervisor
  dependencies.

## Change C25 - Run and prove a separately deployed Worker host - not started

### Discussion

Add `apps/worker-host` as a real deployable package with an app-local process
profile. It constructs the Worker and its required first-party collaborators,
selects Redis-backed Message delivery, and selects the shared artifact and SQL
infrastructure needed to resolve inputs and publish outputs that the Engine can
observe from another process. It must not import the complete local-system
profile or install unrelated Engine, app-service, Observability, Replay, or
Limiter graphs through a convenience package.

The other side of the proof is a companion non-Worker process profile using the
same deployment definition and shared Redis, S3/MinIO, and Postgres identities.
Initially it retains application services, Engine, Observability, Limiter,
Replay, and the other behavior not yet given an independent process boundary.
For the first proof, keep that profile local to its executable. Its explicit
entrypoint may live in the existing HTTP-server app package; a separate thin
companion app package is required only if C25 deliberately includes that
deployable-closure proof. Preserve `@lcase/profile-local-system` as the complete
embedded graph; do not add a local/remote Worker placement switch to it,
construct a hidden Worker, or add a local fallback. Promote the companion
profile only when a second real executable needs the same composition policy. A
CLI acting only as a thin HTTP client is not such a consumer; whether a CLI that
runs directly against the distributed services becomes one remains deliberately
open. The existing HTTP server and CLI continue to be supported through the
unchanged shared `local-system` profile.

Both process entry points own configuration parsing, lifecycle start and
rollback, signals, application of C24's stop contract, process identity, and
truthful readiness for the resources they require. Deployment configuration
makes shared protocol and physical-route values one source of truth rather than
parallel environment-variable conventions.

C25 must also close the publisher-before-group startup race deferred by C22.
Before the companion process reports ready and accepts external intake, the
selected provisioning or startup policy must ensure every required Redis
route/group pair exists. The acceptance test submits work immediately after
readiness so a first entry cannot be skipped merely because its consumer group
was created later.

The acceptance proof runs at least the two application processes against real
Redis, MinIO/S3-compatible storage, and Postgres. Submit one HTTP JSON job to the
companion side, observe the Worker consume it with no in-process Worker
instance, persist and retrieve its shared artifacts, consume the terminal
Message back at Engine, and reach the expected completed run state. The proof
must fail if the Worker host is absent or misconfigured instead of succeeding
through a local fallback.

Inspect the built or `pnpm deploy` dependency closure for each app and record
which unexpected production dependencies remain. Split a broad provider
package only when that evidence shows a material deployable cost or coupling;
the Worker legitimately needs the three remote infrastructure implementations.

The first remote deployment does not need to solve every distributed-systems
policy. Cancellation across the boundary, crash recovery and pending-entry
reclaim, idempotent redelivery, retained failures, full lifecycle-event
migration, and ordering against event families still entering through
`EventBusPort` remain separately scoped unless the acceptance proof cannot be
truthful without one of them.

**Completion evidence.**

- `apps/worker-host` builds and deploys independently with no complete-system
  profile dependency.
- The companion non-Worker profile remains app-local, constructs no Worker or
  remote placeholder, and does not alter the complete embedded `local-system`
  profile.
- Companion and Worker processes load compatible values from one deployment
  definition and report truthful startup failure for unreachable required
  infrastructure.
- The selected startup or provisioning policy creates every required Redis
  route/group pair before companion readiness, and a submission made immediately
  after readiness is consumed rather than skipped.
- A real end-to-end flow crosses Redis in both directions and shares artifacts
  and SQL state through MinIO/S3 and Postgres, with no in-process Worker
  fallback.
- The existing embedded profile and its lightweight filesystem, SQLite, and
  in-process branches remain green.
- The recorded deployable dependency inventories either justify the current
  provider package boundary or create a concrete follow-on Change to narrow it.

**Deliberately deferred beyond this Arc.**

- General migration of Engine, Limiter, Replay, Observability, and component
  lifecycle event families off `EventBusPort`.
- A cancellation protocol that replaces the in-process `AbortSignal` path.
- Production Redis delivery hardening: retries, reclaim, retention, poison
  handling, idempotency, and duplicate terminal policy.
- Reconciliation, retry, or recovery for a multi-route admission whose outcome
  is ambiguous beyond C23's transaction-backed happy path.
- Dynamic provider plugins and per-job backend selection.
- A general startup-time component-placement compiler. The explicit profiles
  in this Arc remain compatible presets, but the broader configuration and
  validation surface is deliberately distant work; see the
  [deferred design sketch](../research/configurable-component-placement.md).
- Hot relocation of components after a process has started.
