# Deployment and process-profile scenarios

- **Status:** Conceptual guide
- **Purpose:** Show how deployment definitions, host plans, process profiles,
  and applications relate across the likely embedded and distributed scenarios.
- **Scope:** These trees illustrate architectural shapes. They do not commit
  every scenario to the current Arc, prescribe final package names, or introduce
  a placement compiler.
- **Role names:** the trees below call the transitional non-Worker role
  `companion-non-worker-host`. The Arc later settled that a role is named for
  what it hosts rather than for being the remainder, making that role
  `api-engine-observer-host`. Read it that way.
- **Numbering:** kept as written, and now off by one past C21. The Arc later
  split this note's C21 into C21 (static topology data) and C22 (router,
  carrier, and profile adoption), shifting everything after it. The Arc is the
  authority on numbering.

See
[C20–C21 seams: delivery lanes, deployment topology, and host bindings](./c20-deployment-topology-and-host-bindings.md)
for the detailed representation and validation recommendations.

## The basic relationship

```text
Protocol catalog
│
│ defines publications and logical subscriptions
▼
Deployment definition
├── selects the enabled protocol pieces
├── assigns each delivery edge to a route
├── selects one shared carrier realization
└── partitions messaging responsibilities into host plans
    │
    ├── host plan A ── selected by process profile A ── started by app A
    ├── host plan B ── selected by process profile B ── started by app B
    └── host plan C ── selected by process profile C ── started by app C
```

These layers answer different questions:

```text
Protocol catalog      What communication exists?
Deployment definition How does this deployment arrange that communication?
Host plan             What messaging responsibilities belong to one role?
Process profile       Which concrete local objects perform that role?
Application           How is that process configured, started, and stopped?
Router                How do Messages move through the chosen carrier?
Assembly              How are local managed resources coordinated?
```

A deployment definition is the global agreement. A process profile is one local
object graph. An application is the executable shell around that graph.

## Scenario 1: complete embedded system

The current shared profile constructs the whole behavioral system in one
process.

```text
local-system deployment
└── local-system-host plan
    ├── may publish all locally produced publications
    └── owns all enabled logical subscriptions
        │
        ▼
    @lcase/profile-local-system
    ├── application services
    ├── Engine
    ├── Worker
    ├── Observability
    ├── Limiter and Replay
    ├── infrastructure adapters
    ├── in-process or Redis Message router
    └── managed runtime assembly
        ▲
        │
        ├── HTTP server embedded entrypoint
        └── CLI direct-execution entrypoint
```

The deployment definition contains one host plan because every participating
component is co-located. The profile is worth sharing because more than one
application constructs the same local graph.

## Scenario 2: transitional remote Worker

The first remote proof splits the existing graph at the Worker boundary without
requiring every component to become independently deployable.

```text
remote-worker deployment
├── companion-non-worker-host plan
│   ├── application-service publisher permissions
│   ├── Engine subscriptions
│   ├── Observability subscription
│   └── no Worker subscription
│       │
│       ▼
│   app-local companion non-Worker profile
│   ├── application services
│   ├── Engine
│   ├── Observability
│   ├── Limiter, Replay, and other behavior not yet split out
│   ├── required infrastructure
│   ├── Redis Message router
│   └── no Worker
│       │
│       ▼
│   HTTP server process
│
└── worker-host plan
    ├── Worker command subscription
    ├── Worker publication permissions
    └── no Engine or Observability subscriptions
        │
        ▼
    app-local Worker-host profile
    ├── Worker
    ├── Worker-required infrastructure
    ├── Redis Message router
    └── managed Worker lifecycle
        │
        ▼
    Worker process
```

This produces three real composition graphs across two planned deployment
shapes:

```text
1. Complete embedded graph
2. Companion non-Worker graph
3. Worker-host graph
```

It does not require three shared profile packages. For the initial proof, the
latter two profiles will live beside their applications. Their architecture is
real; app-local is simply the correct ownership while each has one consumer.

Limiter, Replay, and event families still using `EventBusPort` remain with the
companion process unless and until separate protocol and process boundaries are
designed for them. The messaging host plan describes only the Message
responsibilities migrated into its catalog; it is not a complete inventory of
every local object.

The process shape is selected at an entrypoint boundary:

```text
Embedded entrypoint
└── createLocalSystem()

Remote API entrypoint
└── createCompanionNonWorkerHost()

Worker entrypoint
└── createWorkerHost()
```

The shared local-system profile does not gain a `worker: "local" | "remote"`
switch. Each entrypoint selects one complete, unambiguous graph.

## Scenario 3: later distributed system

A later deployment can split more behavioral roles without changing the
protocol catalog.

```text
distributed-system deployment
├── gateway-host plan
│   └── profile-gateway
│       ├── application services
│       ├── outbound Message publishers
│       ├── gateway-required infrastructure
│       └── no Engine, Worker, or Observability
│
├── engine-host plan
│   └── Engine-host profile
│       ├── Engine
│       ├── Engine subscriptions and publishers
│       └── Engine-required infrastructure
│
├── worker-host plan
│   └── Worker-host profile
│       ├── Worker
│       ├── Worker subscriptions and publishers
│       └── Worker-required infrastructure
│
├── observer-host plan
│   └── Observer-host profile
│       ├── Observability
│       ├── multi-publication observation subscription
│       └── Observability-required infrastructure
│
└── additional current or future behavior
    └── remains assigned to explicit process profiles as its boundaries mature
```

`distributed-system` names the complete deployment arrangement. It is not one
profile that constructs objects across every process.

`profile-gateway` is sometimes reasonably described as the “distributed
profile” in conversation, but it constructs only the gateway process's local
graph.

## Scenario 4: possible CLI shapes

The CLI does not need a final shape yet. Two legitimate paths remain.

### Thin HTTP client

```text
CLI
├── command parsing and presentation
└── HTTP client
    └── calls the gateway API
        │
        ▼
    gateway application
    └── profile-gateway
        └── application services and Message participation
```

In this form, the CLI resembles the React frontend:

- it does not construct application services;
- it does not connect directly to the Message carrier;
- it has no host plan in the messaging deployment; and
- it does not justify promoting an app-local gateway profile.

### Direct deployment participant

```text
CLI
├── command parsing and presentation
└── direct-execution profile
    ├── application services
    ├── required infrastructure
    ├── Message publishers
    └── any subscriptions genuinely owned by this process
        │
        ▼
distributed deployment host plan
```

This form could run a flow without an HTTP gateway. If its local graph is
genuinely the same as the HTTP gateway's graph, both applications could use
`@lcase/profile-gateway`.

```text
HTTP server ─┐
             ├── @lcase/profile-gateway
Direct CLI ──┘
```

If the CLI needs a meaningfully different graph, it should have its own profile
instead of making the gateway profile conditional.

## Host plans are not paired

A `worker-host` plan is not intrinsically coupled to a `main-host` or gateway
plan.

```text
Deployment A
├── companion-non-worker-host
└── worker-host

Deployment B
├── gateway-host
├── engine-host
├── worker-host
└── observer-host
```

No host plan names its counterpart. The enclosing deployment definition proves
that the complete set of plans covers the enabled messaging responsibilities.

The Worker component does not care which deployment was selected. The
Worker-host profile cares only about the local plan it must satisfy. Its router
also needs the enclosing deployment's route realization so that it uses the
same physical destinations as the other processes.

A reusable Worker assignment may therefore appear in multiple deployment
definitions, while each definition remains responsible for its complete
arrangement.

## What the mapping guarantees

The guarantee is assembled across the layers:

```text
Catalog
└── declares a Worker command subscription
    │
    ▼
Deployment definition
├── assigns that subscription to worker-host
└── maps its delivery edge to command-work
    │
    ▼
Worker-host profile
└── binds Worker.handleCommand to that subscription
    │
    ▼
Router seal
└── verifies the local assignment was bound exactly once
```

Deployment validation can prove that every enabled logical subscription is
assigned to exactly one role. Local router validation can prove that a process
bound exactly the subscriptions assigned to its role.

The manifest does not contain method references such as
`Worker.handleCommand`. That concrete relationship belongs to the profile that
owns the actual Worker instance.

This structure does not prove that:

- every process is currently running;
- every process loaded the same manifest version;
- separately configured endpoints reach the same Redis deployment; or
- a remote component is healthy.

Those are later deployment and operational guarantees.

## “No behavioral components” is not an empty host

A gateway can contain no Engine, Worker, or Observability while still having
meaningful responsibilities.

```text
gateway profile
├── Engine: absent
├── Worker: absent
├── Observability: absent
├── application services: present
├── infrastructure: present as required
├── Message router: present
├── outbound publication permissions: present
└── subscriptions: possibly empty
```

Host plans describe messaging authority, not the complete process inventory.

A gateway that starts Worker jobs may own no subscription but still require
permission to publish job commands. A thin CLI communicating solely over HTTP
normally sits outside the messaging deployment and has no host plan. If a
broader deployment inventory nevertheless represents such non-messaging
clients, its messaging assignment is empty.

## When an app-local profile should be promoted

An app-local profile is not disposable or structurally different from a shared
profile. It is simply owned by its only proven consumer.

```text
One application owns the graph
└── keep the profile app-local

A second independent application needs the same graph
└── promote it to a shared profile package
```

Promotion is justified by shared composition policy, not by a desire for
symmetric package names.

Examples:

- A thin HTTP CLI does not use the gateway graph, so it is not a second
  consumer.
- A direct CLI that constructs the same application services and messaging
  graph may justify `@lcase/profile-gateway`.
- A second entrypoint inside the same deployable may reuse an app-local factory
  without immediately requiring a shared package.

Promotion should move an already-understood boundary; it should not require
redesigning the profile.

## What this guide does not require

The trees are a guide to possible shapes, not a request to build all of them
now.

In particular, they do not require:

- implementing the fully distributed scenario in the current Arc;
- deciding the CLI's final role;
- creating a shared package for every profile;
- creating a universal profile with component-placement switches;
- dynamically compiling arbitrary placement configuration;
- allowing mixed carriers within one deployment;
- proving remote liveness or coordinated deployment versions; or
- finalizing the illustrative app, role, and package names.

C21 creates production manifests only for the embedded and transitional
remote-Worker shapes. Its synthetic validation fixtures can prove that the data
model supports more than two roles without turning the later distributed or CLI
scenarios into supported presets. C24 then exercises the transitional
two-process deployment while preserving the complete embedded profile.
