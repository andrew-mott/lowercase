# C20–C21 seams: delivery lanes, deployment topology, and host bindings

- **Status:** Recommendation incorporated into the Arc plan
- **Date:** 2026-09-11
- **Scope:** The smallest honest delivery-lane, topology, and host-binding design
  that leaves a separately deployed Worker host buildable. This note does not
  specify delivery hardening, Worker lifecycle, application entry points, or a
  general placement compiler.
- **Numbering:** kept as written, and now off by one past C21. The Arc later
  split this note's C21 into C21 (static topology data) and C22 (router,
  carrier, and profile adoption), shifting everything after it. Read C22 through
  C24 below as C23 through C25. The Arc is the authority on numbering.
- **Vocabulary:** kept as written. C20 renamed `Publication` to `Topic` and
  `LogicalSubscription` to `Subscription` in the code; read "publication" below
  as "topic" throughout. This note is left in the words it was written in rather
  than restated in vocabulary that did not exist yet.

## Recommendation in brief

The former combined C20 is split at a responsibility boundary:

1. **Multi-publication logical subscriptions and one delivery lane.** Change the
   subscription cardinality and make both carriers present one logical
   subscription through one shared local lane. Merge Observability's two HTTP-job
   subscriptions into that one subscription and prove local FIFO behavior.
2. **Deployment topology and process host bindings.** Promote the resulting
   catalog, introduce deployment manifests and host plans, validate the
   deployment-wide partition, narrow `seal()` to the local plan, and reject a
   partial in-process topology.

The Arc numbers these as C20 and C21. A later sequencing decision inserts one
ordered Redis observation route as C22 before Worker lifecycle in C23 and the
remote-host proof in C24. The original split remains warranted even if the line
counts land at the low end, because its two reviews ask different questions:
delivery semantics in the first and topology completeness in the second.

For Q1, use a **hybrid with carrier-neutral delivery-route IDs assigned to
logical delivery edges and one carrier realization at the manifest's top
level**:

> `(publication ID, logical subscription ID) -> delivery route ID`

Do not use today's implicit `publication ID -> Redis stream` rule, and do not add
carrier-shaped route records yet. The edge cardinality is the structurally
important part. It permits a publication to reach a work route and an
observation route later, while a publisher-facing endpoint still exposes no
consumer identities. The route records remain neutral. The manifest as a whole
is parameterized once with the deployment-owned carrier and namespace
realization consumed by every host; neutral must not mean that each process
invents physical defaults independently.

“Smallest” therefore means:

| Axis                  | Economize now                                                                                                    | Do not economize                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Guarantee strength    | No retry, reclaim, liveness, cancellation, outbox, deduplication, remote total order, or configuration framework | Loud static catalog, deployment, process, and carrier-compatibility failures                                         |
| Structural generality | No carrier plugin surface, placement language, or speculative route policy                                       | N conversations, N roles, multi-publication subscriptions, publisher/subscriber asymmetry, and edge-to-route mapping |

The proposed representations are ordinary typed data plus two small pure
operations. Calling this a compiler would promise substantially more machinery
than the requested topology work needs.

## What the current implementation establishes

The recommendation follows from five concrete seams in the post-C19 code.

1. [`LogicalSubscription`](../../../../packages/ports/src/messaging/message-topology.types.ts)
   contains exactly one `publication`. Its generic parameter is consequently one
   publication's event-type tuple, not the union selected by a multi-publication
   subscription.
2. [`MessageRouterTopology`](../../../../packages/process-hosting/message-router/src/message-router.ts)
   is the whole catalog, and `assertTopologySealable()` requires every declared
   subscription to be locally bound. That is safe only while one process hosts
   the entire topology.
3. The
   [in-process router](../../../../packages/process-hosting/message-router/src/in-process/in-process-message-router.ts)
   builds its destination table solely from locally bound mailboxes. A partial
   host can therefore seal only after the completeness check is narrowed, but
   publishing from that partial host would silently omit remote destinations.
4. The
   [Redis router](../../../../packages/process-hosting/message-router/src/redis/redis-message-router.ts)
   derives a stream from `keyPrefix + publication.id`, derives a group from
   `subscription.id`, and defaults the consumer member name to `local`. It also
   provisions groups only for locally bound subscriptions. Those are convenient
   conventions, not yet a deployment model.
5. The
   [local-system profile](../../../../packages/process-hosting/profile-local-system/src/local-system.profile.ts)
   imports the complete HTTP-job topology, resolves two publishers, binds all
   four current subscriptions, and seals one router. The sequence is good; the
   set against which it seals is what must become process-local.

The existing split between a durable logical subscription and a running consumer
member is sound. A Redis group is durable purpose identity, whereas a consumer
name identifies one running member. The latter is process-instance
configuration and does not belong in a deployment manifest.

## Q1: route representation

### Decision

Put an opaque, carrier-neutral `DeliveryRouteId` in the manifest and assign it
per logical delivery edge. A route ID is deployment identity, not protocol
identity: changing a stream layout should not rename a publication or
subscription.

The manifest should be able to express this evolution without a schema change:

| Logical delivery edge                              | Minimum remote-Worker route | Later ordered-observation route |
| -------------------------------------------------- | --------------------------- | ------------------------------- |
| command publication -> Worker subscription         | command-work                | command-work                    |
| command publication -> Observability subscription  | command-work                | observation                     |
| terminal publication -> Engine subscription        | terminal-work               | terminal-work                   |
| terminal publication -> Observability subscription | terminal-work               | observation                     |

The current deployment uses one distinct route per publication. That is a fact
about its values, not an invariant in the type. In the later column, each
publication reaches two distinct routes, while both observation edges converge
on one route. A singular `publication -> route` map cannot represent that
without replacement.

The publisher asymmetry remains intact. The deployment resolver takes all
edge assignments for a publication and produces its distinct route set. The
component still receives one publication-bound `MessagePublisher`; it sees
neither subscriptions nor roles. The wording “a publisher knows its route”
should therefore be read as “its resolved route set.”

### Carrier realization

| Identity or setting                         | Owner in the minimum design                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Publication and logical-subscription IDs    | Protocol catalog                                                                         |
| Delivery-route ID and edge assignment       | Deployment manifest                                                                      |
| Carrier family and Redis namespace          | One shared deployment-level route-realization choice                                     |
| Redis stream                                | Shared namespace plus delivery-route ID, resolved by the carrier without a local default |
| Redis consumer group                        | Logical-subscription ID within that stream                                               |
| Redis consumer name                         | Running process-instance configuration                                                   |
| In-process mailbox                          | Runtime object created once for a locally hosted logical subscription                    |
| Redis endpoint, credentials, block interval | Process/provider configuration                                                           |

For Redis, one logical subscription selecting publications on two streams
temporarily has two physical group instances: the pairs `(stream A,
subscription ID)` and `(stream B, subscription ID)`. Reusing the group string
does not create one cross-stream checkpoint. Redis documents `GROUP group
consumer` together with a list of stream keys, but the returned entries remain
partitioned by stream and provide no common occurrence order across those
streams. See the official
[`XREADGROUP` reference](https://redis.io/docs/latest/commands/xreadgroup/).

The route ID stays opaque and carrier-neutral; it is not a fully qualified Redis
key. The manifest must hold one shared, top-level route-realization choice—at
minimum the carrier family and, for the log-backed case, a required
namespace/key-derivation rule. Every host consumes that same field. The router
should not independently select a carrier or silently substitute `lcase:` when
two hosts are supposed to agree.

This top-level realization choice is different from carrier-shaped records on
every route. Redis endpoints and credentials can remain process/provider config
because network addresses and secrets may legitimately differ by host, but the
configuration must identify the same backing deployment. Static topology cannot
prove that two URLs reach the same Redis instance.

Likewise, `local` is an acceptable embedded consumer-member default but not a
deployment identity. The split host should supply a process-instance name; a
later replicated role will need that value to be unique among concurrently
running members of the same group. This is ordinary app configuration, not a
host-plan field.

### Why not carrier-shaped records now

A carrier-shaped record on every route is more explicit, but at this guarantee
level Redis has no required per-route value beyond a name and in-process has no
physical field at all. The one top-level realization choice already selects the
carrier family. Repeating a provider variant for each route would add empty
local records and encode Redis policy that is expressly deferred: retention,
partitions, offsets, recovery, and multi-route admission.

A neutral route ID also survives a third grouped-log carrier: that carrier adds
a route-realization function without changing catalogs, delivery edges, role
assignments, or host plans. If a real carrier later needs an externally fixed
topic, exchange/queue bindings, partitions, retention, or mixed carriers in one
deployment, add a carrier-realization table keyed by `DeliveryRouteId`. That is
the evidence threshold for carrier-shaped records.

This is smaller by roughly 15–30 source lines now, but that is not the decisive
reason. It keeps the stable model about delivery topology and leaves provider
policy with the provider.

### Carrier capability checks remain separate

The neutral manifest may describe more than the current Redis carrier can
honestly execute. That is intentional, provided carrier selection fails loudly.
The present Redis realization should require:

- all edges from one publication to resolve to one distinct route, until
  multi-route admission and partial-write policy exist; and
- a route's publication/subscription layout to be realizable by a grouped log.
  Because every consumer group on one stream sees that stream's entries, a route
  cannot contain only selected corners of a publication/subscription matrix
  unless the carrier implements explicit filtering.

The future observation manifest can therefore be represented now but will be
rejected by the current Redis capability check until multi-route publication is
implemented. Removing a capability restriction later is smaller and safer than
replacing a publication-shaped manifest.

### Provisioning consequence, but not topology-Change scope

The full manifest makes it possible to provision all Redis route/group pairs
before external publishing begins. The current router instead creates groups
only for locally bound subscriptions and starts them at `latest`; a
publisher-first boot can therefore append before a remote group exists.

That is a real remote-host startup prerequisite, but it is not necessary to
establish the static representation or local-binding checks. Keep provisioning
out of the topology Change. Before exposing external intake, the remote-host
Change must explicitly solve and test the publisher-before-group race. Options
include idempotent full-manifest or external provisioning, enforced startup
ordering, or beginning at the start of a demonstrably fresh deployment-owned
route. None proves that a remote consumer stays alive.

## Q2: minimum representation

### Data

Four small data shapes are enough. The identifiers can remain inferred strings;
branded IDs and a runtime schema are not needed.

| Shape                  | Minimum content                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol catalog       | Publication declarations and logical-subscription declarations assembled from any number of conversation modules                        |
| Delivery-route binding | Publication ID, subscription ID, and delivery-route ID for one logical delivery edge                                                    |
| Process host plan      | Role ID, publication IDs it may publish, and subscription IDs it serves; no handlers, components, carrier clients, or lifecycle objects |
| Deployment manifest    | Enabled publication/subscription IDs, route bindings, any number of process host plans, and one shared carrier-realization choice       |

Host plans should be stored once inside the deployment definition. A profile
must not hand-author a second copy. The plan stays exactly the settled data
shape—role plus publication and subscription IDs. Publisher routes and inbound
subscription routes are derived from the manifest when the router is resolved;
copying them into the host plan would create two route authorities.

### Operations

Only two new public pure operations are justified:

- **Deployment assertion:** validate the complete catalog/manifest graph and all
  host assignments without importing a profile. This runs at the deployment
  definition boundary or in its tests/preflight, where importing the composed
  catalog is appropriate.
- **Host-plan selection:** perform the manifest-only structural checks and select
  the one canonical host assignment for a role. It does not import the complete
  runtime catalog into every process.

The router then resolves that data against the statically imported conversation
declarations and later receives concrete handlers through `bind()`. This does
not merit a compiler class, intermediate representation, registry, or plugin
surface. “Compilation” is a useful verb for projection, not a subsystem.

This distinction preserves selective imports. Complete catalog-to-manifest
compatibility is a deployment-definition check; each running process needs only
the full ID-based manifest and the canonical conversation declarations for its
own publishers and subscriptions. Compile-time ID unions can reach the manifest
through type-only imports, and a deployment test can import the runtime catalog
aggregate without making every host do so.

Estimated core size, before carrier/profile adoption:

| Work                           | Source lines |  Test lines |       Total |
| ------------------------------ | -----------: | ----------: | ----------: |
| Data shapes and documentation  |        30–50 |           — |       30–50 |
| Deployment assertion           |       70–110 |     130–190 |     200–300 |
| Host-plan selection/projection |        20–35 |       50–70 |      70–105 |
| **Core total**                 |  **120–195** | **180–260** | **300–455** |

The projection itself should stay around 20–35 lines. Most of the size is the
negative validation matrix, which is the requested low-cost guarantee rather
than framework overhead.

### N-role evidence

Use a synthetic four- or five-role manifest in the static-topology tests:

- Engine publishes commands and consumes terminals;
- Worker consumes commands and publishes terminals;
- Observer owns the multi-publication observation subscription;
- Gateway has no Message subscriptions; and
- optionally, a fifth role participates in a second synthetic conversation.

This proves the representation without inventing unimplemented production
run-lifecycle or observability conversations. It is a data fixture in the
topology package, not a test-only package importing every profile. The real
remote-Worker manifest should contain only roles and conversations that the
deployment actually supports.

## Q3: ownership and package home

Create one dependency-clean static package under the new organizational folder:

`packages/process-hosting/message-topology` as `@lcase/message-topology`.

It should use explicit subpath modules rather than a root export that eagerly
assembles every catalog:

| Module responsibility                                             | Suggested module home            |
| ----------------------------------------------------------------- | -------------------------------- |
| Shared Worker-job conversation                                    | `catalog/worker-job`             |
| Future run lifecycle, component lifecycle, or other conversations | Separate sibling catalog modules |
| Generic manifest/host-plan data and pure deployment validation    | A neutral core module            |
| Embedded assignment preset                                        | `deployments/local-system`       |
| First split assignment preset                                     | `deployments/remote-worker`      |

This is one package, not one source blob. Catalog and deployment modules have
different reasons to change, but separate workspace packages do not yet buy a
dependency-closure benefit: both are small static data, import no components,
profiles, adapters, or process graphs, and are consumed together by the first
two deployments. Split them into independently released packages only when a
second independently owned deployment family supplies evidence.

Selective imports still matter inside the package. A process imports the chosen
deployment data and only the catalog modules for publications it emits or
subscriptions it handles. Manifest references should therefore remain IDs;
compile-time type-only imports and deployment tests can compare the complete
manifest with the complete catalog without making every process load every
conversation module. In particular, the deployment-manifest module must not
runtime-import the aggregate catalog merely to validate itself; put that
aggregate assertion in a sibling test or explicit preflight entry point.

The generic active carrier machinery stays in `@lcase/message-router`. It owns
binding, sealing, carrier capability checks, local delivery lanes, and Redis or
in-process realization. The static package should own declaration helpers such
as `definePublication`/a corresponding subscription helper so product catalog
modules do not depend at runtime on an active carrier package. This also allows
both packages to remain free of component and adapter dependencies.

Do not put the shared product values in:

- `@lcase/ports`, which owns contracts rather than product topology values;
- `@lcase/message-router`, whose generic mechanism should not acquire lowercase's
  Worker-job catalog; or
- `@lcase/profile-local-system`, because the second host is the concrete reason
  those identities are now shared.

Host plans do not receive their own package. They are data nested in each
deployment manifest and selected by role. A future broader deployment-definition
package may absorb the concrete deployment modules when they grow shared SQL,
artifact, credentials, and launcher policy; this topology work should not
pre-build that layer.

## Q4: exact validation and the narrowed `seal()`

The safety property should move, not disappear. Today one process's `seal()`
stands in for both deployment completeness and local binding completeness.
After the split, those are separate exact-set checks.

### Catalog checks

- Publication IDs are unique.
- Subscription IDs are unique.
- Every subscription selects a non-empty list of publications.
- A subscription does not select the same publication twice.
- Every selected publication is a canonical declaration in the catalog.
- The handler type is derived from the union of all selected publications' exact
  Message types; a focused type test proves the union and rejects an unrelated
  type.

### Manifest-only deployment checks

These use the complete ID-based manifest and require no profile or runtime
catalog import:

- Enabled publication and subscription IDs are unique.
- Route IDs are non-empty, and every route binding names enabled publication and
  subscription IDs.
- Every enabled publication and subscription participates in at least one route
  binding; duplicate delivery-edge bindings fail.
- Role IDs are unique; an empty publisher/subscriber assignment is valid for a
  real gateway or application-services process.
- Every enabled subscription occurs in exactly one host plan. Unknown, missing,
  or multiply assigned subscriptions fail.
- Every publication named by a host is enabled and routed.
- The carrier-realization choice is present and well formed at its deliberately
  small top-level shape.

### Catalog-to-manifest deployment checks

The deployment definition's test or preflight also composes the full catalog and
proves:

- Every enabled publication and subscription ID exists in the catalog.
- Every publication selected by an enabled subscription is enabled.
- Every enabled logical delivery edge has exactly one route binding.
- Every route binding names a catalog-declared edge; an invented edge fails.
- Every enabled publication is selected by at least one enabled subscription.
  This is the deployment-level replacement for today's orphan-publication check.

Keeping this aggregate check out of ordinary host-plan projection is what lets a
Worker process import the Worker-job conversation without importing future
Engine-only and Observer-only conversation modules. The deployment remains
fully checked; the check simply runs at its actual ownership boundary.

Subscription assignments form a partition. Publisher permissions need not:
they authorize use of a publication rather than declare exclusive producer
ownership, so more than one role may legitimately hold the same permission and
a later externally sourced publication may have no component host. If multiple
authoritative producer roles become a real concern, add that policy with the
producer model rather than smuggling it into subscription completeness.

### Process/router checks

- A process may bind only a subscription assigned to its role.
- Binding the same local subscription twice fails immediately.
- A binding must match the canonical catalog declaration for that ID, including
  all selected publication IDs. The router uses the canonical declaration for
  routes and allowed Message types.
- `seal()` requires exact set equality between locally bound subscription IDs and
  the role's planned subscription IDs. Missing and extra bindings both fail.
- Subscriptions assigned to other roles are irrelevant to that process's
  `seal()`.
- A process may request a publisher only for a publication allowed by its host
  plan.
- A same-ID publication carrying counterfeit type declarations fails at
  publisher resolution rather than obtaining a misleading generic type.

The canonical-object checks close an existing small hole: both carriers
currently authorize `bind()` by subscription ID and then use the caller-supplied
subscription object to choose its publication. A same-ID object pointing at a
different publication can therefore pass the ID check. The host-binding Change
should not preserve that behavior while making IDs the process-plan boundary.

For `local-system`, the host plan contains all enabled subscriptions, so exact
local set equality preserves today's missing-handler safety. For a Worker host,
the same check contains only Worker subscriptions and no Engine or Observability
handler is required locally. The manifest partition supplies the missing global
half.

These checks still do not prove that a profile constructed every declared
publisher, that a handler is behaviorally correct, or that another role is
running.

## Q5: the in-process honesty gap

Enforce this in the topology/host-plan Change, before constructing or sealing an
in-process router.

Under the current one-carrier-per-profile model, require every enabled
subscription assignment and every declared publisher permission to belong to
the selected host before the in-process carrier is allowed. Also reject an
enabled publication with no local publisher permission: an external or
unassigned producer cannot reach an object-only mailbox. A split Worker manifest
plus in-process carrier then fails at startup rather than silently routing only
to local mailboxes. A single complete host remains valid with either carrier;
additional roles whose Message host plans are empty do not matter.

That check establishes role-level coverage, not process-instance co-location.
An in-process deployment must additionally be a singleton process realization:
launching two instances of the complete role would give each an isolated
mailbox graph, not replicas of one shared carrier. The minimum manifest has no
replica-count or leader-election model, so the embedded deployment preset and
its launcher own that restriction; static topology cannot infer or police how many OS
processes an operator starts.

This is a carrier-compatibility assertion in `@lcase/message-router`, not a
component rule and not an unconditional manifest rule. The same split
route-and-assignment graph remains valid when paired with a Redis realization.

The lasting invariant is slightly more general: every participant in a
publication realized in-process—its publishing roles and all roles assigned
matching subscriptions—must be co-located. That would allow several processes
to use in-process carriers for independent, disconnected conversations. The
host-binding Change does not need mixed per-route carriers, so the
whole-manifest restriction is the smaller safe policy. It establishes
co-location, not that a declared publisher was actually constructed or invoked.
Generalize only when a real mixed-carrier deployment needs it; name that
restriction now so it is not mistaken for a semantic law.

This check is worth roughly 20–35 source lines and 30–50 test lines. Deferring it
would make the central new partial-host shape appear supported by a carrier that
cannot implement it.

## Q6: one multi-publication Observability subscription

### Minimum honest shape

A logical subscription selects a non-empty tuple of explicit publications. Its
handler type is the union of those publications' Message types. One binding owns
one delivery lane and one aggregate `maxInFlight`; there is no wildcard.

For the in-process carrier:

- create one mailbox/lane for the bound logical subscription;
- register that same lane under every selected publication; and
- with `maxInFlight: 1`, preserve start and settlement order across the order in
  which Messages were enqueued, even when they came from different publications.

For Redis's current two-stream realization:

- create one local lane for the logical subscription;
- run one reader for each distinct selected stream;
- provision the subscription ID as a group name on each stream;
- feed deliveries from every reader into the shared lane, so `maxInFlight`
  applies to the logical subscription rather than independently per stream; and
- acknowledge each entry after its own handler settles, retaining the current
  at-most-once behavior.

Do not add multi-stream reading to `MessageLogPort`. Its current API is
single-stream ([source](../../../../packages/ports/src/message-log/message-log.port.ts)),
and a multi-stream Redis call would neither create one cross-stream group nor
provide a causal merge. One reader per stream plus one shared local lane is the
smaller truthful realization.

### Exact ordering claim

| Carrier shape                            | Guarantee that can be claimed now                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| In-process, one lane                     | FIFO handler starts and settlements across local enqueue order when `maxInFlight` is one             |
| Redis, separate streams feeding one lane | Handler invocations are serialized in local lane-enqueue order; no order is promised between streams |
| C22 single observation stream            | One Redis stream-entry order for the migrated Messages on the transaction-backed happy path          |

The first row fixes the present local defect: Observability currently has two
independent mailboxes, so a terminal handler can overtake a blocked submitted
handler. The second row does not claim that serialization reconstructs a global
order that Redis did not provide.

`ObservabilityTap` needs no source change for the minimum. Its awaited `ingest()`
method is already a suitable handler; the profile changes from two bindings to
one. The guarantee covers the selected Message publications only. Events still
arriving through `EventBusPort` are not ordered against Message ingress, because
the remaining event families have not migrated.

### Proportionate tests

- Type-level coverage for the exact union and rejection of an unrelated Message
  type.
- Catalog failures for an empty selection, duplicate publication selection, and
  an undeclared selection.
- In-process proof that one binding receives two publications exactly once and
  that a blocked first delivery prevents the second from starting.
- Redis fake-log proof that both streams create group instances for the same
  logical subscription ID, both reach one handler and acknowledge, and
  `maxInFlight: 1` prevents overlap. Do not assert which stream wins a race.
- Existing in-process and real-Redis vertical slices still prove independent
  Engine/Worker and Observability delivery. Only the in-process slice asserts
  submitted-before-terminal order.

Estimated semantic change:

| Area                                   | Changed/new lines |
| -------------------------------------- | ----------------: |
| Port types and common assertions       |             30–50 |
| Shared delivery-lane adaptation        |             35–60 |
| In-process router                      |             15–30 |
| Redis router                           |             55–90 |
| Product topology and profile binding   |             20–35 |
| Unit and type tests                    |           100–160 |
| Vertical-slice tests                   |             25–45 |
| Mechanical fixture/declaration updates |             40–50 |
| **Total**                              |       **320–520** |

The current relevant files total 2,692 lines, but only the range above should be
semantic churn. If `subscription-mailbox.ts` becomes a carrier-neutral delivery
lane, its roughly 100 lines should be reviewed as a rename plus a focused change,
not as a delete/rewrite.

## Q7: size and proposed Change split

### Inventory

#### Multi-publication subscription Change

| Responsibility                          | Expected changed/new lines |             Expected moved lines |
| --------------------------------------- | -------------------------: | -------------------------------: |
| Port cardinality and catalog assertions |                      30–50 |                                — |
| Shared lane and carrier adaptations     |                    105–180 | 80–100 if the mailbox is renamed |
| Product catalog/profile binding         |                      20–35 |                                — |
| Unit, type, and slice tests             |                    125–205 |                                — |
| Mechanical fixture updates              |                      40–50 |                                — |
| **Total**                               |                **320–520** |                        **0–100** |

#### Deployment topology and host-binding Change

| Responsibility                                                              | Expected changed/new lines | Expected moved lines |
| --------------------------------------------------------------------------- | -------------------------: | -------------------: |
| Static data shapes, deployment assertion, host selection, and focused tests |                    300–455 |                    — |
| Shared Worker-job catalog/package scaffolding                               |                      20–40 |              100–140 |
| Embedded and remote-Worker manifest values and tests                        |                     70–120 |                    — |
| Exact router binding/publisher checks and carrier-plan adaptation           |                    130–210 |                    — |
| In-process compatibility and Redis route-capability checks and tests        |                      50–90 |                    — |
| Local-system profile and slice adaptation                                   |                      45–80 |                    — |
| **Total**                                                                   |                **615–995** |          **100–140** |

The second estimate has the greater uncertainty because route capability and
exact local-plan tests may overlap existing carrier tests. Treat 615–995 as the
pre-Change review range, not a commitment to fill it.

Its moved-line range includes the current 42-line declaration helper and
79-line HTTP-job topology. Both also need semantic edits, so rename detection may
report part of that work as changed rather than moved.

Together, the former combined C20 was approximately **935–1,515 semantic
changed/new lines**, **18–24 affected or new files**, plus **100–240 rename-aware
moved lines**. That is reviewable in the abstract, but it combines two
independent invariants and forces the manifest types to change while they are
being introduced.

If the topology/host-binding Change inventories near its upper bound and is not
comfortable as one review, its fallback seam is also explicit:

1. static catalog promotion, manifest/host-plan types, edge-route representation,
   deployment presets, and deployment-level validation; then
2. router/carrier/profile adoption, exact local sealing, publisher authority,
   and the in-process compatibility check.

That contingency is preferable to reducing the validation matrix or hiding
runtime adoption inside the static-data Change.

### Recommended sequence

1. Establish multi-publication subscription typing and one shared delivery lane
   while the current single-host topology ownership remains temporarily intact.
2. Promote that now-final catalog shape and introduce deployment/host
   projection, exact local sealing, route identities, and in-process honesty.
3. Map the migrated observation edges to one Redis route and add
   transaction-style multi-route admission.
4. Continue with Worker lifecycle/controlled ingress.
5. Build and prove the two-process Worker deployment.

This is sequencing by responsibility, not an implementation plan. Doing the
subscription change first avoids introducing a single-publication manifest and
immediately rewriting it.

## Explicit cut list

These items are excluded from both recommended Changes, even where later Arc
sequencing now names their owner.

| Item excluded from C20–C21                                                                      | Why it is cut now                                                          | Next trigger or owner                                                                                            |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| External manifest file format, schema, loader, or version negotiation                           | Typed in-repo data and loud assertions are enough for a solo alpha         | A launcher or operator must supply manifests independently of the built artifact, or hosts upgrade independently |
| General component-placement compiler                                                            | Host plans already express N roles without constructing graphs             | A third supported placement duplicates substantial profile wiring or operators need arbitrary co-hosting         |
| Dynamic role/component registry or plugin surface                                               | All roles and protocols are first-party and statically linked              | A real third-party extension ecosystem appears                                                                   |
| Carrier-shaped route records or per-route override tables                                       | No current carrier needs non-derivable route policy beyond an ID           | A carrier needs fixed external names, partitions, retention, exchange bindings, or mixed carriers                |
| One physical Redis observation stream                                                           | Excluded from C20–C21 to keep their reviews on delivery lanes and topology | Scheduled as C22 before the separately deployed Worker proof                                                     |
| Multi-route Redis publication                                                                   | C21 represents and rejects it as unsupported active carrier behavior       | C22 assigns work and observation edges to different routes                                                       |
| Atomic multi-route admission, outbox, or reconciliation                                         | C20–C21 perform no dual write                                              | C22 adds transaction-style happy-path admission; reconciliation remains deferred                                 |
| Cross-stream total ordering, sequence numbers, clocks, or watermarks                            | Serial receiver processing cannot establish source order                   | Product behavior depends on a durable order across physical routes                                               |
| Ordering legacy `EventBusPort` ingress with Message ingress                                     | Most lifecycle families still use the bus                                  | Those families migrate and one Observer must settle all of them together                                         |
| Multi-stream `MessageLogPort` API                                                               | It adds transport shape without solving group scope or total order         | Another carrier operation genuinely needs one atomic multi-route read                                            |
| Retry, pending reclaim, retained failures, dead letters, idempotency, duplicate terminal policy | Explicitly outside the alpha guarantee floor                               | The remote proof is promoted from at-most-once boundary evidence to recoverable service behavior                 |
| Remote liveness, heartbeat, federation, or health protocol                                      | Static assignment is not evidence that a process is running                | Operational readiness requires replica/lag health across roles                                                   |
| Replica-count or distributed-singleton enforcement for in-process realization                   | Role data cannot count live OS processes; the embedded preset assumes one  | A supported in-process deployment may run more than one instance                                                 |
| Cancellation across the boundary                                                                | It is a component protocol and Worker policy, not topology metadata        | Remote callers require cancellation semantics                                                                    |
| Worker lifecycle and independently controlled ingress                                           | Already has its own responsibility boundary                                | The following lifecycle Change                                                                                   |
| Per-route mixed carriers and disconnected local conversations across hosts                      | The first manifests select one carrier shape                               | A supported deployment needs both local and remote routes simultaneously                                         |
| Publisher-before-group startup policy and Redis group provisioning                              | The manifest exposes enough information, but this is startup behavior      | Before the remote-host proof exposes external publishing                                                         |
| MCP, run/step, Limiter, Replay, and remaining lifecycle migrations                              | The current catalog has no evidence for their final conversations          | Each conversation is migrated as an atomic protocol slice                                                        |
| Splitting the broad adapters package                                                            | Neither C20 nor C21 supplies deployable-closure evidence                   | The remote Worker artifact shows material unrelated production dependencies                                      |

## Review of the settled assumptions

The direction is sound. Six qualifications should be recorded.

1. **Publisher route is plural internally.** Settled item 3 remains correct about
   authority and consumer hiding, but a publication can later resolve to both a
   work route and the observation route.
2. **Process validation should be exact and canonical.** “Every assigned
   subscription has a handler” is necessary but incomplete. The bound ID set
   must equal the local assignment set, and a binding/publisher bearing a known
   ID must match the catalog declaration behind that ID.
3. **One serial lane is not one Redis order.** It gives a settled local FIFO
   sequence for in-process delivery and non-overlapping receiver processing for
   separate Redis streams. It does not establish an inter-stream causal order or
   order legacy EventBus ingress with Message ingress.
4. **There is one manifest per deployment preset.** Embedded and remote-Worker
   assignments cannot coexist in one role partition. They share the composed
   protocol catalog, not one universal assignment table.
5. **Neutral route IDs still need one shared physical realization.** Carrier
   family and namespace/key derivation are deployment-owned inputs consumed by
   every host, not defaults independently chosen inside each router.
6. **In-process completeness assumes one process instance.** A role-level
   partition can prove that all Message participants are assigned together; it
   cannot prove that an operator did not launch two isolated copies of that
   role. The embedded preset remains singleton until process multiplicity is
   modeled and enforced elsewhere.

Two claims are slightly stronger than necessary but harmless if read as design
intent. An `observer-host` could technically host two separate subscriptions;
one multi-publication subscription is justified because it is one observation
purpose with one lane, not because a separate process is otherwise impossible.
Likewise, co-locating every Message publisher permission and subscription is a
safe minimum restriction for the in-process carrier; the durable rule is
per-publication co-location if mixed carriers are ever introduced.

No settled item needs to be rejected, and the ingress/egress lifecycle split
should remain in its own later Change.

## Direct answers

| Question | Answer                                                                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1       | Use the minimum hybrid: carrier-neutral route IDs per publication/subscription edge and one top-level manifest carrier/namespace realization; defer per-route carrier-shaped records.                     |
| Q2       | Four plain data shapes and two pure operations; about 300–455 lines including focused tests for the core representation. No compiler subsystem.                                                           |
| Q3       | One dependency-clean `@lcase/message-topology` package with explicit catalog and deployment subpaths; active carrier behavior remains in `@lcase/message-router`; host plans remain nested manifest data. |
| Q4       | Global catalog/manifest exactness plus exact canonical local binding equality at `seal()`; the embedded plan still contains every subscription.                                                           |
| Q5       | Require one complete Message-bearing role plus a singleton process realization for in-process; later generalize to per-publication co-location if mixed carriers appear.                                  |
| Q6       | Land it first as its own Change: one non-empty multi-publication subscription, one shared lane, local FIFO, Redis serialization without cross-stream order.                                               |
| Q7       | Split: 320–520 changed/new lines for subscription/lane work, then 615–995 plus 100–140 moved lines for topology/host work; use the named static/runtime fallback seam near the upper bound.               |

## Sources

- [Remote Worker Arc](../arcs/remote-worker.md), especially its target shape and
  C20–C24 discussion.
- [ADR-0007: Messages between autonomous components](../../../adr/0007-messages-between-autonomous-components.md),
  especially topology, fanout, admission, and the unresolved physical
  observation route.
- [ADR-0008: Process profiles and shared typed assembly](../../../adr/0008-runtime-profiles-and-shared-assembly.md),
  especially deployment definitions, process profiles, and package ownership.
- Current router evidence:
  [`message-router.ts`](../../../../packages/process-hosting/message-router/src/message-router.ts),
  [`in-process-message-router.ts`](../../../../packages/process-hosting/message-router/src/in-process/in-process-message-router.ts),
  and
  [`redis-message-router.ts`](../../../../packages/process-hosting/message-router/src/redis/redis-message-router.ts).
- [Redis `XREADGROUP` command reference](https://redis.io/docs/latest/commands/xreadgroup/)
  and [Redis Streams documentation](https://redis.io/docs/latest/develop/data-types/streams/).
