# @lcase/http-server

Fastify REST API and event stream server for the workflow engine — the backend [`apps/workbench`](../workbench) talks to. See the [repo root README](../../README.md) for the overall project, including database setup (`pnpm db:migrate`).

## Two hosts

This package builds one HTTP layer and two processes that serve it. **Which components a process holds** is decided when it is composed, so each one is its own entry point under `src/hosts/`. **Which backend each component talks to** is a separate question, answered by configuration.

| Host         | Entry point             | Holds                                          | Backends                                                                        |
| ------------ | ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| **embedded** | `src/hosts/embedded.ts` | everything: API, Engine, Worker, Observability | selectable per axis — SQLite or Postgres, filesystem or S3, in-process or Redis |
| **api**      | `src/hosts/api.ts`      | API, Engine, Observability — no Worker         | Postgres, S3, Redis; no alternative                                             |

The embedded host composes [`@lcase/profile-local-system`](../../packages/process-hosting/profile-local-system), shared with the CLI, and picks a backend per axis from `LocalSystemConfig` — so it runs equally well fully local or against the same Postgres, MinIO and Redis the distributed pair uses. [`src/hosts/embedded.config.ts`](src/hosts/embedded.config.ts) chooses the all-local combination because that is the useful development default, not because the host is limited to it.

The API host has nothing to select, and that is the difference worth understanding. A process whose Worker lives elsewhere needs a database and an object store that a second process can reach, and a carrier that can leave the process at all — so its config type admits exactly one backend per axis. It composes an app-local profile under `src/profiles/api-host/` and expects [`apps/worker-host`](../worker-host) to be running separately: the two exchange job commands and terminals over Redis streams, share artifacts through S3 and metadata through Postgres, and neither names the other — they agree by resolving the same deployment manifest.

Both hosts serve identical routes. `src/http/` holds everything they share, and is handed an already-composed system rather than composing one.

## Development

```bash
pnpm dev        # embedded host
pnpm dev:api    # API host
```

Listens on `http://127.0.0.1:3000` by default. Override with the `PORT`/`HOST` env vars.

The API host needs its backing services up first, from the repo root:

```bash
docker compose up -d --wait
pnpm -F @lcase/db-prisma migrate:postgres
```

Connection settings come from the environment and default to those compose services. A process running outside the repository has no `.env` to fall back on and must be given them explicitly — `POSTGRES_DATABASE_URL` in particular, since the development default is derived from `POSTGRES_HOST_PORT` in the repo-root `.env`.

Either host reports a failed start and exits non-zero rather than binding the port, and shuts down on SIGINT/SIGTERM by closing the server first, then stopping its resources in reverse start order. Once serving, `GET /health` reports each resource's health, answering 503 if any is unhealthy.

## Build

```bash
pnpm build
pnpm start      # embedded host: node ./dist/hosts/embedded.js
pnpm start:api  # API host:      node ./dist/hosts/api.js
```

`build` clears `dist/` and compiles with `tsconfig.build.json`, which emits `src/` only. The base `tsconfig.json` covers `src/` and `tests/` and is what `typecheck` uses, so test files are type-checked without reaching the build output.

## Bundle and image

```bash
pnpm bundle     # bundle/api.mjs and bundle/embedded.mjs, each with a source map and esbuild metafile
```

`bundle` reads `dist/`, so build first — from the repo root, `pnpm bundle` runs both in order through turbo. [`bundle.config.mjs`](bundle.config.mjs) lists this app's hosts, what each keeps external, and what each must not contain: the API host fails the bundle if Worker, the limiter, SQLite, or the embedded profile ends up inside it. The mechanics are shared across apps in [`scripts/bundle.mjs`](../../scripts/bundle.mjs).

[`api.Dockerfile`](api.Dockerfile) packages the API host bundle as an image, built and run as part of a deployment — see [`deploy/`](../../deploy). The embedded host has no image yet.

## Other commands

```bash
pnpm typecheck
pnpm test              # tests/**/*.test.ts, excluding integration
pnpm test:integration  # tests/**/*.integration.test.ts, against a real database
pnpm lint
pnpm clean:dist
pnpm clean:node-modules
```

Tests mirror `src/`: `tests/http/` covers the routes, `tests/profiles/` covers what the API host composes — the resolved host plan, which subscriptions it binds, resource start/stop ordering, and that the profile builds without reaching a backend.

## API reference

See [`docs/api-reference.md`](../../docs/api-reference.md) for the full endpoint list.
