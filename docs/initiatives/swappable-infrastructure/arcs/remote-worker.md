# Prove Swappable Infrastructure Initiative — Arc: Remote Worker (Changes C19–C30)

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
from process-local bindings, gives Observability one ordered Redis route, runs
the two roles apart, packages them, proves the deployment from a cold start, and
closes out the Initiative with a release.

Worker lifecycle and controlled ingress was scoped as this arc's last Change and
moved out before it started. Its stop contract is least legible in the embedded
profile, where one router resource serves Worker, Engine, and Observability at
once, which is why it was placed after a process hosting Worker alone existed.
Most of its value depends on reclaim and other Redis delivery work this arc
defers, so it is kept with that work instead; see
[`research/worker-lifecycle-and-controlled-ingress.md`](../research/worker-lifecycle-and-controlled-ingress.md).

The Changes below are the current best review seams, not a quota. Before each
Change starts, its expected moved and changed lines should be inventoried. If
one is too large to review comfortably, split it at the named responsibility
boundary and renumber the unstarted work. C21 and C22 are one such split, taken
at the seam the original Change named, and C24 and C25 are another. Do not
preserve the current count by combining unrelated behavior or by hiding a large
mechanical move inside a semantic Change.

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
present grouping may not inflate that artifact materially. C28 must inspect the
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

## Change C22 - Bind each process to its host plan rather than the full topology - merged (PR #381)

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
race remain remote-host startup work and must be settled in C29 before that
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

## Change C23 - Add one ordered Redis route for Observability - merged (PR #382)

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

### What actually landed

**Every route ID changed, not just Observability's.** The Change was scoped to
give one subscription its own path, which needs only two values edited. All four
moved instead, because nothing is deployed and no stream key was worth
preserving: while `routeId === topicId`, carrier code reaching for a topic where
it meant a route passed every test by coincidence. Keeping them distinct
everywhere is the only thing that exercises the distinction C21 introduced, and
it retires two standing comments that existed to explain the equality rather
than leaving them in a stranger half-form. The presets now read
`job.command-work.v1`, `job.terminal-work.v1`, and `job.observation.v1`, with
the observation route named for the event family so a later family can converge
there or not without the name already having decided.

**The transaction is an ordering requirement, not a durability one.** The
obvious reason to append atomically -- don't lose the observation copy -- is the
weaker one. The real reason is that the command's work-stream and
observation-stream appends have to commit together, or Worker can read the
command off the work stream and publish its terminal to the observation stream
_before_ the command's own observation entry lands, inverting cause and effect
on the one stream whose purpose is causal order. Two sequential appends permit
that inversion even when both succeed. So `MessageLogPort.publish` widened to
take several streams and promises **non-interleaving**, explicitly not rollback:
Redis does not undo a queued command that fails at runtime, an `XADD` has no
such failure worth undoing, and promising atomicity in that sense would claim
more than Redis, Kafka, or JetStream actually offer.

**Convergence would have been silently broken by the reader loop.** Readers were
built one per topic route, which is correct only while routes are distinct. Two
of a subscription's topics on one route would have produced two readers on one
stream under one group and consumer name, each narrowed to one topic, so roughly
half of what arrived would be rejected as undeclared and acknowledged away.
Readers are now per distinct route, accepting the union of what that route's
topics declare. The union is the right strength rather than a concession: the
guard exists to make the delivery cast sound, and the handler is typed over the
union of everything the subscription selects. What is lost is a per-topic
diagnostic that only ever existed because routes happened to be per-topic.

**A new manifest invariant, only expressible now.** Several edges sharing a
route is the mechanism; it is also the only way to express a route carrying a
topic one of its own readers does not consume, whose readers would receive
entries they can only discard on a manifest every other rule accepts.
`assertManifest` now requires that every subscription on a route consume
everything that route carries -- a pure route-table check needing no catalog,
placed after the per-edge loop so a missing or duplicated route is still
reported first. It pairs with C22's unconsumed-topic loop: both are claims only
the whole deployment can see.

**The ordering claim had an unstated dependency on a default.** One ordered
stream buys arrival order; `maxInFlight: 1` is what carries it into the handler.
Nothing set it -- Observability relied on the default, and raising it would have
kept the arrival order while losing the observed one. It is now explicit at the
binding site, with the comment saying which half of the guarantee lives there.

**Reader counts after this Change, as measured fact.** Every subscription in
both shipped presets now reads exactly one stream: Worker and Engine were
single-route already, and Observability went from two readers to one. That
strengthens the case for revisiting Redis's use of `DeliveryLane`, but this
Change records the evidence rather than removing it. Redis must still preserve
aggregate `maxInFlight` if a future plan gives one subscription several readers,
and it must acknowledge only after handling settles. Those requirements may
belong in Redis-specific machinery; they do not require Redis to retain
in-process-only queueing, microtask, or idle-bookkeeping behavior merely for
carrier symmetry.

**Proof.** Under live Redis the three streams exist with the expected names, one
consumer group each, and Observability's group on the observation stream alone.
A two-step flow through `apps/http-server` put eight Messages on that one stream
in exact causal order -- submitted, terminal, submitted, terminal across two
runs -- while each work stream held only its own four. The Redis slice's
observation assertion changed from sorted to ordered, which is the test-level
form of the same claim; the in-process slice is unchanged, which is what shows
the semantics are shared rather than coincidental.

## Change C24 - Scaffold the Worker-host app - merged (PR #383)

### Discussion

Create `apps/worker-host` as a workspace package with its own build, typecheck,
lint, and test tasks, and one module: the resolution of this role's slice of the
deployment. No profile, no carrier, no infrastructure, no Worker.

Separated from building the profile because the reviewable content is different.
This Change's surface is the app's _boundaries_ — which tasks it runs and which
dependencies it is allowed to hold — and those are easiest to judge before any
dependency exists to argue about. Its only production dependency is
`@lcase/message-topology`. No adapters, Prisma, S3, or Redis, because nothing
imports them yet, and adding them ahead of use would make C28's dependency
closure inspection report a closure this app does not have.

The tasks follow `profile-local-system` rather than the other apps: real
`eslint .` instead of `apps/http-server`'s `echo lint` stub, and typecheck
through a `tsconfig.typecheck.json` that widens to `tests`. `test:integration`
is an `echo` stub, because `vitest` fails outright when no file matches its
include; the config and the `.env.test.local` setup file are in place so the
first real suite only has to be written.

The entrypoint is deliberately not runnable. It resolves the plan, prints it,
and exits non-zero, so nothing mistakes a scaffold for a running host.

One behavioral claim is available at this size and is worth asserting now: this
process can derive its own view of the deployment without any carrier existing.
`workerHostPlan()` resolves the `remote-worker` manifest for the `worker-host`
role against the job catalog, and the test asserts it is carried by
`redis-streams`, consumes exactly `worker.job-command.v1`, and publishes
`job-terminal.v1` onto both `job.terminal-work.v1` and `job.observation.v1` —
with the consuming subscription erased from both, which is the asymmetry the
whole Arc rests on made checkable in a unit test.

The README states the positions this app has to hold before it holds them: that
it may not depend on `@lcase/profile-local-system`, that its infrastructure is
Redis, Postgres and S3/MinIO rather than the lightweight branches, and that it
makes no drain or stop guarantee.

**Completion evidence.**

- `apps/worker-host` builds, typechecks, lints, and tests as its own package
  under turbo, with real ESLint rather than a stub.
- Its only production dependency is `@lcase/message-topology`, and it does not
  depend on `@lcase/profile-local-system`.
- `workerHostPlan()` resolves `remote-worker` for the `worker-host` role, with
  tests covering the carrier, the single consumed subscription, and the two
  routes its published topic travels.
- The entrypoint exits non-zero and says it is not wired, rather than starting
  a process that does nothing.
- The README records the dependency prohibition, the infrastructure
  requirement, and the absence of a lifecycle guarantee.

## Change C25 - Build the Worker-host process - merged (PR #384)

### Discussion

Give the app C24 scaffolded an app-local process profile and a real entrypoint,
turning it into a deployable package. Starting from the host plan that already
resolves, it constructs the Redis carrier and the shared artifact and SQL
infrastructure Worker needs, builds Worker, and binds only the Worker command
subscription. It must not import `@lcase/profile-local-system`, which would
install Engine, Observability, Limiter, Replay, and the app-services graph
through a convenience package.

The Change is deliberately provable alone. A command appended directly onto the
command work route must be consumed by this process and answered with a terminal
on the terminal work route, with no companion process, no HTTP, and no Engine
anywhere. That keeps the first process boundary a claim about one process rather
than a claim about choreography, which is C29's.

Most of what this needs already exists. C21 and C22 supply the `remote-worker`
manifest, the `workerHost` role, and `hostPlanFor`/`resolveHostPlan`, so this
role's plan derives with no new topology code. `createRedisMessageRouter`
already consumes a `ResolvedHostPlan` and provisions only the routes its role
publishes. `createManagedRuntime` is already role-neutral; only
`assembleEmbeddedSystem` is specific to the embedded graph. Nothing in Worker,
the carrier, the topology, or `assembly` has to change for this Change.

**The infrastructure selection is forced, not a deployment nicety.** Worker
resolves input refs from CAS and writes its output and declared exports back as
new artifacts, so the artifact metadata it produces has to land where the Engine
process can read it. That rules out the lightweight branches: two processes
cannot share an `FsArtifactStore` directory or a SQLite file in a way that
proves anything about a deployment. This profile therefore selects Postgres,
S3/MinIO, and Redis, which also makes this the first time all three run
together — each has been exercised on its own against the embedded profile, but
never as one set. Doing that here isolates any surprise to a process hosting one
component and one subscription.

Worker's SQL need is narrower than the embedded profile's: the only repository
it constructs is `PrismaArtifactRepository`, because
`createArtifactReadWritePort(store, repository)` is Worker's entire storage
surface. No run, flow, sim, eval, or projection repository belongs in this
process.

**Duplicating the builders is deliberate.** `buildSqlClient`,
`buildArtifactStore`, `buildMessageRouter`, and `buildWorker` all live in
`profile-local-system`, which this app cannot import, so this profile gets its
own. Do not extract a shared package as part of this Change. Two copies is not
yet evidence of the right boundary, and the extraction question has a real
design fork inside it recorded in `docs/todo.md`.

**The copies are narrowed, not verbatim.** Each implements only the arm this
host selects, so `buildSqlClient` builds a Postgres client and nothing else,
`buildArtifactStore` an S3 store, `buildMessageRouter` a Redis carrier. Carrying
the unreachable branches would cost twice over. It would put
`@prisma/adapter-better-sqlite3` and `FsArtifactStore` inside the dependency
closure C28 exists to inspect, for branches this process can never take. And it
would make the comparison at C27 a tautology: three identical files prove only
that they were copied, which is what deferring the extraction was meant to avoid
assuming. Narrowed copies make the diff between them the evidence, showing
whether these hosts want the same function or only the same shape. `buildWorker`
is the one expected to differ on content rather than by dropping a branch — its
console lifecycle sink is the choice a real Worker host would make differently —
and that difference is the one worth still being legible when C27 asks what the
copies proved.

**Claim no drain.** This Change adds no lifecycle contract; C30 does. The Redis
carrier's `stop()` already ends intake, awaits its read loops, and only then
closes connections, and a loop awaits handler settlement through the lane, so
in-flight jobs do finish and publish their terminals before the publisher
connection closes. That is adequate for the proof and it is all that may be
claimed. Nothing in this app's entrypoint, configuration, or documentation may
describe a graceful drain, a stop guarantee, or a retained-entry policy.

Keep configuration minimal. The single source of truth for shared protocol and
physical values is C29's concern, because a convention cannot be unified with
one participant. Containerization and a readiness endpoint belong to C28. If the Change runs long, the seam is that the profile is provable by an
integration test before an entrypoint exists at all.

**Completion evidence.**

- `apps/worker-host` resolves the `remote-worker` manifest for the `worker-host`
  role and builds a process that hosts Worker and no other component.
- It has no dependency on `@lcase/profile-local-system`, and the embedded
  profile is unchanged.
- Its profile selects Redis, Postgres, and S3/MinIO together, and reports
  truthful startup failure when a required backend is unreachable.
- A command placed directly on the command work route is consumed by this
  process and answered with a terminal on the terminal work route, with its
  output and exports readable from shared CAS and its artifact metadata from
  shared SQL.
- Binding only the Worker command subscription is enforced rather than
  conventional: `assertPlanFullyBound` rejects both a missing binding and a
  binding this role's plan does not contain.
- No lifecycle, drain, or retained-entry guarantee is stated anywhere in the
  app.

### What actually landed

**The config types moved to `@lcase/types`, and that is not the extraction this
Change refused.** The Discussion says not to extract a shared package, and the
builders duly stayed duplicated. The types did not: `apps/worker-host`'s first
config module was byte-identical to `profile-local-system`'s `S3ArtifactStoreConfig`
apart from its name, which is duplication with nothing to learn from. What
separates the two cases is dependencies. An infra-selection package needs
`@lcase/adapters`, `@prisma/*`, `@aws-sdk/client-s3` and `redis`; the config
types need nothing at all -- the whole folder had no imports outside itself. So
`@lcase/types/process-hosting` now owns the four axes, and a profile narrows a
union to the arms it supports rather than restating an arm. Worker-host selects
`PostgresSqlUserConfig`, `S3ArtifactStoreUserConfig` and
`RedisStreamsMessagingUserConfig` directly, so its narrowing is a type
selection rather than a copy.

**That move named a layer that existed without a name.** `@lcase/worker` already
exported a `WorkerConfig` -- the second constructor argument, carrying `source`
and no permit settings -- while the profile had a different type of the same
name carrying `maxConcurrencyPerKey` and no source. They describe different
things: one is what a component is constructed with, the other is what a person
writes down. The moved types are the second kind and are suffixed `UserConfig`
to say so, which also anticipates their becoming a file a user edits rather than
a TypeScript literal.

**The copies diverged on content for the first time, and it was the artifact
store rather than `buildWorker`.** The arc expected Worker's hardcoded console
lifecycle sink to be where profiles part company. It was not: there is still
only one sink implementation, a container captures stdout anyway, and this host
passes the same one -- the fix was making it a parameter so a future host needs
no third copy. The real divergence came from truthfulness at startup.
Constructing an `S3Client` reaches nothing, so the process reported a healthy
start having never contacted object storage, and a wrong bucket would have
surfaced inside whichever job ran first, after that job's command had already
been consumed. `buildArtifactStore` here returns `{ store, hooks }` with a
`HeadBucket` start hook and the store is a third managed resource; the embedded
profile's copy still returns a bare port. The hook reaches the client this
builder made rather than a method on the store, which is the one asymmetry with
`buildSqlClient`'s `SELECT 1`; putting a reachability method on
`ArtifactStorePort` is the alternative and wants a second caller before it earns
three implementations.

**Binding became its own function, against the embedded profile's stated
position.** `local-system.profile.ts` says its bind sequence is written inline
"rather than hidden behind a helper" because the router enforces the ordering
itself. That reasoning does not follow -- enforcement is what makes hiding the
sequence _safe_ -- and extracting `bindSubscriptions` hides no sequence anyway,
since the call site still reads build, bind, seal in order. `seal()` stays in the
composition root, because a helper that sealed would decide on the root's behalf
that the list is complete.

**Two closed seams shaped the tests more than the design did.** `buildWorker`
constructs its own permits and protocol executor, deliberately, so that
composition cannot hand Worker something that bypasses either -- which also means
there is no way to observe from outside that `maxConcurrencyPerKey` reached the
permit adapter rather than Worker's own bound. `buildWorker` therefore has no
unit tests, and the integration suite has to stand up a real HTTP server on an
ephemeral port because there is no `fetch` to stub. Both are the cost of a
property worth keeping, recorded here so neither reads as an oversight.

**`@lcase/test-support` gained `postgresTestDatabaseUrl()`.** Its existing
surface hands back a client, which is the wrong shape for a profile whose entire
premise is building its own client from configuration. The per-worker database
name stays private, so nothing outside that package restates the convention.

## Change C27 - Build the API host process - merged (PR #386)

### Discussion

`apps/http-server` gains a second host. `src/hosts/` holds one file per
deployment — `embedded.ts`, which is today's `main.ts` moved and otherwise
unchanged, and `api.ts`, which composes an app-local profile resolving the same
`remote-worker` manifest C25 used, for the `api-engine-observer-host` role. That
profile constructs everything the embedded one does except Worker, and binds the
Engine terminal subscription and the Observability subscription. What both hosts
share — Fastify, the routes, the plugin registration order — moves to `src/http/`
and is handed a composed system rather than composing one.

`hosts` rather than `entries` or `deployments`: each file is one process host,
which is the word the topology already uses, and both of these correspond to
declared roles. `deployments` is taken — `@lcase/message-topology/deployments`
means the messaging presets.

**The profile stays app-local.** Not for want of a rule, but because the role it
composes is a waypoint: `api-engine-observer-host` holds Engine and Observability
alongside the API, while the distributed shape actually wanted holds neither (see
the deployment shapes in `INITIATIVE.md`). A package here would fix a boundary
around a shape nobody keeps. The second consumer that would justify one is a CLI
running app-services against remote infrastructure, which stays open.

**Entry points, not a bundler.** `tsc` already emits every file under `src/`, so
`node dist/hosts/api.js` needs nothing new, and this Change adds no build tooling.
Bundling each host into a narrow artifact was measured separately and works — see
[`research/deployment-artifacts-from-static-entrypoints.md`](../research/deployment-artifacts-from-static-entrypoints.md)
— but adopting it is a deployment concern, and it belongs with C28's deployable
closure work rather than here. What this Change owes that later step is only that
each host is reachable from its own static entry point, because that is what makes
an artifact boundary possible at all.

**This Change's proof is partial by construction, and should say so.** With no
Worker process running, a submitted run cannot complete. The honest evidence is
that the process starts, binds both subscriptions, publishes a command onto the
command work route where it can be observed directly, and then does not advance
— because nothing consumed it. That the run stalls is the evidence, not a
defect: it is what shows no local Worker fallback exists. Completing a run is
C29's claim.

The third copy of the infrastructure selectors arrives here, and it is a narrower
copy than "three" suggests. This host is forced to Postgres, S3, and Redis for
the same reasons `apps/worker-host` is, so `buildSqlClient`,
`buildArtifactStore` and `buildMessageRouter` would be identical to worker-host's
rather than a third variant — two narrow copies and one wide embedded one. The
component builders are where profiles legitimately differ, which is the
distinction worth recording: a Worker host would not want the embedded profile's
console lifecycle sink. Whether extraction lands here or separately still depends
on whether it stays mechanical; see `docs/todo.md`.

Deployable closure is not an argument either way, though it resembles one.
`apps/worker-host` already installs `@prisma/adapter-better-sqlite3` and native
`better-sqlite3` through `@lcase/db-prisma`'s manifest, so the narrowness a shared
selectors package would supposedly spoil does not exist. The spike above showed
that bundling removes the question rather than answering it, since an artifact
carries no manifest at all.

**Out of scope.** Serving the workbench's static assets, which `src/http/` is the
eventual home for but which nothing needs yet. Renaming the package now that it
houses more than one host — cheap, and easier to judge once both exist. And the
two workspace-coupling fixes in `docs/todo.md`, which block deployment rather
than this Change and are better done on their own.

**Completion evidence.**

- Both hosts build and run from their own entry point under `src/hosts/`, with
  the embedded one behaviourally unchanged from today's `main.ts`.
- The API host's profile is app-local, constructs no Worker and no remote
  placeholder resource, and leaves `@lcase/profile-local-system` untouched.
- It resolves the same manifest as C25 for the other role, with neither role
  naming the other.
- A run submitted over HTTP publishes a command onto the command work route,
  observable on that stream, and the run does not reach a terminal state.
- The embedded host and its filesystem, SQLite, and in-process branches remain
  green, including its integration suite.

### What actually landed

**The HTTP layer lost process lifecycle, which the Discussion did not plan.**
`buildServer` used to call `runtime.start()`, log the outcome, and register an
`onClose` hook to stop it -- so a failed start printed `{ ok: false }` and the
process bound its port anyway. That stayed theoretical until an API host
artifact, run outside the workspace against the wrong database port, answered
every request with a 500. Lifecycle now lives in `src/http/serve.ts`:
`serveHost` checks the start outcome and exits non-zero naming the failed
resource, stops the runtime if `listen` fails rather than leaving consumer
groups registered, and on a signal closes the server before stopping resources
in reverse. `buildServer` takes `{ services, tap }` and nothing else, and both
host files reduce to composing a system and handing it over.

That makes one completion-evidence bullet false as written. The embedded host is
not behaviourally unchanged from the old `main.ts`: it now refuses to serve on a
failed start and handles SIGINT/SIGTERM, neither of which it did before. The
change was taken deliberately, because the defect was in the layer both hosts
share and fixing it in one would have left the other serving with a dead
database.

**Engine's and Observability's builders were copied, not imported.**
`@lcase/profile-local-system` exports neither, but importing its internals or
widening its barrel would have cost nothing to install -- the package is already
a dependency here, for the embedded host. The cost was in the import graph: the
API host's entry point would reach the profile for the complete embedded graph.
Measured afterwards, an esbuild artifact of `dist/hosts/api.js` contains zero
inputs from that package, zero SQLite inputs, and no Worker implementation.

**No limiter, on evidence rather than scope.** `worker.slot.requested` is
declared in `@lcase/types` and served by `@lcase/limiter`, and nothing in the
system emits it. The embedded profile composes a limiter by inheritance from
older wiring; this profile does not, and says why in `assemble-api-host.ts`. If
the protocol goes live it is a conversation between processes, not a resource
that happens to share this host's bus.

**The copies measured as mechanical as they could be.** Of the three
infrastructure selectors carried over from `apps/worker-host`, two are
byte-identical and the third differs by one string, the role prefix in its
carrier-mismatch error. The Discussion left extraction depending on exactly
that. It stayed deferred by choice rather than for lack of evidence; see
`docs/todo.md`.

**Evidence took a different shape than the Discussion planned.** The partial
proof -- a run publishing its command and stalling for want of a Worker -- was not
run as a separate check, because two other things covered it. The composition
tests pin the absence of a Worker structurally: the assembled resource list holds
no Worker, the binding step never binds Worker's subscription, and the profile
composes under a router that rejects any binding outside the role's plan. On a
live Redis, the API host registered as the consumer of `engine.job-terminal.v1`
and `observability.job.v1` and of nothing else. And the positive path went
further than this Change claims: with `apps/worker-host` running alongside, a flow
submitted from the workbench completed across both processes.

That run is not C29's proof, and should not be read as one. Consumer groups are
created at `$`, and `worker.job-command.v1` already existed from C25's run, so a
cold start where the API host publishes before the Worker host has ever created
its group was not exercised.

**Tests for this app now test composition, not only routes.** Four files under
`tests/profiles/` cover the resolved plan, what gets bound, resource order, and
that the profile composes against dead addresses without reaching them. They were
checked against deliberate breakage: raising the observation lane's
`maxInFlight` from 1 fails exactly the test written for it, and swapping Engine
and the router in the assembly fails both assembly tests. The copied selectors
are untested here, since `apps/worker-host` tests the same code. Route tests moved
to `tests/http/` so the test tree mirrors `src/`.

**The API host depends on the adapters directly.** `@lcase/adapters` and
`@lcase/db-prisma` moved from dev to runtime dependencies. They were dev-only
because the embedded profile package did all composition, so this app now
installs Prisma and the adapters in its own right, and both SQL driver adapters
between its two hosts. Bundling is what removes that from a deployment; see C28.

## Change C28 - Build and package deployable artifacts - merged (PR #387)

### Discussion

C27 left each host reachable from a static entry point, which the spike in
[`research/deployment-artifacts-from-static-entrypoints.md`](../research/deployment-artifacts-from-static-entrypoints.md)
identified as the only precondition for per-host artifacts. This Change turns
that measurement into build output, and gives the two distributed hosts
something to run in other than a checkout.

**Artifacts from `tsc` output, one bundle per host.** esbuild reads each host's
`dist` entry point, so type checking stays where it is and the bundler only
resolves and shakes. How a host is bundled is the same everywhere -- ESM, the
`createRequire` banner `@aws-sdk/client-s3` needs, a metafile -- so it lives once,
in `scripts/bundle.mjs`. Which hosts an app has, what each keeps external, and
what each forbids differ per app, so they live in that app's
`bundle.config.mjs`. Every app that grows a host adds a config rather than a
copy of the mechanics. The output directory is a turbo task output as well as
gitignored, because an output turbo cannot see goes silently stale while the
build reports success.

Bundling from TypeScript source is out of scope. It works today for an app's own
files, but every workspace package resolves through its `exports` map to `dist`,
so skipping the package builds means a source export condition on each one and a
second resolution story beside the one `typecheck` relies on.

**The boundary assertion is the reason this is a Change and not a script.** Under
separate application packages a boundary violation fails at install time. Under
static entry points nothing prevents the API host from importing Worker, and the
violation is visible only in the bundle's metafile. The spike made its verdict
conditional on an assertion that fails the build, expressed against the metafile
each build already emits. Without one, the boundary is verified once and never
again. The expectations are already measured:

| Artifact    | Must not contain                                                             |
| ----------- | ---------------------------------------------------------------------------- |
| worker-host | SQLite, Engine, Observability, limiter, app-services, HTTP, embedded profile |
| api host    | Worker implementation, limiter, SQLite, embedded profile                     |
| embedded    | nothing distinctive -- it is the contrasting case                            |

The deployable dependency closures that C21, C24 and C25 each deferred to this
point belong here as well. For a bundled artifact the closure is its externals,
and the metafile is the record.

**Images for the distributed pair.** Their artifacts ship with no externals, so
an image is an Alpine Node base and one `.mjs` file, which declares itself an ES
module without a `package.json`, with no install step at all. Configuration
arrives as environment variables under the names the hosts already read, since
an image has no checkout and no repository `.env`.

**The embedded image is deferred, not dismissed.** The embedded host is a
deployment in its own right -- the whole system in one process and one container
-- and it gets an image. It does not get one here because it carries three open
questions the distributed pair does not: migrating its own SQLite file inside the
image, the weight of the Prisma CLI that migration currently needs, and where its
database and artifact paths land when there is no repository to anchor them.
Enough was measured to start that work from evidence; see What actually landed.

**Whoever owns a database migrates it.** Postgres belongs to the deployment and
is shared by two hosts, so a one-shot migration container applies pending
migrations and exits, and both hosts wait for it to succeed. Neither host carries
the Prisma CLI, and a host replica never migrates. The embedded host's SQLite
file belongs to that container alone, so when it gets an image it migrates on its
own start. The migration container runs `prisma migrate deploy` because that is
the tool that writes the migrations; replacing it with a plain SQL runner is
possible and recorded in `docs/todo.md`.

**Hosts provision what they use, where they can.** `RedisMessageLog` already
creates its streams and consumer groups on start. The S3 artifact store now does
the same for its bucket, behind a config flag, because hosted S3 commonly grants
an application no permission to create buckets. A bucket that exists is never
created, so the flag is safe to leave on against infrastructure provisioned
elsewhere. That removes a provisioning container from the deployment rather than
adding one.

**Local state lives on a mount.** A container's filesystem is discarded when the
container is replaced. The Worker host writes nothing locally. The API host is
easy to miss: its replay sink writes per-run JSONL under the working directory and
replay reads it back from there, so its image works in a directory the `node`
user owns and a deployment mounts a volume there. Whether that is a
Docker-managed volume or a host directory is chosen at run time, not by the image.

**One compose file per deployment shape, grown rather than replaced.**
`deploy/remote-worker.compose.yaml` is named for the `remote-worker` preset both
hosts resolve. Postgres, MinIO and Redis sit behind an `infra` profile, and every
connection setting defaults to the service in the same file, so the same file
runs either with its own infrastructure or against existing infrastructure given
only environment variables. As components leave the API host, they become
services here. It is separate from the repository-root compose file, which stays
the integration-test infrastructure, and publishes no infrastructure port, so
both can run at once.

**A readiness endpoint, because a healthcheck otherwise lies.** A container check
against an ordinary route reports healthy for as long as the port answers, and a
host with no check at all is reported healthy by `compose up --wait` the moment
it runs. The managed runtime already reports per-resource health, so the HTTP
hosts expose it. The Worker host serves no HTTP, and how it is checked stays
open. Readiness here means the process's own resources; readiness across
processes, where the Worker's consumer group must exist before the API host
accepts work, is C29's.

**Out of scope.** Standalone executables: Node's single-executable support is
experimental, embeds a runtime larger than these images, and cannot carry native
modules. Publishing images or bundles to any registry. Supporting more than one
Worker replica, which splits work today but has no recovery for a crashed
replica's in-flight jobs. Moving the Worker off Postgres, which would remove
roughly half of its artifact but is a schema question, not a packaging one.

**Completion evidence.**

- One command emits an artifact, source map, and metafile per host, into a
  directory turbo caches and restores.
- The boundary assertion fails the build when an artifact contains a forbidden
  package, demonstrated by introducing one, and CI runs it on every push.
- The API host and Worker host images build without an install step, start
  against real infrastructure, stop cleanly on SIGTERM, and exit non-zero on a
  failed start.
- One compose command migrates an empty database, starts both hosts after it, and
  completes a real flow across Redis, MinIO and Postgres.
- The API host's readiness endpoint reports not ready when a required resource is
  unreachable, and its container healthcheck uses it.
- Each artifact's externals are recorded, confirming or refuting the current
  provider package boundary.

### What actually landed

**The closure question has an answer, and it confirms the provider package
boundary.** `@lcase/db-prisma` carries both generated clients and lists the SQLite
driver adapter as a production dependency, which is why an installed Worker host
contains `better-sqlite3`. A bundle contains what its entry point reaches, and
the metafiles show neither the API host nor the Worker host reaches SQLite at all.
The recorded externals:

| Artifact    | Bundle  | Packages | Externals                                            |
| ----------- | ------- | -------- | ---------------------------------------------------- |
| api         | 10.1 MB | 120      | `pg-native`, `@opentelemetry/api`, `@node-rs/xxhash` |
| worker-host | 8.7 MB  | 66       | `pg-native`, `@opentelemetry/api`, `@node-rs/xxhash` |
| embedded    | 14.8 MB | 124      | the same three, and `better-sqlite3`                 |

The three shared externals are not dependencies. None is installed anywhere in
the workspace; each is an optional `require` its library makes only when present
(`pg`'s native client, tracing, a faster hash), which esbuild leaves unresolved.
Containers with no `node_modules` start and complete runs without them, so
splitting `@lcase/db-prisma` per provider buys nothing for bundled hosts.
`@prisma/client` is about half of each distributed bundle.

**The boundary check reads package names, not paths.** The metafile names every
input by path, so each file is attributed to the nearest `package.json` that has a
name, and external imports are checked as well as bundled files. It was probed
three ways: the API host re-exporting the embedded profile failed naming all five
forbidden packages with a file that pulled each in; a forbidden package present
only as an external was caught; and a misspelled `forbidden` field fails the run
before anything builds, since a typo would otherwise switch the check off
silently. For the Worker host no forbidden package is reachable through its
declared dependencies at all, so pnpm's strict resolution enforces that boundary
first and the check is the guard for a dependency added later. A failed run
removes the whole output directory rather than leaving the hosts that finished
first. CI runs `pnpm bundle` after `pnpm build`, so the check guards every push
rather than only a local run.

**Turbo had two blind spots, and one predated this Change.** The shared runner
lives outside every app, so turbo returned cached bundles after it changed until
the task named it with `$TURBO_ROOT$`. Separately, `@lcase/db-prisma`'s generated
clients live in a gitignored `src/generated`, which the root `build` task never
declared, so a cache hit restored `dist` and left the clients missing. A
package-level `turbo.json` now declares them, the first in the repository, rather
than describing all packages to accommodate one.

**Source maps chain back to TypeScript.** esbuild follows the `tsc` maps in
`dist`, so a bundle position resolves to the original `.ts` file and line, not to
compiled output. The maps omit embedded source text, which cut the API host's map
from 14.2 MB to 3.0 MB without affecting a stack trace. Images run with
`--enable-source-maps`.

**Alpine, on evidence.** On `node:24-slim` the Worker host image downloaded at
80 MB; on `node:24-alpine`, 59 MB. musl only matters for native code, and neither
distributed bundle contains any: Prisma's query path is WebAssembly, and `pg` and
`redis` are JavaScript. Node 24 is LTS until April 2028, and CI moved to it along
with action versions that run on it, which ends the deprecation warning every run
printed.

**The embedded image was measured before it was deferred.** `better-sqlite3`
installs on Alpine from a prebuilt musl binary on both arm64 and x64, with no
compiler in the image. A scratch embedded image, with its schema applied by hand
onto a volume, served a two-step flow whose second step consumed the first's
export, and stopped cleanly. A second, carrying the Prisma CLI, ran
`prisma migrate deploy` against an empty volume at start, found nothing pending on
restart, and then served. What stopped it here was the cost: the `prisma` package
brings Prisma Studio, React, and an embedded Postgres that `migrate deploy` never
uses, doubling that image from 67 MB to 132 MB.

**The migration container records migrations exactly as local development does.**
It carries its own five-line Prisma config reading `POSTGRES_DATABASE_URL`,
because the repository's config imports package TypeScript and a `.env` an image
does not have. Against a fresh database it applied the initial migration and
exited zero, found nothing pending on a second run, and exited non-zero for an
unreachable server or an unset URL. The repository's own `prisma migrate status`
then reported that database up to date. The Postgres schema is derived at build
time and not checked in, so building the image runs that derivation first. Its
Prisma version is pinned separately from the package's, which is a second place
to change on an upgrade.

**A missing bucket is a bare 404.** `HeadBucket` has no response body, so MinIO
reports a missing bucket as `NotFound` with status 404 rather than the
`NoSuchBucket` code other calls use. The integration test pins that: narrowing
detection to `NoSuchBucket` fails both of its cases. Losing a creation race to a
host starting alongside counts as success, and any other failure is rethrown
without attempting a create.

**The healthcheck caught its own bug.** The first healthcheck called `localhost`,
which Alpine resolves to `::1` first, while the host listens on IPv4 only, so
Docker marked a serving container unhealthy. It calls `127.0.0.1`. With Postgres
stopped, `/health` answered 503 naming `sql` and the container went unhealthy;
with Postgres back, it recovered without a restart. Only the SQL client has a
real health hook today, so an S3 or Redis outage does not yet show there.

**The deployment ran end to end.** From empty volumes, one compose command started
the infrastructure, ran the migration, and only then started both hosts, which
created the bucket and the three streams themselves. `examples/parallel.flow.json`
completed through the containers in under a second: every step projected to
Postgres, step outputs read back from MinIO through the API, the replay log
landed on the API host's volume, and no Redis group held an unacknowledged entry.
Scaled to two Worker replicas, three concurrent runs completed with their twelve
jobs split eight and four between the replicas and none run twice. The replicas
share one consumer name, which is correct for splitting work and wrong for
recovering it; that decision belongs with crash recovery, not here.

**Linting and the deploy build each needed a fix the bundles caused.** ESLint
lints `.mjs` files by default and began linting the bundles, so both apps ignore
`bundle` alongside `dist`. And `turbo run bundle` schedules `build` for every
package, including ones nothing bundles, so `deploy:build` filters to the two
apps whose hosts it deploys.

## Change C29 - Prove the distributed deployment from a cold start - merged (PR #388)

### Discussion

C28 already runs both hosts from their images against real Redis, MinIO and
Postgres, and a real flow completes across them. What that run does not show is
whether the deployment is correct when nothing has run before. Its Redis groups
were created in an order that happened to work.

**The cold-start race is real, and C28 did not hit it only because of timing.**
Each host provisions only the consumer groups in its own host plan, and creates
them at `$` (`startAt: "latest"`). A group created at `$` starts its cursor at
the stream's last entry, so it never sees anything appended before it existed.
Compose starts `api` without waiting for `worker-host`. A run submitted in that
window appends a command to `job.command-work.v1` while no Worker group exists
on it. The Worker host then creates its group past that entry, and the run
waits forever: Engine has no deadline.

**Why not create groups at `0` instead.** The start position is read only when a
group is created; afterwards the cursor lives in Redis and a restart hits
`BUSYGROUP`. So `0` and `$` differ only when a group is created on a stream that
already holds entries, which is exactly the race -- and also two ordinary
development events. Renaming a subscription keeps its stream but creates a new
group, since the group name is the subscription ID, and adding a subscription to
an existing route creates one too. At `0`, either replays the stream's whole
history, and nothing trims these streams. For the command route that means
re-executing every HTTP job ever submitted. At `$` the same events skip unread
entries instead. Skipping in-flight work during a rename is the lesser failure,
because replay repeats side effects.

**Why not a readiness handshake.** A handshake answers whether a Worker is alive,
not whether a Worker subscription exists, and only existence decides whether an
entry is lost. With the group present, a Worker that is down just means work
waits in Redis; with it absent, a live handshake creates nothing. Liveness is a
separate question, below.

**Provision the deployment's topology before anything publishes.** A one-shot
command reads the deployment manifest -- `remoteWorker` from
`@lcase/message-topology/deployments`, the same value both hosts' host plans
derive from -- and creates every route's stream and every subscription's group
at `$`, then exits. Because it runs before the first publish, `$` and the
beginning of the stream are the same point, so there is no race and no replay.
A renamed subscription gets a fresh group at `$` the next time the deployment is
provisioned.

It is the messaging counterpart to `migrate`, and deliberately the same shape:

- **A plain Node program, not compose.** Nothing the deployment needs for
  correctness should exist only in compose YAML. Compose runs it as a one-shot
  service that both hosts wait on, the way they wait on `migrate`. Outside
  Docker it is a command run before the hosts, the way `pnpm db:migrate` is
  today.
- **Only additive and idempotent.** It creates what is missing and changes
  nothing that exists, so running it twice, or for two manifests sharing one
  Redis, is harmless. The embedded Redis variant and `remote-worker` already use
  the same route IDs and group names.
- **Hosts keep creating their own groups as a fallback.** The embedded Redis
  variant, local development and existing tests keep working with no extra
  step, and a deployment that skips provisioning is no worse than today.
  Correctness for a cold start rests on provisioning, not on the fallback.

A deployment definition is keyed by manifest, not by a compose file, so this
survives the deployment growing past one: other runners (a script, a release
step, a pipeline) invoke the same command. It also holds when Workers run on
other machines and come and go, because it concerns the shared infrastructure,
not the processes. Provisioning runs in one place as part of deploying, never on
a remote Worker.

**Shared naming, not re-derived naming.** Stream keys are `streamFor`, a closure
inside `createRedisMessageRouter` (`${keyPrefix}${routeId}`), and the group name
is the subscription ID. Provisioning must use those rules rather than restating
them, so exporting them from the Redis carrier is part of this Change. The key
prefix is per-host configuration today, left absent on purpose in both hosts so
they derive identical keys; provisioning has to receive the same value.

**A proof that does not depend on compose.** The guarantee is tested in vitest
against real Redis: from an empty Redis, provision, publish before any Worker
exists, start a Worker, and assert the entry is consumed. The same test without
provisioning fails. A compose run from empty volumes remains the manual
end-to-end check, as in C28.

**Narrowed from the earlier scope.**

- _A proof that fails without the Worker host._ A silent fallback to local
  execution is already impossible: the `api` bundle forbids `@lcase/worker`, so
  that fails the build. What remains is failing visibly -- today a run with no
  Worker stays running indefinitely -- which needs run deadlines or deployment
  health, a liveness policy rather than a cold-start one.
- _One deployment configuration for both hosts._ Largely already true. Both
  hosts read the same environment variable names, compose sets one set for both,
  and route IDs come from the one `remote-worker` manifest. `consumerName`
  differs by design and stays as it is.

**Where each piece lives.** Placed by what each is allowed to depend on:

- **The manifest** stays in `@lcase/message-topology`. It is static data, and
  that package deliberately holds no router, carrier, or connection.
- **The provisioning function and the naming rules** belong in
  `@lcase/message-router`'s Redis module -- for example
  `provisionRedisTopology({ manifest, log, keyPrefix })` over a
  `MessageLogPort`. Mapping routes to streams and subscriptions to groups is
  carrier knowledge the Redis router already holds, and it needs only types from
  `message-topology` and `ports`, so the package keeps an empty production
  closure. The router's own `start()` uses the same exported naming. Not
  `@lcase/adapters`: `RedisMessageLog` knows streams and groups, not routes,
  subscriptions, or manifests, and teaching it topology would invert the
  dependency direction.
- **The executable** is a new app, `apps/deploy-tasks`, for one-shot deployment
  tasks. Only apps and profiles may import concrete adapters, and this one needs
  a Redis client and `RedisMessageLog`. A bundle entry in either host app was
  the cheaper alternative, but it would hand a deployment-wide task to an app
  that stands for one role, when host plans were built so that neither host
  knows the other's subscriptions. It bundles and ships an image the way the
  hosts do. Whether other deployment tasks, such as a plain SQL migration
  runner, join it is left to evidence.

**The key prefix comes from the same configuration the hosts read.** Both hosts
leave it unset today so they derive identical keys, and integration tests set a
unique prefix per run so they never collide with each other or with a running
deployment. Provisioning takes the prefix through the same messaging
configuration, so a test can provision and start hosts under one throwaway
prefix, and a deployment that ever sets one sets it once for all three.

**Outside this Arc.** Provisioning deliberately covers creation only. Several
things build on it rather than replacing it, and belong with a later Redis
delivery and lifecycle effort:

- liveness: whether anyone is consuming, run deadlines, group lag and pending
  counts as deployment health;
- reclaim of entries pending on a dead consumer, and consumer naming for
  replicas;
- topology change while old processes still run -- removal, renames with
  draining, retention, and a record of what was applied. This is the same
  version-skew problem Postgres migrations have under rolling deploys, and
  likely grows alongside them;
- Worker lifecycle and drain, once scoped as this arc's last Change and moved
  out of it, whose
  value mostly depends on reclaim existing; see
  [`research/worker-lifecycle-and-controlled-ingress.md`](../research/worker-lifecycle-and-controlled-ingress.md).

**The deployment also serves its own frontend, added to this Change.** Not part
of the cold-start proof, and included because it is what makes the compose
deployment a whole system rather than a backend that still needs `pnpm dev`
beside it -- the same thing the embedded single-container shape needs. The
frontend keeps being built by its own `vite build` and is copied verbatim, chunk
split and hashed names intact; `@fastify/static` serves it and an unmatched GET
outside the API's paths falls back to `index.html`, so client-side routes
survive a reload while an unknown `/api` path stays a JSON 404. Serving is off
unless `WORKBENCH_DIR` names a directory, which is what leaves development on
Vite's own server.

Two smaller decisions come with it. A built workbench now addresses the API
relatively, because an absolute `http://localhost:3000` is only right when the
API happens to run on that machine; the development default is unchanged, since
Vite is a different origin there. And the bundle step gained the ability to copy
an already-built directory beside the hosts, because an image build context
covers one directory and the frontend lives in another app -- the alternative,
building the image from the repository root, is the same coupling this Arc
avoided for the migration image.

**Initiative close-out moves to C30,** along with the documentation items found
while scoping this Change.

**Completion evidence.**

- From an empty Redis, a provisioning command reading the `remote-worker`
  manifest creates every route stream and consumer group, and a Message
  published before any Worker host has started is consumed once one does.
- The same scenario without provisioning fails the test.
- Compose runs provisioning as a one-shot service both hosts wait on, and the
  same command runs outside Docker.
- Provisioning and both hosts derive stream and group names from one exported
  source.
- Re-running provisioning against an existing deployment changes nothing.
- The compose deployment serves the workbench at the API's own address, with
  nothing else running, and client-side routes survive a reload while unknown
  API paths still answer with a readable error.

### What actually landed

**The naming had to come out of the router first.** Stream keys came from
`streamFor`, a closure inside `createRedisMessageRouter`, and a group name was
the subscription id written inline at its binding. Provisioning restating either
would have been a defect nothing catches: groups created under names no host
reads produce no error, just a Message that never arrives. They moved to
`redis-naming.ts` -- `DEFAULT_REDIS_KEY_PREFIX`, `redisStreamKey`,
`redisGroupName` -- which the router now uses too. The test that matters there
is the one asserting a router with no configured prefix provisions exactly what
those functions return; the rest would pass with two copies of the same rule.

**Provisioning is creation and nothing else.** One group per distinct route and
subscription, at `$`, from the manifest's own order; `MKSTREAM` makes the stream,
so a validated manifest needs no separate stream call. Every deployment-shaped
concern stayed out: no removal, no rename handling, no history of what was
applied. The proof that it is safe to re-run is a cursor check rather than a call
count -- a second run leaves a waiting entry readable.

**The tests were made to fail before being trusted.** With
`provisionRedisTopology` stubbed to do nothing, three of the seven unit tests
failed and the deliberately-unprovisioned one still passed; the same stub failed
two of the three live-Redis cases. The negative case asserts through
`XINFO GROUPS` -- the Worker group's `last-delivered-id` already past the
published entry -- rather than waiting for a non-delivery, so it states the
mechanism instead of timing out.

**The cold start, measured.** From empty volumes with `worker-host` scaled to 0,
a run's three commands sat in Redis with the Worker group at `0-0` and lag 3.
Starting the Worker container consumed all of them and the run completed, with
the steps' own work taking under a second. The waiting shows up as step duration
-- 42.7s for steps whose HTTP calls took milliseconds -- because a step's
duration spans submission to completion. Nothing in a run's detail distinguishes
waiting for a Worker from running, which is the liveness gap this Change
deliberately left open, now observed rather than predicted.

**The setup tasks stayed two images.** Folding `migrate` into the deploy-tasks
image was considered and declined: it would carry the Prisma CLI's weight into
provisioning and need a repository-root build context to reach both packages,
only to be repackaged when a plain SQL runner replaces the CLI. Recorded against
that entry in `docs/todo.md` instead. As separate one-shot services the two also
run in parallel and fail separately.

**Serving the workbench needed an ignore rule, not a router change.** The API
already lives under `/api`, `/events` and `/health`, so nothing collided with the
frontend's routes. What the first version got wrong was the boundary: a
`startsWith` fallback answered `/events/absent` with a page. Each API root now
owns itself and what is under it, and a path that merely shares its first letters
-- `/evaluations` against `/events` -- stays the client's. Both are pinned by
tests.

**The bundle runner learned to carry what it did not build.** An image build
context covers one directory, and the frontend is another app's `vite build`
output, so `scripts/bundle.mjs` gained an optional `assets` copy with the same
unknown-field rejection its hosts have, and a missing source fails the bundle
rather than producing an artifact missing half of what it serves. What makes the
frontend build first is `apps/http-server/turbo.json` naming
`@lcase/workbench#build`, which also means a frontend change invalidates the
bundle. Nothing re-bundles the frontend: its chunk split and hashed names are
copied as they were produced.

**Sizes.** The provision bundle is 1.6 MB, 1.2 MB of it the Redis client, in a
234 MB image. The API image grew from 248 MB to 264 MB with the workbench in it,
most of that Monaco's workers.

**A smaller thing worth knowing.** This suite deletes its own keys afterwards;
the older Redis suites do not, so a test Redis accumulates prefixed keys from
them. Harmless, since every suite uses a unique prefix, but it is why a stray
`lcase-test:*` count means nothing.

## Change C30 - Close out the Initiative and release it to main - merged (PR #389)

### Discussion

This Change ends the Initiative and the development period behind it. The
remaining work is documentation and release bookkeeping rather than behavior, and
the release is the reason to do it as one Change: `main` should receive a
repository whose documentation describes what is actually on it.

**Documentation pass.**

- The Initiative's own record. The unscoped item requiring test typechecking and
  lint before the Initiative is called done appears resolved by C26, which moved
  tests into each package's `tsconfig.json` behind a separate build config;
  verify across every package and record it. The deployment-shapes table says
  only shapes 1 and 3 exist, while the API host with a separate Worker host now
  runs as a real deployment. The Summary still describes a six-Change cut. The
  Initiative's status in `docs/initiatives/README.md` becomes complete.
- The root `README.md`: architecture, deployment shapes, commands, and the
  `deploy/` stack, as they now stand rather than as they stood at the last
  release.
- `CLAUDE.md` and the app READMEs, checked against the same state.
- Code comments that drifted:
  - all three Dockerfiles name `pnpm image` where the command is
    `pnpm deploy:build`;
  - `apps/worker-host/tests/worker-host.integration.test.ts` says "C26 is what
    puts one there" of the Engine reading the terminal, which was C27, and twice
    describes the artifact store as having no start hook -- "the store has no
    start hook" and "the only thing in the suite that touches S3 at all" --
    which stopped being true when C28 added `ensureBucket`, and which the
    suite's own missing-bucket test contradicts.
- Tracking IDs in code comments. The writing rules keep Change numbers out of
  code comments, but about fifteen remain across source and tests (for example
  in `message-topology`'s deployments and catalog, `db-prisma`, and the Redis
  slice test). Each becomes a statement of the behavior or rationale it was
  standing in for, or is dropped.

**Release.** Bump every workspace package's version together, from
`0.1.0-alpha.13`, and merge `dev` into `main` unsquashed, as previous releases
were.

**After the release, outside this Change's diff.** Two repository changes follow
immediately and are recorded here so they are not lost:

- **Move the repository** from the `lcaseio` organization to a personal account.
  References to the current location: the git remote, the four badge URLs at the
  top of `README.md`, and the GitHub Milestone link in
  `docs/initiatives/evals/eval-milestone.md`.
- **Switch to trunk-based development on `main`.** Changes branch from and merge
  into `main` directly, so work stays current and nothing waits on a periodic
  `dev` merge. That touches CI's `push` and `pull_request` triggers, which name
  both `main` and `dev`; the "last commit (dev)" badge; and retiring `dev`
  itself. How versions are bumped without a `dev` to `main` merge marking a
  release is decided then.

**Completion evidence.**

- Every close-out item above is resolved or explicitly recorded as not done.
- The root `README.md` describes the current architecture, deployment shapes,
  and commands.
- Every workspace package carries the same new version, and `dev` is merged into
  `main`.

### What actually landed

**The drift belonged to four Initiatives, not one.** The documentation pass was
scoped as recording what this Initiative did, but `main` had last received
`v0.1.0-alpha.13`, and `architecture-boundaries`, `events-refactor` and
`worker-tools-artifacts` had all landed on `dev` since. The root `README.md`'s
overview was byte-identical to that release: a single process, an in-memory bus
and queue, Redis Streams and MinIO as candidates. `CLAUDE.md` routed a job
through a `NodeRouter` and an `InMemoryQueue` that `architecture-boundaries`
deleted, and cited a `packages/tools` that `worker-tools-artifacts` dissolved.
`docs/architecture.md` still gave `runtime` and `tools` their own rows. A path
check had passed that file, because the dead packages were named bare in table
cells; a second check compared every workspace package against its text instead.
So the pass became "make the documentation true as of this merge", which cost
more rewriting than patching but touched no more files than planned.

**The README says the job protocol has moved, not that the system is message
driven.** Three event types travel as Messages, `job.httpjson.submitted`,
`completed` and `failed`, and the other twelve families still travel the bus.
The overview keeps "event-driven", because what changed is delivery rather than
what a Message is, and states the migration as partial.

**The app READMEs were wrong in the two apps nobody had touched.** The CLI's
headline example was `run <flow.json>`. The command takes three relational
identifiers, and its documented options and streaming demo no longer exist.
The rewrite leads with `validate` as the one dependable command, which was run
to confirm it. `apps/desktop` still carried the Vite template. The four READMEs
C29 had updated needed nothing.

**The Initiative's own record was corrected, not just closed.** The unscoped
typecheck item was resolved, but by a different mechanism than it recorded. No
`tsconfig.typecheck.json` survives, because C26 made `tsconfig.json` the strict
default and the build config the exception. Lint is real in 27 of 31 packages,
and the other four are deliberate. The remote-worker deployment went into the
shapes section as a waypoint between shapes 1 and 2 rather than a new row. The
six-Change cut is recorded as having run to twelve.

**Two of the comment inventory's items were not quite as recorded.** Of the two
"no start hook" comments in the Worker host's integration test, only one was
wrong. The other is a counterfactual explaining why `ensureBucket` exists, and it
stayed. The sweep also found two comments in `db-prisma` pointing at
`packages/runtime`'s `buildSqlClient`, which now lives in
`@lcase/profile-local-system`. Fifteen Change numbers became the rationale they
stood for, and none were simply dropped.

**Found and recorded rather than fixed.** The `scheduler` event family is dead
but ships in all three host bundles. Deleting it spans four packages and mostly
lives in the `EmitterFactory` that `json-schema-migration` replaces, so it went
to that Initiative. An `mcp` step validates, starts and hangs. The engine still
plans it and emits `job.mcp.submitted`, but nothing subscribes and the worker has
no executor. It went into `docs/todo.md` as a revive-or-remove decision, because
removal breaks the flow definition format. `CLAUDE.md` now says `httpjson` is
the only working capability.

**A merge to `main` is an update, not a release.** Nothing is published or
installable, and the merge prefix has been `update:` since `v0.1.0-alpha.10`.
Every package moved to `0.1.0-alpha.14` in lockstep with the lockfile untouched,
and `main` received it as PR #390. Git tags stopped at `v0.1.0-alpha.7`, which
went unnoticed because `main`'s own history marked each merge. Under trunk-based
development that stops being true, so a tag on each version bump becomes the
only marker. That was decided in principle and left undone, along with
backfilling the six missing tags.

**The follow-ups happened straight after.** The repository moved to
`andrew-mott/lowercase`, and the switch to trunk-based development landed as its
own follow-up. That follow-up covers CI's triggers, the badges, and retiring
`dev`.
