# Configurable Component Placement: Deferred Design Sketch

## Status and scope

This is exploratory research for a possible future placement layer. It does
not define a near-term Change, alter the explicit profiles planned by the
[Remote Worker Arc](../arcs/remote-worker.md), or commit lowercase to supporting
arbitrary deployment layouts.

The immediate plan remains deliberately concrete:

- `local-system` constructs the complete embedded graph;
- an Engine/API-side profile will construct the non-Worker side of the first
  distributed deployment; and
- `worker-host` will construct the Worker side.

Together those profiles will provide useful implementation evidence and
supported deployment presets. They do not have to remain the only way to
describe placement. If more real layouts appear, a deployment definition could
later generate the same process-local host plans instead of adding a profile
name for every permutation.

This sketch refines, rather than reverses, the recommendation in
[`runtime-composition-follow-up.md`](./runtime-composition-follow-up.md). One
universal raw process config with optional dependencies remains undesirable.
The possible future abstraction is a deployment-level placement description
that is projected into explicit local graphs before those graphs are
constructed.

## The problem it might eventually solve

Named profiles are clear while there are only a few supported graphs. They can
become awkward if operators eventually need several independent placement
choices, for example:

- cohost everything for a lightweight install;
- move Worker to a separate pool;
- move Engine out of an HTTP gateway process;
- retain Observability with the gateway or give it a separate host; or
- use one full-capability artifact in several roles while retaining thinner
  purpose-built artifacts elsewhere.

Encoding each combination in a name moves the placement matrix into profile
names. It does not make the matrix safer or easier to validate. Conversely,
exposing arbitrary placement before any of those layouts is needed creates a
configuration language, graph compiler, lifecycle problem, test matrix, and
support promise with little immediate payoff.

The trigger for revisiting this design should therefore be observed repetition
or a product requirement, not merely the fact that component placement can be
imagined as configuration.

## Proposed conceptual split

Keep four representations distinct:

```text
deployment definition
  -> validated host assignments and shared infrastructure
  -> one compiled host plan for a named process role
  -> process profile resolves providers and constructs local objects
  -> managed process lifecycle
```

The deployment definition is upstream of every process profile. It describes
the whole supported system but constructs no component objects. Each running
process receives its identity and projects only its assigned portion.

The future **placement host plan** in this sketch is broader than C21's
messaging-only `ProcessHostPlan`. It would contain or project that Message host
assignment while adding component units, provider requirements, and lifecycle
constraints; it must not silently expand `@lcase/message-topology` into a
whole-system composition package.

A conceptual input might resemble:

```ts
defineDeployment({
  hosts: {
    http: {
      app: "http-gateway",
      units: ["application-services", "observability"],
    },
    engine: {
      app: "engine-host",
      units: ["engine"],
    },
    workers: {
      app: "worker-host",
      units: ["worker"],
    },
  },
  infrastructure: {
    messaging: "redis-main",
    artifacts: "s3-main",
    sql: "postgres-main",
  },
});
```

Assignments use named hosts or process roles rather than `local` and `remote`.
Remote is relative to the process reading the configuration and does not
identify the process that owns the component. A named assignment also leaves
room for several instances of a role without pretending each instance is a
different logical profile.

For a process started with `hostRole = "http"`, a future compiler would produce
a plan containing only the local units, publishers, subscriptions, provider
requirements, and lifecycle constraints for that host. Engine and Worker would
be absent from that plan; they would not appear as optional objects or remote
`ManagedResource` placeholders.

## What can be derived and what remains policy

The placement compiler could derive several useful facts:

- which component handlers this host must bind;
- which logical subscriptions are assigned to another host;
- whether a communication edge necessarily crosses a process boundary;
- which deployment-wide publication and physical-route identities every host
  must share; and
- whether the selected app artifact is capable of hosting every unit assigned
  to it.

It cannot derive every valid infrastructure or behavior choice. A
same-process edge may still deliberately use Redis, while a cross-process edge
cannot use an in-process mailbox. A deployment that separates Engine and
Worker needs mutually reachable artifact and state infrastructure, but
filesystem and SQLite can remain valid for a complete embedded host. These are
explicit deployment constraints, not consequences of the words local and
remote alone.

The compiler also cannot prove that an assigned remote process is alive.
Static deployment validation can prove that each enabled subscription is
assigned to a role and that each role has a compatible app kind. Readiness,
replica availability, heartbeat, and lag remain operational deployment health.

## Process profiles and application artifacts

A profile may eventually accept a compiled host plan without becoming a
universal optional assembler. It still constructs one definite local graph
with required resolved dependencies. The distinction is:

- the deployment layer decides what this host is assigned;
- the app declares the closed set of units and concrete providers it can host;
- the process profile resolves and constructs those assigned local units; and
- assembly receives only the concrete managed resources that actually exist.

One full-capability application could deliberately compile constructors for
Engine, Worker, Observability, and application services. The same artifact
could then run under several host roles. That provides operational flexibility
but retains the production dependency, credential, and attack surface of every
compiled capability.

Thin applications can use the same deployment and host-plan vocabulary while
declaring smaller hostable sets. A `worker-host` artifact rejects a plan that
assigns Engine to it; an HTTP gateway rejects a plan that assigns Worker to it.
This preserves focused `pnpm deploy` dependency closures. A generic compiler
does not make a broad package thin.

## Lifecycle implications

Arbitrary placement turns lifecycle ordering into part of graph compilation.
Each locally hosted autonomous component may contribute real control state and
ordering constraints, while carriers and passive infrastructure retain their
own lifecycle:

- required infrastructure starts before its dependents;
- a component starts before its inbound subscription presents work;
- shutdown quiesces ingress before component drain;
- publications needed by draining work remain available until that work
  settles; and
- dependencies stop only after their consumers.

The generic managed-resource kernel can continue to execute a concrete ordered
plan. It should not import component constructors or discover dependencies
through a service locator. A future placement compiler would need either
explicit dependency metadata from closed first-party construction fragments or
profile-supplied ordering constraints. The first few role-specific assemblers
should provide evidence before choosing either representation.

Worker lifecycle in Change C23 is useful evidence here: it will show whether
ordered start/reverse stop remains sufficient or whether independently
quiesced ingress and an explicit drain phase are required. That decision is
needed for the first remote Worker even if configurable placement is never
built.

## A conservative migration path

The current plan can evolve incrementally:

1. Keep C19's generic assembly and messaging packages independent of the
   `local-system` graph.
2. Let C20 give multi-publication logical subscriptions one shared delivery
   lane before their catalog shape is promoted.
3. Let C21 introduce deployment manifests and process host plans for the two
   concrete deployments without a general placement language.
4. Let C22 give the migrated Messages one ordered Redis observation route using
   those manifests rather than special-case router knowledge.
5. Let C23 establish truthful Worker and ingress lifecycle using those plans.
6. Let C24 prove the explicit companion non-Worker and Worker profiles as one
   supported distributed preset.
7. Add another explicit deployment when a real use case appears.
8. Only after repetition is visible, extract the common placement projection
   from those manifests and treat existing profiles as presets or constrained
   host-plan consumers.

This direction may refactor profile internals later, but it should not require
changes to component Message contracts, carrier interfaces, publication and
subscription identity, passive infrastructure ports, or generic lifecycle
execution.

## Reasons to build it later

Reconsider a placement compiler when at least one of these becomes real:

- a third supported topology duplicates substantial profile wiring;
- operators need to cohost or split components without building a different
  artifact;
- one full-capability artifact intentionally needs to serve several process
  roles;
- deployment tooling needs to validate and render several host plans from one
  source; or
- lifecycle and topology metadata have stabilized enough that extraction is
  smaller than maintaining the explicit profiles.

Until then, named deployment presets provide a smaller configuration and test
surface and make the supported operational shapes obvious.

## Shapes to avoid

- A `local | remote` boolean for each component. It is relative and does not
  identify the owning host.
- One universal process config assembled with `Partial`, `Pick`, or optional
  component dependency bags.
- Remote component placeholders inside a local managed-resource list. A
  process cannot start or stop an object another process owns.
- A runtime-visible service locator or dynamically loaded component registry.
  A future catalog should remain closed, first-party, and host-side.
- Hot relocation of a component in a running process. Initial placement remains
  fixed for the lifetime of a process.
- Claiming that fewer profile names means fewer behavioral permutations. The
  compiler still needs constraints and tests for every supported shape.

## Open questions for the trigger point

- Are placement assignments authored directly, or selected through named
  deployment presets that tooling expands?
- How does a closed constructor catalog preserve useful TypeScript dependency
  completeness after a host plan is parsed from external data?
- Are lifecycle dependencies still an ordered list, or has real drain behavior
  justified a small dependency graph or multiple lifecycle phases?
- Which components may have multiple host instances, and which state ownership
  rules constrain that scaling?
- How are secrets scoped so a full-capability artifact does not automatically
  receive credentials for every capability it could host?
- Which topology and deployment-version checks prevent independently upgraded
  hosts from compiling incompatible plans?
- Does the operational benefit of one flexible artifact outweigh its broader
  dependency and security surface?

Related current decisions are recorded in
[ADR-0007](../../../adr/0007-messages-between-autonomous-components.md) and
[ADR-0008](../../../adr/0008-runtime-profiles-and-shared-assembly.md).
