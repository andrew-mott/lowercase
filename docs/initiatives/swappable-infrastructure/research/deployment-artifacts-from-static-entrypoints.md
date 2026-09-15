# Deployment Artifacts from Static Entrypoints: Spike Result

Status: spike result, measured rather than reasoned

Date: 2026-09-15

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
