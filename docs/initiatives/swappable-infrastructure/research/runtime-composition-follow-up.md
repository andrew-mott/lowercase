# Runtime Composition Follow-up: Messaging, Config Types, and Profile Placement

## Status and scope

This document refines the recommendation in
[`runtime-composition-strategies.md`](./runtime-composition-strategies.md): use
explicit deployment profiles over shared assembly code.

It resolves three details that were intentionally left too loose in the first
survey:

1. how the committed command, lifecycle-event, telemetry, and metrics streams fit
   into configuration;
2. whether every deployment profile shares one `DeploymentConfig` type; and
3. where a deployment profile should physically live.

The conclusions are:

- Treat Redis stream **topology**, producer **routes**, and consumer
  **subscriptions** as separate configuration concerns.
- Put command delivery under component **bindings**. Lifecycle events, telemetry,
  and metrics are publication routes. All four can still reference the same
  Redis topology vocabulary and use separate Redis Streams.
- Let each profile own an independent external config type assembled from shared
  leaf types. Do not introduce one universal raw `DeploymentConfig`.
- Give the shared assembly layer typed, fully resolved inputs. This is where
  compile-time completeness is enforced; boot-time validation still handles raw
  external configuration and graph invariants.
- Keep a profile in its consuming app initially. Extract it only when the same
  composition policy has a second real consumer or becomes a deployable in its
  own right.

These choices refine the sketches in the first survey; they do not reverse its
main recommendation.

## 1. Four message categories without one generic message channel

The initiative already commits to four semantic categories on four distinct Redis
Streams:

- commands
- lifecycle events
- telemetry
- metrics

That commitment is recorded in
[`INITIATIVE.md`](../INITIATIVE.md) and
[`queue-adapter.md`](../arcs/queue-adapter.md). Redis Streams is the shared
carrier, but sharing a carrier must not erase the semantic differences between
the categories.

The earlier `LifecycleFactsConfig` sketch was therefore too narrow. Replacing it
with one `messages` selector containing four nearly identical entries would also
be incomplete, because it would combine three different decisions:

1. **Topology:** Which physical stream exists, where is it, and how is it
   provisioned?
2. **Publication or delivery route:** Where does a producer send a particular
   category or command?
3. **Subscription:** Which logical consumer reads a stream, under which consumer
   group and recovery policy?

Those decisions should be represented separately.

### Physical Redis topology

A physical stream definition can use shared vocabulary without deciding who
publishes or consumes it:

```ts
type MessageCategory =
  "commands" | "lifecycle-events" | "telemetry" | "metrics";

type RedisConnectionRef = string & {
  readonly __redisConnectionRef: unique symbol;
};
type RedisStreamRef<C extends MessageCategory> = string & {
  readonly __messageCategory: C;
};
type RedisProtocolStreamRef<P extends string> = string & {
  readonly __protocol: P;
};

type StreamRetentionConfig =
  | { kind: "unbounded" }
  | { kind: "max-length"; count: number; approximate: boolean }
  | { kind: "minimum-id"; maxAgeMs: number; approximate: boolean };

type RedisStreamDefinition<C extends MessageCategory> = {
  ref: RedisStreamRef<C>;
  category: C;
  connection: RedisConnectionRef;
  name: string;
  provisioning: {
    createIfMissing: boolean;
    retention: StreamRetentionConfig;
  };
};

type RedisProtocolStreamDefinition<P extends string> = {
  ref: RedisProtocolStreamRef<P>;
  protocol: P;
  connection: RedisConnectionRef;
  name: string;
  provisioning: {
    createIfMissing: boolean;
    retention: StreamRetentionConfig;
  };
};

type RedisMessagingTopology = {
  connections: Record<RedisConnectionRef, RedisConnectionConfig>;
  streams: {
    commands: RedisStreamDefinition<"commands">;
    lifecycleEvents: RedisStreamDefinition<"lifecycle-events">;
    telemetry: RedisStreamDefinition<"telemetry">;
    metrics: RedisStreamDefinition<"metrics">;
  };
};

type RedisJobExecutionProtocolTopology = {
  protocolStreams: {
    jobExecutionResults: RedisProtocolStreamDefinition<"job-execution-results">;
  };
};

type DistributedWorkerMessagingTopology = RedisMessagingTopology &
  RedisJobExecutionProtocolTopology;
```

The branded references are illustrative. Ordinary validated strings or a schema
library can provide the same protection.

This topology is a deployment concern. It can be shared as configuration data by
an API/engine process, worker process, and observability process without requiring
those processes to share one universal application config type.

Retention belongs here, not in each consumer subscription. It is a property of
the physical stream and needs one operational owner. If every publisher or
consumer independently supplied retention, conflicting values could silently trim
data another concern still needs.

Retention should still differ by category:

| Category         | Typical concern                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands         | Do not trim work that has not reached a safe terminal state; coordinate trimming with pending recovery, idempotency, and any dead-letter policy.         |
| Lifecycle events | Keep at least the recovery/reprojection window; keep longer if Redis is an authoritative history rather than a delivery buffer into durable projections. |
| Telemetry        | Usually a shorter diagnostic window and more aggressive trimming.                                                                                        |
| Metrics          | Usually a short raw-sample window if downstream aggregation is authoritative.                                                                            |

The exact durations are deployment policy, not suitable library defaults. In
particular, command-stream trimming cannot safely be copied from telemetry-stream
trimming.

#### The four-category list omits replies

There is one existing documentation conflict to resolve before implementing the
remote worker protocol. The
[`component model`](../../../component-architecture/model.md#event-categories)
classifies a reply/result separately, and the
[`Worker V2 plan`](../../../component-architecture/worker-v2/README.md#result-semantics)
says explicitly that `JobResult` is the caller's control-flow answer rather than a
lifecycle event. The initiative's four-category list does not name replies, while
also saying the engine consumes worker lifecycle events to advance the run.

Do not resolve that conflict by silently treating a job result as a lifecycle
event. That would make control flow depend on a public fact stream and would undo a
central Worker V2 boundary. The recommended resolution is:

- keep the four named streams as public semantic categories;
- put the correlated result channel inside the job-execution binding protocol;
- provision its physical Redis stream under `protocolStreams`, not under passive
  category publication; and
- publish the independent worker lifecycle fact separately after execution.

This means a distributed profile may use more than four physical Redis Streams.
It still has four public message categories; a binding-private reply channel is a
protocol mechanism, not a fifth general observation category. If "exactly four
physical streams" is instead non-negotiable, the command stream must be redefined
as a bidirectional command-protocol stream that can carry typed replies. That is
less clear than a dedicated result channel and should be an explicit protocol
decision, not an accidental envelope convention.

### Producer routes for facts and observations

Lifecycle events, telemetry, and metrics are produced as consequences of work.
Their route can be selected independently:

```ts
type InProcessPublication = {
  backend: "in-process";
};

type RedisPublication<C extends MessageCategory> = {
  backend: "redis-streams";
  stream: RedisStreamRef<C>;
};

type PublicationRoute<C extends MessageCategory> =
  InProcessPublication | RedisPublication<C>;

type SignalPublicationConfig = {
  lifecycleEvents: PublicationRoute<"lifecycle-events">;
  telemetry: PublicationRoute<"telemetry">;
  metrics: PublicationRoute<"metrics">;
};
```

This is the replacement for the first survey's single
`LifecycleFactsConfig`. It keeps the categories distinct and permits useful
local combinations. For example, a localhost server could publish lifecycle
events to Redis for an external projection consumer while retaining in-process
telemetry and metrics.

`in-process` does not imply simulating Redis consumer groups. It means the profile
constructs the appropriate direct sink, fan-out sink, recorder, or local
observability adapter. Redis-only delivery and recovery concepts should exist only
in the Redis branch.

The three categories can share a small publication-provider abstraction in
runtime code, but they should retain different payload contracts and ownership:

- component cores form lifecycle events for state they own;
- adapters, runtime code, and supervisors form telemetry about mechanisms they
  own; and
- metric instruments or metric adapters form measurements according to the
  metrics contract.

Using Redis for metrics does not make metrics lifecycle events. It only means the
selected metrics publisher happens to use the same infrastructure technology.

### Commands belong to bindings

Commands require different treatment because a command route is an authoritative
request for a component to act. It is not passive publication.

For the worker, command transport belongs in the job-execution binding:

```ts
type JobExecutionBindingConfig =
  | {
      kind: "direct";
    }
  | {
      kind: "redis-streams";
      commandStream: RedisStreamRef<"commands">;
      result: {
        kind: "correlated-result";
        subscription: RedisProtocolSubscriptionConfig<"job-execution-results">;
      };
    };
```

The direct binding invokes the worker's inbound port. The Redis binding publishes
a command and resolves completion through the selected remote protocol. The same
component core and semantic ports remain behind both adapters.

The engine-side remote adapter consumes the correlated result channel to settle
`WorkerDispatch.executeJob()`. Worker lifecycle publication is independent. The
engine may also consume lifecycle events for a legitimate fact reaction, but that
consumer group should not be how the worker call returns its answer.

The result subscription is part of the binding because the engine-side adapter is
both a command producer and a result consumer. Before running multiple engine
replicas, that protocol must also define how a result reaches the replica holding
the matching pending call. A shared result stream plus one load-balanced group can
deliver the result to a different replica. A per-instance reply stream, partitioned
reply routing, or a durable shared correlation registry can solve that; a
single-engine first version may defer the choice explicitly.

This placement prevents an unsafe configuration in which a command is invoked
directly and also published to Redis as a second authoritative delivery path. If
the local deployment should prove the Redis command transport, select the Redis
binding while hosting both components locally. If it only needs diagnostic
visibility into a direct call, emit command telemetry; do not mirror an actionable
command that a worker might execute twice.

Redis is still infrastructure, and the command stream still appears in the shared
Redis topology. The distinction is:

- topology says that the command stream exists;
- `bindings.jobExecution` says it is the authoritative engine-to-worker command
  path; and
- the worker host's ingress subscription says which consumers are allowed to act
  on those commands.

The same rule applies to future remote component operations such as resource
admission or engine control. Their command streams are selected by their component
bindings, not by a global passive-publication switch.

One semantic category also need not imply exactly one global command stream for
all time. One job-execution command stream is sufficient for the first remote
worker. If worker, limiter, and engine commands later have different acting
consumer groups, target-specific command streams will probably be cleaner. Redis
consumer groups do not filter by command type; one global stream would make every
acting group read and acknowledge every other component's commands. Keep
`commands` as the category and permit target-specific streams within it when the
second real command target appears.

### Consumer subscriptions are a separate shape

A Redis publisher does not need a consumer group name. A consumer group exists for
a logical consuming concern, and independent groups do not change how the producer
performs `XADD`.

Consumer configuration should therefore be separate now. This is not premature:
the initiative already requires engine and observability to consume the same stream
independently, and publication and pending-entry recovery have intrinsically
different ownership even with one consumer.

```ts
type RedisSubscriptionConfig<S extends string> = {
  stream: S;
  group: string;
  consumerIdentity: {
    source: "process-instance";
    prefix: string;
  };
  groupCreation: {
    createIfMissing: boolean;
    startAt: "beginning" | "latest";
  };
  delivery: {
    batchSize: number;
    blockMs: number;
    pending: {
      strategy: "auto-claim";
      minIdleMs: number;
      scanIntervalMs: number;
    };
  };
};

type RedisCategorySubscriptionConfig<C extends MessageCategory> =
  RedisSubscriptionConfig<RedisStreamRef<C>>;

type RedisProtocolSubscriptionConfig<P extends string> =
  RedisSubscriptionConfig<RedisProtocolStreamRef<P>>;
```

The logical group name must be stable across restarts. Replica-specific consumer
identity must be unique within that group. For example:

```text
stream: lowercase.lifecycle.v1
group:  engine.lifecycle.v1
member: engine-api-7f8d9c-2

stream: lowercase.lifecycle.v1
group:  observability.lifecycle.v1
member: observability-6b478f-1
```

Both groups see every lifecycle entry. Multiple engine replicas within
`engine.lifecycle.v1` divide that group's work. The same is independently true for
observability replicas.

The consumer adapter or host owns acknowledging and recovering pending entries,
because it owns the processing boundary and knows when processing is complete.
The deployment profile supplies its policy. A practical first version can let
every member periodically use `XAUTOCLAIM` with jitter; a dedicated group leader is
not required merely to begin. That policy can change behind the consumer host
without changing publishers.

Command consumers need stricter treatment than short-lived projection consumers.
A worker command may remain in progress longer than `minIdleMs`; blindly claiming
it would execute the same job concurrently. The worker ingress protocol therefore
needs one of the following before pending recovery is considered complete:

- a claim timeout longer than a bounded execution deadline;
- a lease/heartbeat mechanism that refreshes ownership while work is active; or
- idempotent job execution plus duplicate suppression at the terminal write.

This is another reason not to hide commands inside a generic event publisher.

### Consumer-specific configuration without a universal subscription registry

A component that consumes several categories should own a typed set of
subscriptions:

```ts
type ObservabilityIngressConfig = {
  kind: "redis-streams";
  subscriptions: {
    commands?: RedisCategorySubscriptionConfig<"commands">;
    lifecycleEvents: RedisCategorySubscriptionConfig<"lifecycle-events">;
    telemetry?: RedisCategorySubscriptionConfig<"telemetry">;
    metrics?: RedisCategorySubscriptionConfig<"metrics">;
  };
};

type EngineLifecycleIngressConfig = {
  kind: "redis-streams";
  subscription: RedisCategorySubscriptionConfig<"lifecycle-events">;
};

type WorkerCommandIngressConfig = {
  kind: "redis-streams";
  subscription: RedisCategorySubscriptionConfig<"commands">;
};
```

This shares the mechanical subscription vocabulary while keeping semantic
requirements local to each host. It avoids a premature global array such as
`consumers: Subscription[]`, which would lose which categories are required for a
particular component to function.

Observability may subscribe to the command stream under its own group for audit or
debugging, but that does not make it an actor. Only the worker ingress group is
wired to the worker command handler. Observability acknowledges only within its
own group.

An observability subscription to commands is meaningful only when Redis is the
authoritative command binding. A direct local binding should expose diagnostic
information through telemetry rather than publishing an executable command merely
for observation.

### Configuration ownership summary

| Setting                                          | Owner and location                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Redis endpoint, credentials, pool                | Referenced connection definition in deployment messaging topology       |
| Stream name and category                         | Physical stream definition                                              |
| Retention/trimming                               | Physical stream provisioning policy, with one operational owner         |
| Where lifecycle events/telemetry/metrics publish | Category-specific publication route                                     |
| Where a command is delivered                     | Component binding, such as `bindings.jobExecution`                      |
| Consumer group name                              | Consumer host's subscription                                            |
| Consumer instance name                           | Running process/instance identity                                       |
| Group initial offset                             | Consumer subscription's group-creation policy                           |
| Ack timing                                       | Consumer adapter behavior                                               |
| Pending claim threshold and scan policy          | Consumer subscription and adapter                                       |
| Idempotency/deduplication rule                   | Semantic consumer/inbound adapter, backed by durable state where needed |

### Example profile fragments

An embedded desktop profile does not simulate Redis:

```ts
const messaging = {
  publications: {
    lifecycleEvents: { backend: "in-process" },
    telemetry: { backend: "in-process" },
    metrics: { backend: "in-process" },
  },
  bindings: {
    jobExecution: { kind: "direct" },
  },
} satisfies DesktopMessagingConfig;
```

A localhost server proving external lifecycle consumption can mix choices:

```ts
const messaging = {
  topology: redisTopology,
  publications: {
    lifecycleEvents: {
      backend: "redis-streams",
      stream: redisTopology.streams.lifecycleEvents.ref,
    },
    telemetry: { backend: "in-process" },
    metrics: { backend: "in-process" },
  },
  bindings: {
    jobExecution: { kind: "direct" },
  },
} satisfies LocalServerMessagingConfig;
```

A distributed engine process uses Redis for the authoritative worker command path:

```ts
const messaging = {
  topology: distributedRedisTopology,
  publications: {
    lifecycleEvents: {
      backend: "redis-streams",
      stream: distributedRedisTopology.streams.lifecycleEvents.ref,
    },
    telemetry: {
      backend: "redis-streams",
      stream: distributedRedisTopology.streams.telemetry.ref,
    },
    metrics: {
      backend: "redis-streams",
      stream: distributedRedisTopology.streams.metrics.ref,
    },
  },
  bindings: {
    jobExecution: {
      kind: "redis-streams",
      commandStream: distributedRedisTopology.streams.commands.ref,
      result: {
        kind: "correlated-result",
        subscription: engineJobResultSubscription,
      },
    },
  },
  ingress: {
    // Independent fact reaction, not the executeJob() reply path.
    workerLifecycleForEngine: engineLifecycleSubscription,
  },
} satisfies DistributedEngineMessagingConfig;
```

The sketches use direct object references for readability. Serialized deployment
configuration would use validated names such as `"redis-main"` and
`"lifecycle-v1"`, then resolve them during profile creation.

## 2. `DeploymentConfig` is vocabulary, not one universal raw type

The intended choice is **(b)**: each profile owns an independent config shape built
from shared leaf types.

The first survey's general `DeploymentConfig` was an explanatory model for the
three independent decisions: hosted components, component bindings, and
infrastructure backends. It should not become a concrete type with every possible
field for every executable. The narrower `LocalServerConfig` sketch was closer to
the recommended implementation direction.

### Do not use `Partial` or `Pick` over a mega-config

A broad type followed by `Partial`, `Pick`, and cross-field checks creates exactly
the invalid states the profile approach is intended to remove:

- `hosts.worker = true` without worker dependencies;
- a direct worker binding in a process that does not host a worker;
- Redis subscriptions without a Redis topology;
- desktop-only config accepting server adapters it cannot package; and
- a remote worker config carrying irrelevant engine and HTTP-server fields.

A large discriminated union could encode those states correctly, but every profile
would then be coupled into one central schema and release surface. It provides
little value unless one executable genuinely selects any profile at runtime.

### Share leaf vocabulary

Share bounded, implementation-neutral configuration types and schemas:

```ts
type LocalServerConfig = {
  profile: "local-server";
  artifacts: ArtifactStoreConfig;
  sql: SqlConfig;
  messaging: LocalServerMessagingConfig;
};

type DesktopConfig = {
  profile: "desktop";
  artifacts: FilesystemArtifactStoreConfig;
  sql: SqliteConfig;
  messaging: DesktopMessagingConfig;
};

type RemoteWorkerConfig = {
  profile: "remote-worker";
  artifacts: S3ArtifactStoreConfig;
  sql: PostgresConfig;
  messaging: RemoteWorkerMessagingConfig;
};
```

These types may reuse `ArtifactStoreConfig`, `RedisMessagingTopology`,
`RedisSubscriptionConfig`, secret-reference types, and retry-policy types without
sharing one parent `DeploymentConfig`.

An optional umbrella union can exist at a tooling boundary:

```ts
type KnownProfileConfig =
  LocalServerConfig | DesktopConfig | RemoteWorkerConfig;
```

That union is useful for a config editor, documentation generator, or launcher
that truly supports all profiles. It should not be the type every executable must
parse. Importing runtime schemas or profile factories for every union member would
also reintroduce the broad runtime dependency closure Approach 2 is meant to avoid.

### Separate external config from assembly input

There are three useful representations, not one:

```text
unknown external input
  -> profile-specific parsed config
  -> resolved providers and component bindings
  -> typed assembly input
  -> managed runtime
```

For example:

```ts
export async function createRemoteWorkerRuntime(raw: unknown) {
  const config = parseRemoteWorkerConfig(raw);

  const artifacts = createS3ArtifactProvider(config.artifacts);
  const sql = createPostgresProvider(config.sql);
  const lifecycle = createLifecyclePublisher(
    config.messaging.publications.lifecycleEvents,
  );
  const ingress = createWorkerCommandIngress(config.messaging.ingress.commands);

  return assembleWorkerHost({
    worker: {
      artifacts: artifacts.port,
      artifactRepository: sql.artifactRepository,
      lifecycle: lifecycle.port,
      // Every required Worker dependency appears in this type.
    },
    ingress,
    managedResources: [sql, artifacts, lifecycle, ingress],
  });
}
```

`RemoteWorkerConfig` describes user-selectable deployment policy.
`WorkerHostAssemblyInput` describes exactly what assembly requires after choices
have been resolved. They should not be the same type.

### How completeness is guaranteed

The shared assembler does not need one raw config type to enforce completeness. It
needs narrow, required input types at its call sites:

```ts
type WorkerDependencies = {
  artifacts: ArtifactReaderPort & ArtifactWriterPort;
  artifactRepository: ArtifactRepositoryPort;
  lifecycle: WorkerLifecycleEventSink;
  // Other required Worker outbound ports are required fields here.
};

type WorkerHostAssemblyInput = {
  worker: WorkerDependencies;
  ingress: ManagedWorkerIngress;
  managedResources: readonly ManagedResource[];
};

declare function assembleWorkerHost(
  input: WorkerHostAssemblyInput,
): Promise<ManagedRuntime>;
```

When the worker gains a required outbound port, `WorkerDependencies` and the
worker constructor change. Every profile calling `assembleWorkerHost()` fails type
checking until it supplies that port.

The shared assembler can be a library of several role-specific entry points:

```ts
assembleEmbeddedSystem(input: EmbeddedSystemAssemblyInput)
assembleEngineHost(input: EngineHostAssemblyInput)
assembleWorkerHost(input: WorkerHostAssemblyInput)
assembleObservabilityHost(input: ObservabilityHostAssemblyInput)
```

"Shared assembler" does not require one universal `assembleSystem()` signature.
These functions can share managed-resource startup, health, shutdown, rollback,
and dependency-ordering machinery while retaining useful role-specific types.

This is preferable to `hosts: { worker: boolean }` plus optional dependency
fields. The process role and assembler function already state what is hosted.

### What remains a runtime validation concern

TypeScript cannot validate environment variables, JSON, secret resolution, or
whether a Redis stream actually exists. Each profile must validate raw input at
boot. The assembly layer should also reject graph-level mistakes that remain
possible after parsing, such as:

- duplicate managed-resource IDs;
- dependency cycles;
- a binding referencing an unresolved stream or connection;
- incompatible protocol/schema versions;
- a direct binding whose target instance is absent; and
- invalid startup ordering.

The split is deliberate:

- profile schema validation proves external values have the expected shape;
- TypeScript proves the profile supplied all required resolved capabilities; and
- assembler validation proves the resulting object graph is coherent.

## 3. Profiles should start inside their consuming apps

The working theory in the follow-up prompt is correct: moving a profile module into
its own workspace package does not by itself reduce deployment size.

For `pnpm deploy`, the important boundary is the selected deployable package and
its transitive production dependency closure. If an HTTP server app imports
`@lcase/profile-local-server`, and that profile package imports S3, Redis, and
Postgres adapters, those dependencies remain in the HTTP server's closure. Moving
the same imports from an app-local module into a library package changes ownership
and reuse, not reachability.

The same caveat applies one level lower: app-local profiles cannot narrow the
deployment if a shared package they import already declares every adapter as a
production dependency. The current [`@lcase/runtime` package](../../../../packages/runtime/package.json)
depends on the worker, engine, adapters, router, observability, app services,
limiter, artifacts, and Prisma packages together. Retaining that dependency shape
would largely defeat profile-level package narrowing even if the profile modules
move into each app.

Therefore, deployment narrowing requires both:

1. one deployable workspace package per real process/product; and
2. dependency-clean shared assembly/provider packages that do not pull in every
   concrete implementation.

Subpath exports inside one broad package can improve import clarity and bundler
reachability, but they do not give `pnpm deploy` separate package dependency
closures. If one package's `package.json` declares every adapter, the selected
deployment still installs that declared closure.

### Recommended initial location

Keep each concrete profile beside its executable:

```text
apps/
  http-server/
    src/
      composition/
        local-server.config.ts
        local-server.profile.ts
      build-server.ts

  desktop/
    electron/
      composition/
        desktop.config.ts
        desktop.profile.ts
      bootstrap.ts

  worker-host/
    src/
      composition/
        remote-worker.config.ts
        remote-worker.profile.ts
      main.ts

packages/
  runtime/
    src/
      assembly/
        managed-resource.ts
        lifecycle.ts
        assemble-embedded-system.ts
        assemble-engine-host.ts
        assemble-worker-host.ts
      config/
        shared-leaf-types.ts
```

The exact package split under `packages/runtime` may need to become narrower than
one package to preserve deployment closures. That is a packaging decision separate
from whether concrete profile modules live in apps.

The app-local profile is the actual composition root. It is allowed to know:

- which concrete adapters this executable supports;
- process-specific environment variables and config files;
- Electron paths and lifecycle, HTTP readiness, or worker process identity;
- logging and OpenTelemetry SDK initialization;
- signal handling and exit behavior; and
- which shared assembler entry point to call.

Those concerns are usually wrong in a reusable profile package because they belong
to the executable host.

### What a separate profile package buys

Extracting a profile can be useful, but for reasons other than automatic size
reduction:

- two deployables intentionally share the same composition policy;
- a profile becomes a separately deployable host with its own package entry point;
- a team needs a hard dependency/ownership boundary around supported adapters;
- the profile has enough policy to deserve independent contract and smoke tests;
- release cadence or version compatibility must be managed independently; or
- multiple launchers need the same provider selection but different outer process
  bootstraps.

In this private monorepo, "independent versioning" is not automatically valuable.
An app-local profile can already have focused config and composition tests in the
app package.

### Promotion rule

Default to app-local and promote on the second real consumer, but extract the
smallest genuinely shared composition policy rather than the entire bootstrap.

For example, if the CLI and HTTP server eventually need the same local system
graph:

```text
packages/
  runtime-profile-local-system/
    src/
      create-local-system.ts

apps/
  http-server/
    src/composition/http-server.profile.ts
  cli/
    src/composition/cli.profile.ts
```

The shared package can create the local system graph. The HTTP app still owns
Fastify startup and readiness; the CLI still owns command lifetime and terminal
behavior. This avoids coupling one app to another app's bootstrap.

Create a new deployable app package, rather than a reusable library profile, for
the remote worker. It is a real process with its own startup, health, shutdown,
identity, secrets, and deployment artifact:

```text
apps/worker-host/package.json
```

That package boundary is what lets `pnpm deploy` produce a worker-specific
dependency closure. Whether its local composition module is one file or several
does not affect that fact.

## Consolidated target shape

The refined structure is:

```text
profile-specific raw config
  - only options supported by this executable
  - built from shared leaf schemas

app-local composition profile
  - imports the concrete providers this executable supports
  - resolves topology, publication routes, subscriptions, and bindings
  - constructs a role-specific typed assembly input

shared assembly layer
  - accepts port-shaped resolved dependencies
  - constructs/wires hosted components
  - enforces graph invariants
  - manages async startup, health, rollback, and shutdown

managed runtime
```

Messaging crosses those layers as follows:

```text
Redis topology
  - connections
  - four physical category streams
  - category-specific retention/provisioning
  - binding-private protocol streams required by a distributed profile

component bindings
  - authoritative command delivery
  - direct or Redis transport
  - correlated completion protocol

signal publication routes
  - lifecycle events
  - telemetry
  - metrics
  - independently in-process or Redis where a profile permits it

consumer host subscriptions
  - stream reference
  - logical consumer group
  - process member identity
  - ack and pending-recovery policy
```

This preserves the four-way Redis split without returning to "everything is the
same event bus abstraction." The technology is shared; semantics, ownership, and
failure handling remain explicit.

## Implementation order

This design does not require building every profile or stream category at once. A
bounded implementation sequence is:

1. Define shared Redis connection, stream-reference, topology, and subscription
   leaf types.
2. Implement the worker command binding and worker command-ingress subscription as
   the first command-specific path, including its correlated result channel.
3. Implement worker lifecycle-event publication and the engine and observability
   lifecycle subscriptions as distinct groups where each has a real fact reaction;
   do not use either subscription to settle `executeJob()`.
4. Add telemetry and metrics publication/subscription only when their real
   producers and consumers are being migrated.
5. Create a real `apps/worker-host` deployable with an app-local remote-worker
   profile.
6. Move concrete provider selection out of the broad shared runtime dependency
   closure as each real profile is introduced.
7. Extract a reusable profile package only after two deployables share the same
   composition policy.

The order keeps the near-term remote-worker goal central while leaving the full
four-category topology structurally supported.

## Decisions that remain product or protocol policy

This follow-up fixes configuration ownership, not every Redis delivery rule. The
following still require explicit decisions when their adapters are implemented:

- whether lifecycle Redis Streams are authoritative history or delivery buffers
  into SQL projections;
- the worker command lease/heartbeat and duplicate-execution protocol;
- idempotency key storage and terminal-result deduplication;
- dead-letter handling and maximum delivery attempts;
- exact category retention windows;
- whether command observation is useful enough for an observability consumer
  group; and
- how the explicit result protocol routes a reply to the originating engine
  replica and recovers an orphaned pending call.

Those are intentionally not hidden behind generic defaults. They are distributed
protocol semantics and should be decided with the first real remote-worker path.
