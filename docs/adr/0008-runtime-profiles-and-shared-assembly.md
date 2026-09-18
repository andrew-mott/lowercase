# ADR-0008: Process profiles and shared typed assembly

Date: 2026-09-07
Status: Proposed

## Context

lowercase must assemble the same application capabilities into several real
process shapes: an embedded local system, an HTTP server, a CLI, and eventually
separately deployed component hosts. Those shapes share construction and
lifecycle policy, but they do not host the same graph or support the same
concrete infrastructure choices.

The former runtime treated placement, transport, and storage as entries in
universal registries and factories. Most registry combinations selected the
same implementation, some important resources bypassed the model, and separate
bootstrap paths duplicated lifecycle wiring. The abstraction obscured three
different decisions:

- which behavioral components a process hosts;
- how those components communicate; and
- which concrete backend implements each passive infrastructure port.

The project does not need third-party runtime plugins or arbitrary providers
loaded by name. It needs a visible, type-checked object graph, a bounded set of
choices for each deployable, and reliable startup and shutdown for resources
that actually have lifecycle.

The current embedded foundation already exercises this direction. It has a
shared `ManagedResource<T>` vocabulary, ordered startup, reverse shutdown and
failed-start rollback, a typed `assembleEmbeddedSystem()` boundary, and a
shared `local-system` profile used by more than one app. That profile now
selects filesystem or S3, SQLite or Postgres, and in-process or Redis-backed
Message delivery without changing its component-facing contracts.

The package containing that profile is still named `@lcase/runtime`, however,
and also contains the shared lifecycle machinery, generic Message carriers,
protocol topology values, every concrete system builder, and dependencies on
the complete embedded application. That was harmless while the only running
shape was the whole system. A separately deployable Worker host is the first
real process role for which it is false: importing the generic pieces from the
current package would also install Engine, application services, Observability,
Replay, Limiter, and their transitive dependencies. The new process boundary
therefore supplies the evidence for separating the shared mechanism from the
one profile that happened to prove it first.

This ADR is partly retrospective to the embedded implementation while remaining
Proposed. The Worker host and the package separation have not yet supplied the
second-profile implementation evidence.

## Decision

Use explicit process-role profiles over shared, technology-independent typed
assembly and lifecycle code.

### Terms and ownership

Use four different terms for four different scopes:

- A **system** is the complete running product: its application processes and
  the infrastructure they use.
- A **deployment definition** selects those processes, their process profiles,
  shared topology, infrastructure, and configuration. Docker Compose,
  Kubernetes, systemd, or another launcher may realize it.
- A **process profile** is the programmatic composition policy for one process
  role or product.
- An **app** is the deployable executable that loads configuration, creates one
  process profile, and owns signals, readiness, exit behavior, and its artifact.

The embedded `local-system` profile is not the definition of runtime. It is one
profile whose process happens to host almost the whole system. A distributed
system instead has several process profiles coordinated by one deployment
definition; no application process constructs objects hosted by another.

### Process profiles

A process profile:

- defines and validates that profile's configuration;
- imports only the concrete implementations the profile supports;
- resolves providers and constructs the local object graph;
- adapts resources with real lifecycle into managed resources; and
- declares the role-specific assembly, inline or through a focused assembler.

Provider selection is static for the lifetime of a process. A profile may offer
a bounded configuration choice, such as filesystem versus S3, but only between
implementations deliberately compiled into that profile. Components and
application services never select adapters or look them up by string.

Each OS process has one profile composition root and owns only its local graph.
The profile, rather than a privileged universal runtime package, is the only
layer allowed to import the concrete components and adapters needed to build
that graph.

### Deployment definitions

A deployment definition is not another universal application profile. It does
not construct component objects. It declares which process roles and
infrastructure instances make up one supported deployment and supplies shared
configuration that must agree across processes, such as Message protocol
identity and physical Redis routing.

This distinction is deliberately invisible in the embedded case: one process
profile can realize the whole deployment. It becomes required once Engine and
Worker are separate, because process-local assembly can prove only its own
bindings; deployment-wide completeness and remote-process liveness are
different guarantees.

A deployment in which every behavioral component runs elsewhere is not an
empty shared profile. It is a deployment definition naming the real process
profiles. If a gateway or application-services process remains, that process
has its own profile and local graph even when it hosts neither Engine nor
Worker.

### Shared assembly

The dependency-clean `@lcase/assembly` package accepts already selected,
port-shaped instances or managed resources. Its reusable kernel owns generic
lifecycle mechanics: unique resource identity, ordered startup, rollback,
aggregate health, and reverse shutdown. It does not parse external
configuration, choose technologies, import components or adapters, or know the
shape of the embedded system.

The profile-specific part of assembly stays with the profile that owns the
graph. `assembleEmbeddedSystem()` therefore belongs with `local-system`; a
Worker host may have an app-local `assembleWorkerHost()` or keep the resource
list inline while it is small. These declarations use narrow required types and
make lifecycle ordering visible. One universal assembler with optional
`hostsEngine`, `hostsWorker`, or similar switches is not the model; optional
dependency bags make invalid graphs easy to represent.

External configuration follows this boundary:

```text
unknown input
  -> profile-specific validation and configuration
  -> resolved providers, bindings, and instances
  -> typed role-specific assembly input
  -> managed process lifecycle
```

Profiles compose their own configuration from shared leaf types. There is no
universal raw `DeploymentConfig` narrowed for each app through `Partial` or
`Pick`. TypeScript checks completeness after parsing; runtime validation still
owns invalid external values and cross-field constraints.

### Separate composition decisions

Profiles model these axes independently:

- hosted component behavior;
- component communication, carrier topology, and bindings; and
- passive infrastructure backends.

Network location does not determine category. S3 and Postgres remain passive
infrastructure. Engine and Worker remain behavioral components. An embedded
component may use a durable remote carrier, while a remote component cannot use
an in-process-only carrier.

ADR-0007, if accepted, further defines the communication axis: shared protocol
declarations and deployment topology supply identity; each process profile
selects its carrier, resolves its publishers, and binds only the handlers it
hosts. Generic carrier machinery is reusable process-host code, not part of
`@lcase/assembly` and not a concrete infrastructure adapter. This ADR
deliberately does not adopt older research examples that modeled component
communication as direct calls or correlated request/result clients.

### Lifecycle and ownership

`ManagedResource<T>` adapts heterogeneous host lifecycle without adding
`start()`, `stop()`, `health()`, or `drain()` to domain ports and components
that do not naturally own those operations. Shared lifecycle policy provides:

- explicit ordered startup;
- reverse-order best-effort shutdown;
- reverse rollback of resources that started before a later failure;
- unique managed-resource identity; and
- aggregate health reporting.

A no-op hook does not imply real readiness, draining, or health. Required
infrastructure must add truthful checks when those guarantees matter.

An autonomous component may expose lifecycle controls when it owns real
accepting, draining, active-work, or health state. Worker is such a component
once those semantics are implemented: every profile that constructs a local
Worker manages that retained instance and coordinates its command ingress. A
profile that reaches a Worker hosted by another process does not construct a
remote placeholder `ManagedResource<Worker>` because it cannot truthfully
start, stop, or assess the local health of that instance.

Executable bootstrap owns process concerns: signals, exit behavior, HTTP
readiness, CLI duration, and calls to the assembled lifecycle's `start()` and
`stop()`. These are not application services, and a service-shaped lifecycle
facade does not sit between the app and its profile.

Concrete profile code lives at the nearest demonstrated owner. Keep a profile
app-local when only one executable uses it; extract the smallest shared profile
after a second real consumer appears; create a separate app package for a
genuinely separate process role. Moving composition files alone does not narrow
installed dependencies—deployment isolation also requires a deployable package
boundary and dependency-clean shared packages.

The shared `local-system` graph has two real consumers, the HTTP server and CLI,
so it belongs in a focused package such as `@lcase/profile-local-system`.
The initial Worker-host profile belongs in `apps/worker-host`. A future second
launcher needing the same complete Worker-host policy would trigger promotion;
a test, container manifest, or second replica of the same app would not.

Package boundaries follow responsibilities rather than preserving the current
`@lcase/runtime` name:

- `@lcase/assembly` contains generic managed-resource lifecycle;
- generic Message router/carrier hosting lives in `@lcase/message-router`;
- a shared profile package owns `local-system` and its concrete dependency
  allow-list; and
- each app-local profile imports only the concrete implementations that app can
  select.

If this separation leaves no single coherent responsibility for
`@lcase/runtime`, remove the package rather than redefine it as a grab bag. A
subpath export from the current broad package is insufficient because package
installation and `pnpm deploy` follow `package.json` dependency closure.

These packages share the `packages/process-hosting/` folder, which groups by
what a package is for rather than by tier: everything involved in composing and
running one OS process. The grouping is organizational and carries no dependency
rule of its own -- the rules above are what constrain each package, and two of
them being dependency-free is the property that matters.

### Relationship to existing decisions

If accepted, this ADR supersedes ADR-0005's special treatment of `runtime` as
the one composition layer and the only importer of concrete adapters. The
preserved dependency rule is the architectural one: components, application
services, Operations, and functional core do not import concrete adapters;
process profiles do. There is one profile composition root per running process,
not one object graph spanning a distributed deployment. Lifecycle wrappers
remain host-side wrappers around resources, not application adapters injected
through business ports.

ADR-0006 remains unchanged: profiles construct Worker's fixed first-party
collaborators and do not introduce a tool registry or dynamically loaded
protocol plugins. Because this ADR is Proposed, no existing ADR status or text
changes.

## Consequences

- Each supported process graph and its concrete dependency allow-list are
  visible in code.
- Missing required dependencies fail during type checking, while invalid
  external values fail during profile validation.
- Shared lifecycle behavior stays consistent without forcing every deployable
  through the embedded system's graph.
- `@lcase/runtime` no longer has a privileged meaning and may disappear once
  its profile, assembly, and messaging responsibilities have focused owners.
- Profiles may freely combine local components, remote communication, and
  passive infrastructure according to actual deployment needs.
- A new supported provider requires profile code, tests, and a rebuilt
  artifact; runtime-loaded plugins remain outside the requirement.
- Adding a required dependency intentionally breaks every affected profile
  until each is updated.
- Several profiles may temporarily duplicate construction policy until real
  repetition justifies extracting it.
- Current health is only as truthful as each managed resource's hooks, and the
  current ordered list is not a general dependency graph.
- Splitting a broad provider package such as `@lcase/adapters`, dynamic per-run
  providers, state migration between backends, and full readiness or draining
  policy require later evidence and decisions. A new process profile is the
  trigger to measure its deployed dependency closure, not proof that every
  existing package must be split pre-emptively.

The following alternatives are rejected for the present architecture:

- **One universal configuration-driven runtime:** it imports every provider,
  couples unrelated deployables to one schema, and permits misleading
  combinations.
- **Runtime-loaded provider plugins:** they introduce manifests, compatibility,
  security, packaging, and service-location problems for an ecosystem the
  project does not need.
- **A dependency-injection container:** it can hide constructor mechanics but
  cannot decide which combinations are semantically valid; explicit wiring is
  currently clearer.
- **Independent handwritten bootstrap in every app:** it duplicates startup,
  rollback, health, shutdown, and graph-order policy.
- **One assembler with optional hosted-component flags:** required role-specific
  inputs express legal graphs more honestly.
- **Dynamic provider selection per job or run:** it needs persisted backend
  identity, routing, credential, caching, migration, and recovery policy that
  is not yet required.

The implementation evidence and remaining questions are recorded in the
[runtime composition research](../initiatives/swappable-infrastructure/research/runtime-composition-strategies.md),
the [profile follow-up](../initiatives/swappable-infrastructure/research/runtime-composition-follow-up.md),
the [artifact-store/runtime Arc](../initiatives/swappable-infrastructure/arcs/cas-adapter.md),
the [Remote Worker Arc](../initiatives/swappable-infrastructure/arcs/remote-worker.md),
and the [deferred component-placement sketch](../initiatives/swappable-infrastructure/research/configurable-component-placement.md).
