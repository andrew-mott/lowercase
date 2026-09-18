# Runtime Composition and Swappable Infrastructure

Status: research and design survey, not an implementation plan

Date: 2026-08-31

## Question

How should this monorepo construct different infrastructure adapters and local or
remote component bindings without collapsing those two concerns into one universal
`placement x transport x store` model?

The answer must support all of these independently:

- an embedded component using local infrastructure
- an embedded component using network infrastructure such as S3, Postgres, or
  Redis Streams
- a component hosted in another process
- an Electron distribution that should not necessarily carry every server adapter
- a localhost server that can choose more durable infrastructure without becoming
  distributed
- a real message stream that external consumers can observe even when the core
  system remains in one process

This document does not attempt to merge the existing HTTP/CLI and Electron
composition entry points. It describes structures that either entry point could
use.

## Short answer

There are three genuinely different approaches worth considering:

1. A universal config-driven runtime that imports every provider and selects among
   them at startup.
2. Explicit deployment-profile composition roots built over a shared assembly
   library.
3. Runtime-loaded provider modules or plugins selected by configuration.

The strongest near-term fit is the second approach, with a limited amount of the
first inside each profile:

- Keep one shared, technology-independent assembly API.
- Give each executable/process role an explicit composition module that imports
  only the adapters that role may use.
- Allow runtime configuration to select among the bounded choices intentionally
  included in that profile.
- Model hosted components, component bindings, and infrastructure providers as
  separate parts of configuration.
- Validate external configuration at boot, then use discriminated TypeScript
  unions inside the program.
- Give constructed resources an explicit asynchronous startup, readiness, and
  shutdown lifecycle.

This is not the same as declaring one runtime for every possible combination. A
profile is a supported deployment product or process role, while ordinary config
still chooses endpoint URLs, credentials, limits, and any backend alternatives that
the profile intentionally offers.

## First separate the three decisions

The most important correction is conceptual. There is no universal set of axes that
applies to every port.

### 1. Hosted behavior

This says which component cores exist in the current process:

```ts
type HostedComponents = {
  engine: boolean;
  worker: boolean;
  limiter: boolean;
  observability: boolean;
};
```

For example, an API process in a distributed deployment may host the engine but not
the worker. A worker process hosts the worker but not the engine. A desktop process
may host both.

### 2. Component binding

This says how one component reaches another component's inbound port:

```ts
type JobExecutionBinding =
  | { kind: "direct" }
  | {
      kind: "redis-streams";
      commandStream: string;
      resultStream: string;
    };
```

`direct` requires a worker core in the same process. `redis-streams` can connect to
a worker in another process, but it can also be exercised while both components are
temporarily hosted in one process. That preserves the committed distinction between
placement and transport.

### 3. Infrastructure backend

This says which implementation satisfies a passive infrastructure port:

```ts
type ArtifactStoreConfig =
  | { backend: "filesystem"; rootPath: string }
  | {
      backend: "s3";
      endpoint?: string;
      region: string;
      bucket: string;
      credentials: SecretRef;
    };

type SqlConfig =
  { backend: "sqlite"; file: string } | { backend: "postgres"; url: SecretRef };

type LifecycleFactsConfig =
  | { backend: "in-process" }
  | {
      backend: "redis-streams";
      stream: string;
      retention: RetentionConfig;
    };
```

S3 and Postgres happen to be reached over a network, but that does not turn them
into remote application components. Their existing protocols are already the
remote interfaces. They need clients and adapters, not a new inbound application
port and bespoke service.

This yields a more honest top-level shape:

```ts
type DeploymentConfig = {
  hosts: HostedComponents;
  bindings: {
    jobExecution: JobExecutionBinding;
    resourceAdmission: ResourceAdmissionBinding;
  };
  infrastructure: {
    artifacts: ArtifactStoreConfig;
    sql: SqlConfig;
    lifecycleFacts: LifecycleFactsConfig;
  };
};
```

Some combinations still need cross-field validation. For example, a direct job
binding cannot work if this process does not host the worker. That is an assembly
invariant, not evidence that every concern should be projected onto the same three
axes.

## What needs a component boundary?

The classification should be made per capability, based on ownership of behavior,
not on whether TCP is involved.

| Capability                 | Classification                                                   | Local shape                                              | Remote/network shape                                                   |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Artifact bytes             | Infrastructure backend                                           | `FsArtifactStore`                                        | `S3ArtifactStore` talks directly to S3/MinIO                           |
| Relational persistence     | Infrastructure backend                                           | SQLite-backed Prisma client                              | Postgres-backed Prisma client                                          |
| Redis stream storage       | Infrastructure backend                                           | In-memory test/local primitive if deliberately supported | Redis client talks directly to Redis                                   |
| Worker execution           | Behavioral component                                             | Engine adapter calls worker inbound port                 | Engine adapter sends command; worker inbound adapter invokes same port |
| Engine control             | Behavioral component                                             | App service calls engine inbound port                    | Remote client and engine host expose the same semantic operation       |
| Shared limiter             | Behavioral component only when it owns global coordination       | Local admission implementation                           | Remote client plus limiter host/inbound adapter                        |
| Lifecycle fact publication | Outbound integration port                                        | Direct/in-process sink                                   | Redis-backed sink publishes a stable event contract                    |
| Observability consumer     | Behavioral component if it runs and maintains projections/status | Direct ingestion adapter                                 | Stream consumer adapter drives the same inbound behavior               |

The queue deserves careful wording. Redis itself is infrastructure. A loop that
claims jobs, renews or recovers pending work, invokes the worker, and acknowledges
completion is an inbound adapter or worker host behavior. It should not be hidden
inside a passive `QueuePort` as if `get()` were the whole distributed protocol.

## The two reasons for swapping infrastructure

The two motivations in the prompt are real and should remain separate in the
design.

### Durability, robustness, and accessibility

Filesystem to S3 and SQLite to Postgres are backend substitutions. They can improve
durability, concurrent access, operational tooling, or reachability without
changing component semantics.

The relevant configuration belongs to the infrastructure provider:

- endpoint and namespace
- credentials
- connection pool and request limits
- startup validation
- backend-specific retry behavior
- health and shutdown behavior

No component placement change is implied.

### Extensibility and observability

Publishing lifecycle facts to Redis Streams creates a system integration surface.
Even if every component remains embedded, a separately deployed consumer can read
the stream.

That surface needs more governance than a private infrastructure swap:

- stable event identity and schema versions
- category-specific streams rather than one undifferentiated message stream
- documented retention and trimming
- independent consumer groups for concerns that each need every event
- consumer idempotency
- access control and payload redaction
- compatibility rules for external consumers

Redis documents two distinct stream consumption semantics: members of one consumer
group divide work, while independent groups can each consume the stream. It also
documents pending-entry recovery with `XCLAIM`/`XAUTOCLAIM`. Those mechanics support
both a worker queue and a fact fan-out, but the streams and contracts should remain
semantically distinct. See the Redis documentation on [Streams](https://redis.io/docs/latest/develop/data-types/streams/),
[streaming and consumer groups](https://redis.io/docs/latest/develop/use-cases/streaming/),
and [`XAUTOCLAIM`](https://redis.io/docs/latest/commands/xautoclaim/).

A real stream is not automatically a durable historical record. Redis persistence
can be disabled, snapshot-based, append-only, or combined, each with different loss
windows. Retention, backup, and recovery therefore remain explicit deployment
decisions. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

## Common foundation for every approach

All three approaches below can share the following small assembly vocabulary.

### Constructed resource

Creating an SDK client object and proving that its backend is usable are different
operations. Model that explicitly instead of hiding asynchronous connection work in
constructors:

```ts
type HealthState =
  | { status: "ready" }
  | { status: "degraded"; reason: string }
  | { status: "not-ready"; reason: string };

interface ManagedResource<T> {
  readonly value: T;
  start(signal: AbortSignal): Promise<void>;
  health(): Promise<HealthState>;
  stop(): Promise<void>;
}

interface Provider<C, T> {
  create(config: C, context: ProviderContext): ManagedResource<T>;
}
```

Not every adapter needs to implement lifecycle methods itself. A provider can wrap
an ordinary adapter and own its client, readiness probe, and cleanup. This keeps
infrastructure lifecycle out of domain ports.

### Assembly result

```ts
interface RuntimeAssembly {
  services: ServicesPort;
  start(signal?: AbortSignal): Promise<void>;
  health(): Promise<SystemHealth>;
  stop(): Promise<void>;
}
```

Startup should be dependency-aware, preferably in stages:

1. Parse and validate configuration.
2. Construct clients and adapters without accepting work.
3. Start required infrastructure resources and verify readiness.
4. Construct or start component hosts and inbound consumers.
5. Mark the process ready.
6. On shutdown, stop accepting work, drain bounded in-flight work, close consumers,
   flush required sinks, then close clients.

### Provider categories

Do not put every factory in one untyped registry. At minimum, keep these categories
separate:

```ts
interface InfrastructureProviders {
  artifactStore: Provider<ArtifactStoreConfig, ArtifactStorePort>;
  database: Provider<SqlConfig, DatabaseResources>;
  lifecycleFacts: Provider<LifecycleFactsConfig, LifecycleEventSink>;
}

interface ComponentBindings {
  jobExecution: Provider<JobExecutionBinding, JobExecutorPort>;
  resourceAdmission: Provider<ResourceAdmissionBinding, ResourceAdmissionPort>;
}
```

This makes it hard to accidentally treat `S3ArtifactStore` as if it were a remote
artifact component or to treat a remote worker client as if it were passive storage.

## Approach 1: one universal config-driven runtime

### Shape

One package imports every supported provider. It parses one broad configuration,
selects factories from explicit maps or `switch` statements, validates the complete
graph, and constructs the process.

```ts
import { fsArtifactStoreProvider } from "@lcase/adapter-artifacts-fs";
import { s3ArtifactStoreProvider } from "@lcase/adapter-artifacts-s3";
import { sqliteProvider } from "@lcase/adapter-sqlite";
import { postgresProvider } from "@lcase/adapter-postgres";
import { redisFactsProvider } from "@lcase/adapter-redis-facts";

const artifactProviders = {
  filesystem: fsArtifactStoreProvider,
  s3: s3ArtifactStoreProvider,
} satisfies ProviderMap<ArtifactStoreConfig, ArtifactStorePort>;

export async function createRuntime(rawConfig: unknown) {
  const config = parseDeploymentConfig(rawConfig);
  return assemble(config, allProviders);
}
```

### Treatment of infrastructure and components

It can preserve the distinction if it uses separate registries for infrastructure
providers, hosted components, and component bindings. A single universal
`placement/transport/store` registry would erase the distinction and recreate the
current concern.

### Durability and extensibility

Both are straightforward runtime selections. A fully embedded process can select
S3, Postgres, and Redis lifecycle facts while retaining direct engine-to-worker
binding.

### What it buys

- One executable artifact can be reconfigured across many environments.
- One place validates the complete graph.
- Operational documentation can describe one config schema.
- New combinations do not require new application entry points.
- It works well for a server image where image size is not especially important.

### What it gives up

- The runtime package has production dependencies on every provider package.
- Unsupported combinations remain visible unless validation is careful.
- A change to any provider can force rebuilding the universal artifact.
- The startup code and test matrix grow with the product of supported choices.
- The Electron distribution may carry packages it can never select.

### Packaging reality

There are two different forms of bloat:

1. **Bundle reachability.** Static imports make code visible to a bundler. Dynamic
   `import()` can create lazy chunks, but those chunks are still normally part of
   the built application. Vite requires analyzable dynamic import patterns and
   transforms glob imports into a known module map; it does not make arbitrary
   installed providers disappear. See [Vite dynamic and glob imports](https://vite.dev/guide/features.html#dynamic-import).
2. **Installed dependency footprint.** If one package declares AWS, Redis, and
   Postgres clients as production dependencies, package installation includes them
   even when a subpath import only uses the filesystem adapter. Node `exports`
   provides encapsulated entry points and conditional resolution, but is not a
   production-dependency pruning mechanism. See [Node package entry points](https://nodejs.org/api/packages.html#package-entry-points).

This is a real concern for Electron, not merely theoretical. Electron Builder says
production `node_modules` are included in application contents even when ordinary
file patterns are customized. Bundling may reduce what remains external, but native
modules and excluded dependencies still need deliberate packaging. See
[Electron Builder application contents](https://www.electron.build/docs/contents/).

The concern should still be measured against an actual packaged artifact before it
drives a large redesign. If the cost is material, splitting heavyweight backend
adapters into separate workspace packages matters more than adding clever subpath
exports to one package.

### Best fit

Choose this when operational simplicity and runtime flexibility outweigh artifact
size, all deployments are trusted to receive every provider, and the supported
combination matrix remains small.

## Approach 2: explicit deployment profiles over a shared assembler

### Shape

A shared assembly library knows how to connect already-created ports and component
bindings. Thin profile modules import concrete providers and decide which choices a
given deployment product supports.

```text
runtime/
  assembly/
    assemble-system.ts
    lifecycle.ts
    validation.ts
  profiles/
    desktop.ts
    local-server.ts
    distributed-api.ts
    remote-worker.ts
```

The names are illustrative. These do not have to replace or merge the existing app
entry points.

```ts
// profiles/desktop.ts
import { FsArtifactStore } from "@lcase/adapter-artifacts-fs";
import { createSqliteResources } from "@lcase/adapter-sqlite";

export async function createDesktopRuntime(raw: unknown) {
  const config = parseDesktopConfig(raw);
  const resources = createManagedResources({
    artifacts: new FsArtifactStore(config.artifacts.rootPath),
    sql: createSqliteResources(config.sql),
    lifecycleFacts: createFactsProvider(config.lifecycleFacts),
  });

  return assembleSystem({
    resources,
    hosts: { engine: true, worker: true, observability: true },
    jobExecution: createDirectWorkerBinding,
  });
}
```

```ts
// profiles/remote-worker.ts
import { S3ArtifactStore } from "@lcase/adapter-artifacts-s3";
import { createRedisWorkerIngress } from "@lcase/adapter-worker-redis";

export async function createRemoteWorkerHost(raw: unknown) {
  const config = parseRemoteWorkerConfig(raw);
  return assembleWorkerHost({
    artifacts: createS3Provider(config.artifacts),
    ingress: createRedisWorkerIngress(config.workerIngress),
    lifecycleFacts: createRedisFactSink(config.lifecycleFacts),
  });
}
```

Profiles can still contain bounded runtime choices. A local-server profile might
permit filesystem or S3 and SQLite or Postgres. The desktop profile might support
only filesystem and SQLite. The remote-worker profile might require S3, Redis, and
Postgres or an artifact-service client. The choice is explicit in each profile's
dependency graph and config schema.

### Treatment of infrastructure and components

This approach makes the distinction very visible:

- Infrastructure providers are direct SDK-backed leaves selected by the profile.
- Hosted component cores are explicitly listed by the process role.
- Component bindings connect outbound ports to direct inbound ports or remote
  transports.
- A worker process and an API process each have their own composition root. Neither
  process constructs the other.

### Durability and extensibility

Profiles do not need to be all-local or all-remote presets. A local-server profile
can use direct worker invocation, S3, Postgres, and Redis lifecycle facts. That is
exactly the local-but-swapped case in the prompt.

The profile says which choices are supported, while startup config supplies
locations and any intentionally variable backend selector.

### What it buys

- Dependency and package footprints follow real deployment products.
- Unsupported adapters are absent rather than merely rejected at runtime.
- Each container image or Electron build has an auditable dependency set.
- Process roles are explicit, which helps the remote-worker transition.
- The shared assembler prevents object-graph logic from being copied across every
  entry point.
- Ordinary TypeScript imports remain statically analyzable.

`pnpm deploy` can produce a portable package with only a selected workspace
package's production dependency closure, which aligns naturally with profile/app
packages. See [pnpm deploy](https://pnpm.io/cli/deploy).

### What it gives up

- A new supported product/profile may require a new entry module and build target.
- Providers available to one profile cannot be selected in another without a code
  and dependency change.
- Profile config schemas and smoke tests must be kept coherent.
- If assembly behavior leaks into profiles, duplication returns quickly.

The maintenance control is architectural: profiles select and configure providers;
the shared assembler owns graph invariants, startup order, and component wiring.
When a component gains a required port, the assembler's typed input should force
every profile to supply it.

### Best fit

Choose this when there are a small number of real deployment products, package
footprint and auditable dependencies matter, and arbitrary third-party provider
installation is not a product requirement. That describes the current project well.

## Approach 3: runtime-loaded provider modules or plugins

### Shape

The runtime depends on provider contracts but not every implementation. Config
names modules that are installed alongside the deployment. The runtime loads them
with `import()` and asks each module to validate its own config and construct a
managed resource.

```ts
interface InfrastructureProviderModule<C, T> {
  readonly category: "infrastructure";
  readonly provides: string;
  readonly version: 1;
  parseConfig(input: unknown): C;
  create(config: C, context: ProviderContext): ManagedResource<T>;
}

interface ComponentBindingProviderModule<C, T> {
  readonly category: "component-binding";
  readonly provides: string;
  readonly version: 1;
  parseConfig(input: unknown): C;
  create(config: C, context: BindingContext): ManagedResource<T>;
}
```

```json
{
  "providers": {
    "artifactStore": {
      "module": "@lcase/adapter-artifacts-s3",
      "config": { "bucket": "artifacts", "region": "us-east-1" }
    }
  }
}
```

The category split is important. A component binding plugin may create a remote
worker client or host ingress. An infrastructure plugin may create an S3 adapter.
They should not share one weak `unknown -> unknown` factory contract.

### Treatment of infrastructure and components

The provider API can enforce distinct module categories and compatibility versions.
However, plugin systems tend to push designs toward a generic service locator. The
runtime must resolve plugins at the composition boundary and inject typed ports;
component cores should never look up providers by string.

### Durability and extensibility

This gives maximum infrastructure extensibility. A new backend can be installed
without rebuilding the runtime. It also supports a separately distributed event
stream provider.

External event consumers do not require this plugin mechanism. Once lifecycle facts
are on Redis Streams under a stable contract, external consumers can attach through
Redis without running inside this process. Plugin loading solves adapter extension,
not event-consumer extension.

### What it buys

- Providers can be installed and upgraded separately from the host runtime.
- A deployment installs only selected provider packages.
- Private or experimental adapters need not enter the central runtime package.
- It can support customer-supplied infrastructure providers later.

### What it gives up

- Provider compatibility and versioning become a public platform contract.
- External config is necessarily runtime-validated.
- Bundlers need explicit externalization or a statically enumerable import map.
- Electron must decide where plugins live, how they are signed, and whether loading
  arbitrary code is acceptable.
- Dependency resolution, supply-chain trust, duplicate SDK versions, diagnostics,
  and upgrades become product features.
- Startup failures move from compile/build time to deployment time.

Dynamic imports defer module loading; they do not install missing packages. Node's
package `exports` can define explicit provider entry points and conditions, but the
host still needs a deployment mechanism that installs compatible modules. See
[Node package exports and conditions](https://nodejs.org/api/packages.html#conditional-exports).

### Best fit

Choose this only when independently installed adapters are a real product
requirement. It is more architecture than the near-term remote worker needs.

## Direct comparison

| Question                | Universal runtime                                            | Explicit profiles                                               | Provider plugins                                             |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Adapter selection       | Any supported adapter selected at startup                    | Profile fixes or bounds choices; config selects within that set | Config names installed provider modules                      |
| Electron footprint      | Highest risk; all production dependencies may travel         | Strongest control; desktop imports only its providers           | Potentially small host, but plugin packaging becomes complex |
| Runtime flexibility     | Highest within one artifact                                  | Deliberately bounded per artifact                               | Highest if modules can be installed                          |
| Build-time pruning      | Weak unless build constants make branches dead               | Strong through distinct static entry graphs                     | Strong only if unselected modules are not installed/bundled  |
| Config validation       | One large runtime schema plus graph validation               | Smaller schema per profile plus shared graph validation         | Host validates manifest; plugin validates provider config    |
| Invalid combinations    | Runtime validation, plus discriminated unions where possible | Many are absent at build time; remaining ones validated         | Mostly runtime validation                                    |
| Container model         | Often one image reused with different roles/config           | Natural image per role, or a small family of images             | Thin host image plus installed provider layer                |
| New backend cost        | Edit central runtime and rebuild                             | Add package to relevant profiles and rebuild them               | Install a compatible provider module                         |
| Composition drift       | Lowest centralization risk                                   | Controlled by shared assembler and profile tests                | Controlled by provider contract/version tests                |
| Operational complexity  | Low to medium                                                | Medium build/release matrix                                     | Highest                                                      |
| Dynamic per-run routing | Possible but separate from registry                          | Possible through an explicit router provider                    | Natural to add, but still semantically expensive             |
| Current-project fit     | Plausible for server, less attractive for desktop            | Best balance                                                    | Premature unless third-party plugins become a goal           |

## Answers to the open questions

### One runtime or multiple?

The term "runtime" hides three things:

1. The shared code that assembles domain components from ports.
2. An executable entry point that selects a supported provider set.
3. A running OS process.

There can be one shared assembly library while having multiple entry points and one
composition root per process. That is not harmful duplication by itself.

The package footprint problem is real when a shared runtime package or shared
adapter package declares every heavy SDK as a production dependency. Tree shaking
can reduce bundle code but cannot be relied upon to prune the installed dependency
closure. Separate profile/app packages and separate backend adapter packages are
the strongest guarantee.

Do not split merely because two configurations differ. Split when there is a real
deployment product, process role, security boundary, platform constraint, or
material footprint difference.

### Config-driven runtime or what else?

The alternatives are:

- **Programmatic/manual composition:** entry-point code imports providers and passes
  constructed ports to a shared assembler. This is the core of Approach 2.
- **A DI container:** modules register tokens and factories; config chooses modules.
  This can reduce repetitive construction but does not solve packaging or invalid
  semantic combinations on its own. It also makes the object graph less visible.
- **Provider modules/plugins:** config selects installed code, as in Approach 3.
- **Build-generated composition:** a deployment manifest generates or selects a
  static TypeScript entry point. This reconciles a declarative deployment spec with
  tree shaking, but introduces code generation and separate artifacts. It is a
  variation of explicit profiles, useful only if the profile count becomes large.

Manual constructor injection is sufficient here. Martin Fowler's original
dependency-injection discussion recommends separating service configuration from
use and keeping a programmatic configuration interface underneath any config-file
mechanism. See [Inversion of Control Containers and Dependency Injection](https://martinfowler.com/articles/injection.html).

### Containers

Containers do not change port semantics. They make process roles and deployment
dependencies explicit:

```text
api/engine container
  hosts engine and HTTP application services
  uses remote JobExecutor adapter

worker container
  hosts worker core and Redis inbound consumer
  uses artifact, SQL, and lifecycle-fact adapters

redis / postgres / minio
  infrastructure services reached by their native clients
```

Each application container has its own composition root. A container image can be
profile-specific or use the universal-runtime model.

Docker Compose can gate startup on dependency healthchecks, but container start
order alone does not mean a dependency is ready. See [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/).
Kubernetes distinguishes startup, readiness, and liveness probes because these have
different operational meanings. Readiness controls whether a process should receive
traffic; liveness should indicate a condition restart can fix. See [Kubernetes
probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/).

The application must still handle a dependency failing after startup. Orchestration
cannot replace adapter error handling, reconnect policy, idempotency, or pending-work
recovery.

### The irreducible base thing

There is no requirement for one application process that constructs or controls
the whole distributed system.

In a monolith, one composition root owns the complete object graph. In a distributed
deployment, each process owns only its local graph:

- API/engine host composition root
- worker host composition root
- optional limiter host composition root
- observability/projection consumer composition root

The deployment system becomes the place that declares which processes and
infrastructure services exist. Docker Compose, Kubernetes, systemd, or a desktop
launcher may fill that role. It starts processes and evaluates health; it does not
inject application objects across process boundaries.

There is still an irreducible fixed point in each executable: its `main`/bootstrap
function and selected composition profile. At the system level, the fixed point is
the deployment specification plus configuration/secrets. Those are replaceable by
choosing a different deployment mechanism, but not dynamically swapped by the
application they are launching.

Avoid strict global startup choreography where possible. A process should start,
attempt required connections, remain unready while dependencies are unavailable,
and tolerate bounded reconnection. That works for both Compose and a future
orchestrator.

### Static-per-process or dynamic-per-run configuration?

Default to static provider selection per process for V1.

Per-run backend selection is not a small extension to startup configuration. It
requires at least:

- a trusted backend/tenant selector on the run execution context
- persistence of that selector so retries and replay use the same backend
- a provider router or client cache keyed by backend identity
- bounded connection-pool creation and eviction
- credentials and authorization per selected backend
- artifact identities that say which store/namespace owns a hash, unless every
  configured CAS is globally replicated
- explicit transaction boundaries when related data spans SQL backends
- metrics and health partitioned by provider identity

```ts
interface ArtifactStoreRouter {
  forExecution(context: ExecutionStorageContext): ArtifactStorePort;
}
```

This router is itself the process-wide outbound dependency. Components should not
receive a global registry and perform string lookups.

Add this only for a proven use case such as multi-tenancy, user-selected storage,
or migration between backends. "Maybe one run is local and another is S3" is not
enough to justify the identity, pooling, recovery, and authorization model.

### Connection lifecycle

Construction should usually be synchronous and side-effect-light; startup should be
explicitly asynchronous. Exact policy differs by dependency criticality.

| Dependency                               | Boot behavior                                                                                | Mid-run behavior                                                                                      | Degraded mode?                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Postgres used for required system state  | Connect/ping or first required query before ready; migrations are a separate deployment step | Pool reconnect/error handling; operation fails within a timeout                                       | Usually not for APIs that require run state      |
| Redis worker ingress                     | Worker not ready until connected and group/stream setup is valid                             | Reconnect; recover pending messages; stop claiming new work while unavailable                         | Process may stay alive but must report not-ready |
| Required lifecycle-fact publisher        | Do not claim readiness unless publication is durable or a local outbox/buffer is available   | Retry with stable event identity; apply backpressure or fail the owning operation according to policy | Only if facts are explicitly non-required        |
| S3 artifact storage required by all jobs | Optional lightweight validation before ready, or lazy first operation with clear health      | SDK timeout/retry plus typed store failure                                                            | Possibly, if non-artifact routes remain useful   |
| SQLite/filesystem                        | Validate path, permissions, and schema during startup                                        | Surface disk/full/permission errors; no network reconnect                                             | Usually no if it is the sole state store         |
| Optional telemetry exporter              | Start opportunistically                                                                      | Drop/buffer according to documented telemetry policy                                                  | Yes                                              |

Prisma connects lazily by default but supports explicit `$connect()` and
`$disconnect()`, which is useful when readiness should prove database access. It
also recommends one client instance for a long-running process. See [Prisma
connection management](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-management).

The Node Redis client requires an explicit `connect()`, exposes readiness state and
connection events, and supports configurable reconnect backoff. See [Node Redis
connections](https://redis.io/docs/latest/develop/clients/nodejs/connect/) and its
[production guidance](https://redis.io/docs/latest/develop/clients/nodejs/produsage/).

An S3 SDK client does not need an eager logical connection in the same way, though
it owns reusable HTTP connections and should be destroyed during shutdown when the
process no longer needs it. The AWS SDK reuses connections by default. See [AWS SDK
connection reuse](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html).

### Type-level or runtime-level validity?

Use both, at different boundaries.

- External configuration from environment variables, JSON, YAML, Electron settings,
  or container secrets enters as `unknown` and must be runtime-validated.
- The parser should return discriminated unions so programmatic construction and
  provider selection are type-safe.
- A second graph-validation pass should check cross-field invariants that are
  awkward or misleading to encode in one giant union.

TypeScript erases types when producing JavaScript, so a type annotation cannot
validate deployment input at runtime. See [TypeScript erased types](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch#erased-types).
Discriminated unions are still valuable after parsing because they narrow
backend-specific fields and enable exhaustive switches. See [TypeScript
discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).

Example:

```ts
type ArtifactStoreConfig =
  | { backend: "filesystem"; rootPath: string }
  | { backend: "s3"; endpoint?: string; bucket: string; region: string };

function createArtifactStore(config: ArtifactStoreConfig) {
  switch (config.backend) {
    case "filesystem":
      return createFsStore(config);
    case "s3":
      return createS3Store(config);
    default:
      return assertNever(config);
  }
}
```

Do not attempt to encode the entire distributed topology as an enormous union of
all legal products. Runtime graph validation can produce better diagnostics such as
"direct job execution requires worker to be hosted in this process."

### Local development parity

Use a layered strategy rather than one universal rule:

1. **Unit and component tests:** in-memory fakes for fast, deterministic tests of
   consumers behind ports.
2. **Adapter contract tests:** run the same behavioral contract against filesystem
   and S3/MinIO, and later against relevant queue/SQL adapters.
3. **Default local product:** use the infrastructure that is genuinely a supported
   local product. Filesystem and SQLite are legitimate desktop/local adapters, not
   automatically fake implementations.
4. **Infrastructure integration profile:** use MinIO, Redis, and Postgres containers
   with the same production adapter code.
5. **Distributed end-to-end profile:** run engine/API and worker as separate
   processes against those shared services.

An in-memory message implementation is justified for tests and perhaps an explicit
ephemeral mode. It is not sufficient to prove Redis acknowledgment, pending-entry
recovery, reconnection, retention, or external-consumer behavior.

Do not require every developer command to start every infrastructure container.
Make the production-parity profile easy and routine, especially in CI and before
merging adapter/remote-worker changes.

### Retries, timeouts, and tracing

Use two layers, because the concerns are not actually uniform.

#### Semantic wrappers around ports

Apply common policy where the operation semantics are known:

```ts
const artifacts = withTracing(
  withOperationTimeout(rawArtifacts, config.artifactTimeout),
);
```

Good wrapper-level concerns include:

- end-to-end time budgets and cancellation
- semantic span names and correlation context
- metrics around port operations
- circuit breaking where a whole capability should shed load
- normalization of adapter errors into port errors

#### Backend-native behavior inside providers/adapters

Keep protocol-specific behavior close to the SDK:

- Redis reconnect and offline-queue policy
- S3 retry classification and HTTP connection settings
- Postgres pool sizing and connection timeout
- Redis stream claim/ack/pending recovery

Retries cannot be one uniform decorator because safety depends on the operation.
Reading a blob is naturally repeatable. Publishing the same lifecycle fact is safe
only if it retains a stable event ID and consumers are idempotent. Retrying an
external job execution can duplicate effects unless the command has an idempotency
contract.

Also avoid stacked, unbounded retry layers. The AWS SDK already has standard retry
behavior with error classification and backoff; an outer operation deadline should
bound it rather than blindly retrying the whole adapter again. See [AWS SDK retry
behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).

For tracing, initialize the OpenTelemetry SDK in the executable host, before
instrumented libraries load. Components/libraries should depend only on the OTel
API or an internal narrow telemetry port; the host chooses exporters and SDK
configuration. OpenTelemetry explicitly distinguishes library API usage from
application SDK initialization. See [OpenTelemetry JavaScript instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/)
and [library instrumentation guidance](https://opentelemetry.io/docs/concepts/instrumentation/libraries/).

## A concrete profile set for the project

The following is an example of how Approach 2 could support the known targets
without declaring every combination a separate runtime:

| Profile/process role              | Hosted components                                       | Component binding                                              | Infrastructure choices                                                                                         |
| --------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Desktop                           | Engine, worker, observability, optionally local limiter | Direct engine-to-worker                                        | Filesystem + SQLite; lifecycle facts in-process or Redis if external attachment is enabled                     |
| Localhost server                  | Engine, worker, observability                           | Direct by default; Redis binding available for transport proof | Filesystem or S3; SQLite or Postgres; in-process or Redis facts                                                |
| Distributed API/engine            | Engine, API services, observability as selected         | Redis worker client                                            | S3, Postgres, Redis facts                                                                                      |
| Remote worker                     | Worker and Redis inbound host                           | Redis worker ingress/result path                               | S3 or higher-level artifact client, Postgres only while current artifact registration requires it, Redis facts |
| Projection/observability consumer | Observability/projection behavior                       | Redis lifecycle-fact ingress                                   | Postgres and any required artifact reader                                                                      |

The localhost-server profile intentionally permits embedded components with remote
infrastructure. The distributed profiles change hosted behavior and component
bindings. Those are separate transitions.

## Suggested selection model

If implementing this direction, the config should use per-concern discriminants
instead of universal coordinates:

```ts
type LocalServerConfig = {
  profile: "local-server";
  hosts: {
    worker: true;
  };
  bindings: {
    jobExecution:
      | { kind: "direct" }
      | { kind: "redis-streams"; connection: RedisConnectionRef };
  };
  infrastructure: {
    artifacts: ArtifactStoreConfig;
    sql: SqlConfig;
    lifecycleFacts: LifecycleFactsConfig;
  };
};
```

Configuration values should describe behaviorally meaningful choices, not
implementation construction details. For example:

- `artifacts.backend = "s3"`, not a factory module path in the non-plugin approaches
- `jobExecution.kind = "redis-streams"`, not `placement = remote` inferred from a
  generic transport table
- explicit stream names and consumer-group identities
- endpoint and secret references, not already-constructed SDK clients

The profile owns the provider allow-list. The runtime parser resolves secret
references and produces validated internal config. Providers construct SDK clients.
The shared assembler wires ports and owns lifecycle ordering.

## Testing the composition design

Each layer needs a different test:

- Provider unit tests verify config-to-client mapping and backend error mapping.
- Shared adapter contract suites verify observable port behavior across real
  implementations.
- Profile composition tests boot with controlled fakes and assert that the expected
  components and bindings exist.
- Config tests assert useful errors for invalid combinations.
- Container integration tests use real MinIO, Redis, and Postgres.
- A remote-worker end-to-end test starts two processes, submits one job, persists
  artifacts, records lifecycle facts, handles a result, and proves restart/recovery
  behavior.
- Packaging tests or CI checks inspect the Electron artifact and each container's
  production dependency closure. This is more reliable than reasoning about tree
  shaking from source imports alone.

For the profile approach, a useful compile-time test is simply that every profile
continues to call the same typed assembler. A new required outbound port then breaks
all incomplete profiles during type checking.

## Decision guidance

The current project does not need a general plugin platform to prove a remote
worker. It does need more than a universal three-axis factory table.

The most balanced decision is:

1. Keep infrastructure adapter packages and component host/binding adapters
   conceptually distinct.
2. Extract a shared assembly API that accepts already-selected providers or managed
   resources.
3. Create explicit composition modules for the actual process roles, without
   merging the existing Electron and HTTP/CLI entry points as part of this work.
4. Let each profile expose bounded, per-port runtime config where genuine user or
   deployment choice exists.
5. Split heavyweight backend adapters into separate packages if packaged footprint
   measurement shows the shared `@lcase/adapters` dependency is pulling them into
   Electron or unrelated containers.
6. Add explicit async startup/readiness/shutdown before Redis and Postgres are
   treated as production dependencies.
7. Keep provider selection static per process for V1.
8. Put lifecycle facts on the real Redis stream when the extensibility seam is
   desired, even if engine and worker are still embedded.
9. Use Redis stream contracts separately for commands, lifecycle facts, telemetry,
   and metrics even if they share one Redis deployment.
10. Reconsider runtime-loaded plugins only after there is a requirement to install
    a backend without rebuilding a deployment artifact.

This preserves the architecture's useful invariant: component behavior and port
semantics do not change when placement or infrastructure changes. What changes is
which process hosts the behavior, which binding reaches it, and which provider
satisfies each passive infrastructure dependency.

## References

Repository context:

- [Component architecture model](../../../component-architecture/model.md)
- [Capability modules research](../../../component-architecture/research/capability-modules.md)
- [Worker V2 architecture](../../../component-architecture/worker-v2/README.md)
- [Swappable infrastructure initiative](../INITIATIVE.md)
- [CAS adapter arc](../arcs/cas-adapter.md)
- [Queue adapter arc](../arcs/queue-adapter.md)
- [SQL adapter arc](../arcs/sql-adapter.md)

External primary documentation:

- [Node.js package entry points and conditional exports](https://nodejs.org/api/packages.html#package-entry-points)
- [Vite dynamic and glob imports](https://vite.dev/guide/features.html#dynamic-import)
- [pnpm deploy](https://pnpm.io/cli/deploy)
- [Electron Builder application contents](https://www.electron.build/docs/contents/)
- [TypeScript erased types](https://www.typescriptlang.org/docs/handbook/typescript-from-scratch#erased-types)
- [TypeScript discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- [Redis streaming and consumer groups](https://redis.io/docs/latest/develop/use-cases/streaming/)
- [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Node Redis connection management](https://redis.io/docs/latest/develop/clients/nodejs/connect/)
- [Node Redis production guidance](https://redis.io/docs/latest/develop/clients/nodejs/produsage/)
- [Prisma connection management](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-management)
- [AWS SDK connection reuse](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html)
- [AWS SDK retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Kubernetes startup, readiness, and liveness probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- [OpenTelemetry JavaScript instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/)
- [OpenTelemetry library instrumentation](https://opentelemetry.io/docs/concepts/instrumentation/libraries/)
- [Martin Fowler on dependency injection and configuration](https://martinfowler.com/articles/injection.html)
