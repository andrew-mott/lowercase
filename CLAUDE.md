# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is pnpm (`pnpm@10.17.1`, enforced via `packageManager` + corepack). Workspaces: `apps/*`, `packages/*`, `packages/use-cases/*`, `examples/`.

- Install: `pnpm install`
- Build all: `pnpm build` (turbo fan-out)
- Bundle hosts: `pnpm bundle` — esbuild over each app's `dist`, one `.mjs` plus source map and metafile per host into that app's `bundle/`. Hosts, externals, and packages each host must not contain live in the app's `bundle.config.mjs`; the shared runner is `scripts/bundle.mjs`, and a forbidden package fails the bundle.
- Deployment images: `pnpm deploy:build` bundles, then builds the images `deploy/remote-worker.compose.yaml` runs (see `deploy/README.md`). The repo-root `docker-compose.yml` is separate: it is integration-test infrastructure only.
- Typecheck all: `pnpm typecheck`
- Test all: `pnpm test` (runs vitest per package via turbo) — `pnpm -r test` also works to run all package tests from the root
- Lint all: `pnpm lint` — real ESLint in every package except `packages/archive/*` (stubbed as `echo lint`) and `apps/desktop` (no `lint` script at all). Run in CI (`.github/workflows/ci.yaml`).
- No root `dev` script. Run per app, e.g. `cd apps/http-server && pnpm dev` or `cd apps/workbench && pnpm dev`.

Every package/app uses **vitest** (never jest), with tests under `tests/**/*.test.ts`. To run a single test file or case, `cd` into the package and use `vitest run` directly — `pnpm -F <pkg> test -- <path>` does NOT filter, it runs the whole suite:

```bash
cd packages/components/engine
pnpm vitest run tests/value-refs.test.ts
pnpm vitest run tests/value-refs.test.ts -t "test name substring"
```

## Work-tracking documentation

Before changing the work-tracking system or its documentation, read
[`docs/work-tracking.md`](docs/work-tracking.md). It defines the canonical
Initiative / Arc / Change terminology and the required migration sequence. Do
not partially migrate that terminology unless the task explicitly requests it.

## Architecture

This is an event-driven workflow engine (package scope `@lcase`) built around hexagonal ports/adapters, with a reducer→planner→effect execution core.

**Layering** (dependency direction flows downward — see [`docs/adr/0005-package-tier-taxonomy.md`](docs/adr/0005-package-tier-taxonomy.md) for the full decision record, [`docs/architecture.md`](docs/architecture.md) for a plainer package-by-package map):

- `packages/types` — shared types, intentionally **Prisma-free**.
- `packages/specs` — the flow-definition JSON schema/parser.
- `packages/ports` — interfaces only (bus, queue, router, artifact store/repo, run repo/query, flow/sim repo, worker, limiter, services). No implementations.
- `packages/functional-core/*` — zero ports, zero I/O, safe for anything to import directly: `flow-analysis` (dependency graph, toposort), `json-ref-binder` (ref resolution).
- `packages/app-services` — application-facing business logic (`RunService`, `FlowService`, etc.), called directly by an app or a process profile. Depends only on ports, never on Prisma directly.
- **Operations** — a convention, not a dedicated folder: small, single-port building blocks called by whichever tier above already holds the port (`runFlow()` in `packages/use-cases/run-flow` is the one clean example today). Speculative — no substantial example beyond that one yet, see ADR-0005.
- `packages/components/*` — long-lived, self-driven by subscribing to the event bus rather than being called: `engine`, `worker`, `limiter`, `router`, `observability`.
- `packages/adapters` — concrete implementations of every port, including all Prisma-backed repositories (`prisma-run-repository.ts`, `prisma-artifact-repository.ts`, etc.) and non-SQL adapters (`InMemoryQueue`, `FsArtifactStore`).
- `packages/process-hosting/*` — everything involved in composing and running one OS process, split by what each piece is allowed to depend on. `assembly` owns generic managed-resource lifecycle (ordered start, reverse stop, rollback, health), `message-router` owns the two Message carriers and their mailbox machinery, and `message-topology` owns the static side of messaging — topic/subscription declarations, deployment manifests, delivery routes, process host plans, and the carrier-neutral step that resolves a plan's ids against the catalogs a process imported, with no router, carrier, or connection of its own; **all three have zero production dependencies on purpose**, so a process that hosts one component can install them without installing the whole system. `message-router` consumes `message-topology` for types only, which is what keeps the dependency direction compiler-enforced: a static declaration cannot import a carrier. `message-topology` splits its entry points: the package root is the generic layer, `@lcase/message-topology/catalogs` holds the conversations (one module per protocol family, mirroring `packages/types/src/events/`), and `@lcase/message-topology/deployments` holds the supported deployment presets. A generic router therefore never imports product topics, and catalogs and deployments are siblings because a deployment is of the whole system while a catalog is one family. `profile-local-system` is the composition root for the complete embedded graph and is shared by `apps/http-server`'s embedded host and `apps/cli` via `createLocalSystem(config)`. It selects a backend per config axis (`artifacts`, `sql`, `messaging`), statically, when the process is composed. Profiles are the only places allowed to import concrete components and adapters. Separate process roles so far compose **app-local** profiles rather than packages here — `apps/worker-host/src/profile/` hosts Worker alone, and `apps/http-server/src/profiles/api-host/` hosts the API with Engine and Observability — each forced to one backend per axis, and each its own profile rather than a flag on the embedded one. A package here is warranted once a second executable composes the same role. See ADR-0008.
- `apps/*` — HTTP server (Fastify), CLI, Electron desktop, and a React frontend (`workbench`).

`packages/use-cases/*` (`run-flow`, `run-history`) still mixes shapes predating this taxonomy and doesn't map cleanly onto one tier — `run-history` is actually `functional core` (zero port imports), `run-flow` bundles a pure function, a clean Operation (`runFlow()` itself), and a two-port function (`create-fork-spec.ts`'s `startForkedSim()`) that needs further decomposition before it qualifies as one. Don't treat its current package boundary as settled. The old idea of reorganizing this layer as "domains" (`docs/todo.md`) is superseded by the taxonomy above, not a live alternative.

**Enforced conventions worth preserving when making changes:**

- Keep `packages/types` Prisma-free.
- Keep `packages/app-services`/`packages/use-cases` storage-agnostic — inject ports, never import Prisma or adapters directly.
- New Prisma repositories belong in `packages/adapters`, wired up in a process profile under `packages/process-hosting/*`.
- Keep engine changes incremental unless a larger rewrite is explicitly intended.

**Run execution flow** (HTTP request to completion):

1. `POST /runs` (`apps/http-server/src/http/routes/runs/request.ts`) calls `RunService.requestRun` (`packages/app-services/src/run.service.ts`), which validates against the flow definition (fetched from CAS), persists a `Run` row, and calls `runFlow()` (`packages/use-cases/run-flow/src/run-flow.ts`), which emits `run.requested` on the event bus.
2. `Engine` (`packages/components/engine/src/engine.ts`) subscribes to `run.requested` and drives a **reducer → planner → effect** loop (registries in `packages/components/engine/src/registries/`, planners in `packages/components/engine/src/planners/`, effects in `packages/components/engine/src/effects/`): it fetches the flow def from CAS, builds the dependency graph via `packages/functional-core/flow-analysis` (toposort), and computes a `RunPlan` (steps to run vs. reuse, for fork/replay).
3. For each runnable step, the engine emits `job.<capability>.submitted`. `NodeRouter` (`packages/components/router/src/node.router.ts` — a component, not an adapter: it self-subscribes to the bus and orchestrates across three ports) re-emits it as `job.<capability>.queued` onto `InMemoryQueue`, keyed by tool id.
4. `Worker` (`packages/components/worker/src/worker.ts`) reserves jobs per tool, resolves `Ref`s from CAS (`@lcase/json-ref-binder`), invokes the protocol binding (`packages/tools` — `httpjson`/`mcp` today), stores the output and any declared exports as new CAS artifacts, and emits `job.<capability>.completed`/`failed`. This package has significant internal complexity and is a known target for a larger refactor — don't treat its current internal structure as a pattern to replicate elsewhere; the full result payload currently riding inside the `job.<capability>.completed`/`failed` event rather than being kept out of it is one specific known rough edge. Per [`ADR-0006`](docs/adr/0006-worker-tool-extensibility-model.md): there is no tool registry — the worker's fixed set of supported protocols is the extension mechanism, and `packages/tools` holds first-party protocol bindings, not a plugin surface. That much is settled; what a real third-party integration attempt would actually look like in practice is still unexercised.
5. The engine advances the run plan on step completion, fanning out subsequent ready steps, until it emits `run.completed`/`run.failed`.
6. `ObservabilityTap` (`packages/components/observability`) taps the same bus and fans events to sinks — notably `SqlRunProjectionSink`, which is what actually populates the SQL `Run`/`RunStepProjection` tables that read paths (`RunQueryPort`) query.

**Step categories:** steps split into two kinds. _Capability_ steps (`httpjson`, `mcp`) are dispatched to the worker as real jobs per the flow above. _Pure control-flow_ steps (`parallel`, `join`, `branch`) never reach the worker — `parallel`/`join` are resolved entirely inside engine reducers (`packages/components/engine/src/reducers/`), and `branch` (routes to a case-specific next step based on a resolved export/param value, with a mandatory default) resolves its value via a dedicated engine effect that reads CAS directly (`packages/components/engine/src/effects/resolve-branch-value.effect.ts`), the same pattern `GetFlowDefFx` already uses for fetching flow definitions. Don't route a `branch` step's value resolution through the worker/tool system — it isn't a capability.

**Storage split (two-tier, do not conflate):**

- **SQL** (Prisma, SQLite by default — `packages/db-prisma/prisma/schema.prisma`) owns _metadata only_: `Flow`, `FlowVersion`, `Sim`, `Run`, `RunStepProjection`, and `Artifact` metadata (hash, contentType, size, format — no blob bytes).
- **CAS/blob storage** (`packages/artifacts` domain logic + `FsArtifactStore` in `packages/adapters`) owns immutable content, sha256-hashed and sharded on disk by hash prefix. Step outputs/exports are stored here; only their hashes land in SQL. `FsArtifactStore` is meant to be a swappable adapter — the intent is to support other blob backends (e.g. S3, MinIO) later behind the same `ArtifactStorePort`, though it's undecided whether future backends stay hash-addressed the same way.
- `FsArtifactIndexStore` (JSON-file index) is a legacy/fallback path — production wiring uses `PrismaArtifactRepository` for artifact metadata instead.
- Replay/raw event history (JSONL event log, `packages/replay`) is a separate concern, not folded into SQL.

**Other things worth knowing:**

- `packages/scheduler` was removed (`architecture-boundaries` initiative) — it mirrored the engine's reducer/planner/effect shape as an old idea for deterministic-state-based job routing, superseded by the simpler concurrency/rate-limiting approach in `packages/components/limiter` (infra-level job routing doesn't need deterministic state). `@lcase/router` (`packages/components/router`) does the simpler version of that job. Don't reintroduce this pattern.
- `packages/archive/` holds `controller` and `ui` — real but unmaintained dependencies of `apps/desktop` (its Electron IPC bootstrap and root React shell, respectively), kept as reference scaffolding for a possible future Electron rebuild rather than deleted outright. `apps/desktop` itself has no `typecheck`/`lint`/`test` script, so nothing in CI currently verifies this code still compiles.
- `packages/events` defines per-domain zod schemas (`*.event.schema.ts` + `*.data.schema.ts`) and an `EmitterFactory` with a repeated per-domain method pattern. This is a known, acknowledged rough edge (see doc comments in `packages/events/src/emitter-factory.ts` and `base.emitter.ts`) and an active refactor target — possible directions under consideration include generating this boilerplate from a single source of truth, or moving from Zod to AJV JSON Schema (e.g. if that integrates cleanly with Fastify validation). Nothing is decided yet, so don't casually restructure it while doing unrelated work, but don't be surprised if it changes.
