# Deployment Artifacts from Static Entrypoints: Spike Result

Status: spike result, measured rather than reasoned

Date: 2026-09-15

Re-run later the same day against Change C27's real entry points, which measured
the api-server artifact this spike could not build. See
[Re-run against real entry points](#re-run-against-real-entry-points).

The question: can one application package emit several independently deployable
artifacts, one per static entry point, narrowly enough that separate application
packages are not needed to keep a deployment's dependencies honest.

The proposition being tested was that **source organization and deployment
artifacts are different concerns**. Packages organize and protect source
ownership. Profiles define process composition. Static entry points define
deployment variants. A bundler turns each variant into an artifact.

Everything below was built and executed. All spike artifacts were thrown away;
nothing here is checked in.

## Result

**Both artifacts run standalone outside the monorepo, and the Worker host needs
no `node_modules` at all.**

|                        | worker-host                                                  | embedded-server                                    |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| Bundle                 | 8.7 MB, 1471 inputs                                          | 14.7 MB, 1886 inputs                               |
| Externals shipped      | none                                                         | `better-sqlite3` (27 MB)                           |
| SQLite files in bundle | 0                                                            | 7                                                  |
| Outcome                | started, consumed `worker.job-command.v1`, SIGTERM to exit 0 | `{ ok: true }`, engine and limiter up, HTTP served |

The Worker host ran from a directory containing exactly two files — the bundle
and a `package.json` holding `{"type":"module"}` — with no workspace symlinks
and no repository `node_modules`. It connected to Postgres, MinIO, and Redis,
bound its consumer group, and shut down cleanly.

**The install closure was not narrowed. It was eliminated.** Worker host's
production closure previously reached `@prisma/adapter-better-sqlite3` and native
`better-sqlite3` through `@lcase/db-prisma`'s manifest. In the artifact that edge
does not exist, because the manifest does not exist.

## Method

esbuild 0.28.2, Node v24.13.0, macOS. Each deployment built by its own
invocation, so no chunks are shared between independently deployed processes.

Bundles were built from `apps/*/dist/main.js` — the existing `tsc` output —
rather than from TypeScript source, so type checking stays exactly where it is
and the bundler only resolves and shakes.

```
--bundle --platform=node --format=esm --target=node20 --metafile
--banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"
```

Each artifact was copied to a bare directory, given a minimal `package.json`,
and run against live Postgres, MinIO, and Redis from `docker-compose.yml`.

**The prospective api-server entry point was not built.** Its profile does not
exist yet — that is Change C27 — so the third artifact remains unmeasured. The
embedded server stands in as the contrasting case, and contrasts more sharply
than the api-server would have.

## What made it work

**Prisma 7's driver-adapter mode ships its query compiler as base64 WASM inside
a `.mjs` module** — `query_compiler_fast_bg.postgresql.wasm-base64.mjs`. There
is no engine binary to locate, copy, or externalize. This was the single
likeliest thing to sink the exercise, and it is a non-issue on the Postgres path.

**The import graph was already clean, and it held under measurement.**
`@lcase/db-prisma`'s root barrel exports types only, so the 29 root-specifier
imports erase at compile time. Concrete clients come from the `/sqlite` and
`/postgres` subpaths, and `@lcase/adapters` publishes twelve subpaths with no
root barrel. Nothing had to be restructured for the Worker host bundle to
exclude SQLite entirely.

## The static entry point case, proved by contrast

The embedded server carries **both** generated SQL clients and both driver
adapters. The Worker host carries one. The difference is not the bundler and not
the package layout — it is that the Worker host's profile statically imports the
Postgres client while the embedded profile selects between backends from a
runtime config union, which leaves both reachable.

That is the mechanism the whole proposition rests on, observed rather than
argued: **what a profile statically imports is what the artifact contains.** An
api-server entry point selecting Postgres would shed the SQLite half exactly as
the Worker host did.

## What has to change

Four obstacles were hit. Only the first is a defect.

**1. `packages/db-prisma/src/repo-env.ts` couples the package to the workspace at
import time.** `export const repoRoot = findRepoRoot()` is a top-level side
effect that walks up for `pnpm-workspace.yaml` and throws when it is absent.
`@lcase/db-prisma/postgres` re-exports `defaultPostgresUrl`, which imports it, so
importing the Postgres client triggers the walk even though the Worker host never
calls the function. **This breaks any deployment outside the workspace, bundled
or not** — it is not a bundling problem, and it is not specific to this
proposition. `sqlite-url.ts` additionally uses `repoRoot` to build the database
path, so the SQLite default URL is inherently workspace-relative.

Both spike artifacts were patched past this. Making the lookup lazy, so that a
deployment supplying its own URL never performs it, is the fix.

It also means `"sideEffects": false` would be false for this package. That
declaration was recommended before the spike and should not be applied blindly.

**2. A `createRequire` banner is required.** `@aws-sdk/client-s3` ships CJS that
`require()`s node builtins; bundled to ESM, esbuild's shim throws `Dynamic
require of "node:https" is not supported`. The banner above resolves it.

**3. `better-sqlite3` must remain external.** Its loader uses `__filename` to
locate the native `.node` binding, which is absent in an ESM bundle. Marking it
external and installing it beside the artifact works. This affects only
SQLite-bearing artifacts; the Worker host needs no externals.

**4. `JsonlEventLog` calls `mkdirSync` non-recursively**, so it fails when
`lcase-db/` does not already exist. Pre-existing and minor, but it is reached
before anything else in the embedded profile.

## Where the plan's predictions were wrong

**That a bundler cannot narrow the installed closure.** Stated repeatedly while
scoping this, and wrong in the way that matters. It is true that tree shaking
cannot reach a package manifest — but deploying the bundle removes the manifest
from the deployment entirely. The Worker host artifact has no dependencies
because it has no `package.json` describing any.

**That bundle content and install closure must be reported separately.** The
distinction is real and the plan was right to insist on it, but the conclusion
inverts: the closure question is answered by choosing the bundle as the unit of
deployment, not by auditing manifests. Reporting them separately still matters
for artifacts with externals, which is why the table above lists both.

**That Prisma's generated assets would need copying or externalizing.** They did
not, on the Postgres path, for the reason given above.

**That barrel exports might pull both database implementations into an
artifact.** They did not. The type-only root barrel held exactly as designed.

**That the escape hatches would likely be needed.** Splitting `@lcase/db-prisma`
by provider and giving `@lcase/adapters/artifact-store` per-backend subpaths were
both named as the probable outcome if bundling fell short. Bundling did not fall
short. Those splits are now only relevant if a **package** rather than a bundle
is ever the unit of deployment — which is a real possibility worth keeping, not a
scheduled task. `./artifact-store` still re-exports both `FsArtifactStore` and
`S3ArtifactStore` from one barrel, and that remains the one place in that package
where a subpath does not correspond to a single backend.

## Verdict

**The decision rule's first branch is met.** The artifacts run outside the
workspace and the externals manifests are genuinely narrow — empty, in the case
that mattered most. Keep fewer application packages, and let static entry points
plus per-entry-point builds define the deployment variants.

Two conditions on that verdict.

**The `repo-env.ts` fix is a prerequisite, not a follow-up.** Nothing deploys
outside the workspace until the top-level lookup is lazy, and that is true of the
current `tsc` output as much as of any bundle.

**Enforcement still has to be built.** Under separate application packages a
boundary violation is a resolution failure at install time. Under static entry
points nothing prevents an api-server entry point from importing Engine; the
violation is visible only in bundle metadata. The expectations below should
become an assertion that fails CI, expressed against the metafile each build
already emits. Without it the boundary is verified once and unverified
thereafter.

| Artifact        | Must not contain                                | Measured       |
| --------------- | ----------------------------------------------- | -------------- |
| worker-host     | SQLite, embedded HTTP and profile code          | 0 SQLite files |
| embedded-server | remote Worker-host code                         | —              |
| api-server      | Worker implementation, SQLite, embedded profile | not yet built  |

## Observations outside the question

The embedded server printed `Server listening on 127.0.0.1:3999` while its start
outcome was `{ ok: false, failedResourceId: 'sql' }`.
`apps/http-server/src/build-server.ts` logs the outcome and proceeds regardless,
which is known and deliberate, but the spike made the consequence concrete: the
process serves HTTP with a dead database and reports nothing beyond one log line.
Worth revisiting whenever readiness is designed for real, which Change C28
already owes.

## What this spike does not prove

That the api-server artifact is narrow — it was not built, because its profile
does not exist until C27.

That an entry point boundary holds over time. The measurement is of one moment;
any claim beyond it rests on the CI assertion described above.

That job execution works from a bundle. The Worker host started, connected, and
bound its subscription. Nothing was submitted to it, so the artifact is proven to
compose and start, not to execute work.

Anything about other platforms or Node versions. One machine, one Node, one
bundler.

## Re-run against real entry points

After Change C27, `apps/http-server` has two hosts under `src/hosts/` and the
api-server profile exists. All three artifacts were rebuilt with the same flags,
using esbuild 0.27.2 from the workspace rather than 0.28.2, and again thrown away.

**The proposition was only inferred the first time.** The original run bundled
entry points from two _different_ packages, `apps/worker-host` and
`apps/http-server`. The claim under test was that one package can emit several
narrow artifacts. With two hosts in one package over one shared HTTP layer, that
is now observed:

|                        | api host       | embedded         | worker-host   |
| ---------------------- | -------------- | ---------------- | ------------- |
| Size / inputs          | 10.1 MB / 1847 | 14.7 MB / 1886   | 8.7 MB / 1471 |
| SQLite inputs          | 0              | 11               | 0             |
| `profile-local-system` | 0              | 14               | 0             |
| Worker implementation  | 0              | 17               | 17            |
| Limiter                | 0              | 4                | 0             |
| Engine / Observability | 57 / 7         | 57 / 7           | 0 / 0         |
| Externals              | none           | `better-sqlite3` | none          |

Embedded and worker-host reproduced the original sizes exactly. The api host
fills in the enforcement table's missing row, and every entry it names as
forbidden is absent. The limiter's absence is a composition decision C27 made,
showing up as bytes.

**Both prerequisites held without patching.** The `repo-env.ts` and
`JsonlEventLog` fixes landed in Change C26, and this run needed neither patch the
original applied by hand.

**The first standalone run failed, on configuration.** From a directory holding
only the bundle and `{"type":"module"}`, with no `node_modules`, the api host
connected to a Postgres on port 5432 and failed authentication. Outside the
workspace `loadRepoEnv()` finds no `.env` and returns silently, and
`POSTGRES_HOST_PORT=5434` exists only in the repository's `.env`. So the default
URL pointed at a different server. The fix held as designed: it degraded to a
wrong default instead of throwing, which is what let the process get far enough
to report a real error. Supplying `POSTGRES_DATABASE_URL` explicitly, as a
deployment would, produced `{ ok: true }`, a 200 from `/api/flows`, `api-host`
registered as the consumer on both of its groups, and a clean exit on SIGTERM.

That failed run also reproduced the observation above: the process logged
`{ ok: false, failedResourceId: 'sql' }` and then served every request with a 500. C27 fixed this, and a failed start now exits non-zero without binding a
port.

**Where the bytes are.** Attributing each input's post-shaking `bytesInOutput` to
its owning package:

- Workspace code is 344 KB of the api host's 10.09 MB, 452 KB of embedded, and
  194 KB of worker-host. Third-party code is over 95% of every artifact.
- `@prisma/client` alone is 4.94 MB, 49% of the api host. That is the base64
  query compiler, unavoidable on the driver-adapter path, and it is also why a
  Worker that no longer writes artifact metadata to SQL would roughly halve its
  artifact.
- Tree shaking works within workspace packages, not only between them.
  `@lcase/events` contributes 74 KB to the api host and 49 KB to worker-host, and
  `@lcase/adapters` 43 KB and 11 KB. The adapters subpath layout is what makes
  the second possible.
- `@lcase/db-prisma` doubles in the embedded artifact, 138 KB against 69 KB,
  because its config union leaves both generated clients reachable.
- `redis` brings `@redis/time-series`, `@redis/search` and `@redis/bloom`, about
  280 KB, though only streams are used. Its client entry point defeats shaking.
- `light-my-request` and `semver`, about 125 KB together, are unconditional
  imports of Fastify itself: the implementation of `inject()`, and plugin
  version-range checks.

**Bundling from source reaches only as far as the app.** Pointed at
`src/hosts/api.ts` instead of `dist`, esbuild compiled the app's own 36 files
straight from TypeScript and produced the same artifact. Every workspace package
still came from `dist`, 987 inputs in all, because each resolves through its
`exports` map. With one package's `dist` hidden, the build failed on
`Could not resolve "@lcase/engine"`, quoting `"import": "./dist/index.js"`. esbuild
does not fall back to source. Skipping the package builds would need a source
export condition on every package. `typecheck` would also still need `dist/*.d.ts`
to resolve types across packages, so the two would resolve the same graph
differently.

**Still not proven.** That job execution works from a bundle: the two-process run
that completed a flow ran from source, and running the pair from its artifacts is
Change C29's proof. And that the boundary holds over time, since the CI assertion
does not exist yet; Change C28 builds it.
