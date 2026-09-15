# Prove Swappable Infrastructure Initiative — Arc: Package Tooling (Changes C10 and C26)

**Related:** [`queue-adapter.md`](./queue-adapter.md) (Changes C4–C5, C7–C9, C11–C14)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Finishes the incremental real-ESLint and test-typechecking migrations package by package, and fills the remaining gaps in the `clean-*` script convention. Its own arc rather than a section of an adapter arc because none of this work swaps an infrastructure backend — it is the verification floor the rest of the initiative gets built on.

## Change C10 - Engine package tooling: real ESLint, test typecheck, `clean-*` scripts - merged (PR #369)

### Discussion

- **Split into its own arc, deliberately, after asking whether it belonged in `queue-adapter.md`.** It has zero messaging content, so filing it there would put genuinely unrelated material into the arc that already carries eight Changes. It also has known future members rather than being a one-off: `INITIATIVE.md`'s "Not yet scoped" section commits to finishing both migrations before this initiative is called done, and the remaining packages (`limiter`, `observability`, `replay`, `app-services`, `specs`, `cli`, `http-server`) are each a later increment of this same arc. One acknowledged wrinkle: Change C5 already landed "real ESLint for `adapters`" inside `queue-adapter.md`, so hygiene work now lives in two arcs. That is left alone rather than retro-moved — C5's other half (deleting `NodeRouter`/`QueuePort`) is core queue-adapter narrative, so it belongs there on its own merits.
- **Engine first, and ahead of the messaging Changes rather than after them.** Change C12 touches the engine heavily, and going into the largest Change of this initiative with the engine's tests actually typechecked is worth more than fixing the gate afterward. It is genuinely independent of Change C11 (which touches only the worker package), so it could equally sit between the two; first is the cheaper ordering because it is small and de-risks what follows.
- **Four items, each filling a gap in a convention that already exists elsewhere — not new infrastructure.** Verified by surveying every workspace package rather than assumed:
  - **Real ESLint.** The engine is one of five `packages/*` still on `"lint": "echo lint"`. Copies the Node-flavored config `packages/components/worker` established and that `adapters` (Change C5) and `runtime` (Change C9) each copied in turn — `js.configs.recommended` + `tseslint.configs.recommended` + `consistent-type-imports`, with `_`-prefixed unused vars ignored.
  - **Test typechecking.** The engine has no `tsconfig.typecheck.json` and its `typecheck` script is a bare `tsc --noEmit`, so its five test files are verified by nothing but vitest's transpile. Adds the same file the other five migrated packages use (`extends ./tsconfig.json`, `rootDir: "."`, `noEmit: true`, `include: ["src", "tests"]`) so the build config keeps `include: ["src"]` and tests never reach `dist`.
  - **`clean-dist` and `clean-node-modules`.** The engine is the only package under `packages/components/*` missing both. `turbo.json` already declares both tasks, so this is filling the last gap in an otherwise complete rollout, exactly as Change C5 did for `adapters`.
- **Expect real findings, not a config flip.** Both prior increments produced genuine fixes rather than clean passes: `adapters` surfaced 24 violations, two of which were real swallowed-error bugs, and `runtime` surfaced three `no-case-declarations` errors plus a test helper typed `ManagedResource<unknown>` against typed slots. Budget for the engine to behave the same way.
- **Scoped to the engine only.** The remaining `echo lint` packages stay in `INITIATIVE.md`'s "Not yet scoped" section rather than being swept here. One package per Change is the shape the two prior increments established, and it keeps each one reviewable as a set of real findings rather than a bulk config commit.

### What actually landed

Config exactly as planned: `eslint.config.js` copied verbatim from `packages/components/worker`, a `tsconfig.typecheck.json` matching the five migrated packages, and `package.json` gaining `eslint .`, `tsc --noEmit -p tsconfig.typecheck.json`, `clean-dist`, `clean-node-modules`, and the three devDependencies. The build config was not touched, so `build` still emits from `src` alone. The findings were the substance.

- **Typechecking the tests for the first time produced 26 errors, in four groups.** Eleven were imports missing `.js` extensions in `tests/fixtures/` — legal to vitest's resolver, rejected by `tsc` under `node16` module resolution, so those fixtures had never actually type-resolved. Two were real `satisfies` violations where effect-test scopes omitted a required `flowversionid`, meaning the fixtures had been asserting against an invalid `FlowScope`. Three were `vi.fn(async () => {})` bus-publish doubles: a zero-parameter mock is assignable to a two-parameter port method, so `publish.mock.calls[0]` typed as an empty tuple and destructuring `[type, event]` off it failed. They now read `vi.fn<EventBusPort["publish"]>(async () => {})`, tying the double to the port's own signature rather than to whatever the test happened to write.
- **Two dead test fixtures deleted rather than repaired.** `tests/fixtures/step-started.state.ts` imported `./flow-submitted.event`, a module that does not exist, and also failed `satisfies RunContext` on a missing `flowVersionId`. Checking usage before fixing showed nothing imports it, or its sibling `step-started.event.ts` — both were the only unreferenced fixtures in the directory. Repairing code no test runs would have been the wrong repair.
- **Linting produced 115 problems, 80 of them autofixable `consistent-type-imports`.** Of the remainder: an untracked, unreferenced `src/execution.context.temp.ts` (same category as the `.temp` scratch files Change C5 deleted); six planners importing `WriteContextToDiskFx` without using it, plus `JobCompletedMsg` in `job-finished.planner.ts`; an unused `writeFileSync` import and an unused `deps` parameter in `write-context-to-disk.effect.ts`; an unused `RunContext` import and three useless regex escapes in `resolve.ts` (`\_` in a character class, and `\[`/`\.` inside one); an intentionally empty `join` branch in `step-started.reducer.ts` that now carries a comment saying why it is empty rather than reading as an oversight; and assorted unused test bindings, including three vestigial `const newState = ...` lines in "makes no changes" tests that never asserted on it.
- **The lint pass found a real engine bug, which is the main reason this Change is worth more than a config commit.** `plan-join-edge.reducer.ts` used `===` where it meant `=` on both branches: `run.steps[edge.endStepId].status === "completed"` and `... === "failed"`. The adjacent `run.completedSteps`/`run.failedSteps` writes were real, so the run-level maps updated while the join step's own `status` never left `"planned"`. Blast radius was checked rather than assumed, and three live readers see the stale value: the reducer's own dependency loop (`step.status !== "completed"`), so a join depending on another join never resolves; `step-planned.planner.ts`'s `status === "completed" ? "success" : "failure"`, so a reused completed join emits `step.reused` with `failure`; and the `"planned"`/`"initialized"` gates in `step-started.planner.ts` and `step-finished.planner.ts`. It survived because `tests/reducers/utils/` held only a branch-edge test.
- **Fixed here rather than deferred, with the smallest test that proves it.** Suppressing the rule at the one place it earned its keep would have made the new gate lie, and Change C5 set the precedent of fixing the real bugs a lint pass turns up. Three cases in a new `plan-join-edge.reducer.test.ts` — all dependencies completed, dependencies finished but not all completed, and one still running — modelled on the existing branch-edge test's shape. Confirmed non-vacuous by restoring the `===` and watching the first two fail, matching how Change C9 verified its snapshot test. The engine's own tests are due a broader rework; this deliberately does not start one.
- **`clean-dist` immediately justified itself.** After `execution.context.temp.ts` was deleted, `dist/` still held `execution.context.temp.js`/`.d.ts`/`.map` — `tsc` does not prune outputs for removed sources, and the engine had no way to clear them. Running the new script and rebuilding produced a `dist` with no stale artifacts.
- **Verified**: engine lint clean, `typecheck` clean against `src` + `tests`, and its suite up from 34 files/83 tests to 35/86. Full workspace `build` 25/25, `typecheck` 24/24, `lint` 24/24, and `pnpm -r test` green in every package. Confirmed by search that no `dist` anywhere in the workspace contains a test file, so pointing `typecheck` at the wider config did not leak tests into build output.

## Change C26 - Portability pass: cross-platform cleans, build config inversion, two workspace couplings - in progress

### Discussion

- **One Change because these share a defect, not a category.** Each item assumes a Unix shell on a machine where this repository is checked out: `rm -rf` in every clean script, build output that is never pruned, a package that walks parent directories for `pnpm-workspace.yaml` at import time, and a `mkdirSync` that assumes its parent exists. None of them is a feature and none belongs on a Change with a process boundary to prove, which is what C27 has. Two of them were surfaced by the static-entrypoint bundling spike (`../research/deployment-artifacts-from-static-entrypoints.md`) while running built artifacts outside the workspace; neither is caused by bundling, and both fail identically from plain `tsc` output copied elsewhere.
- **Windows became a supported development environment, which is what forces the clean scripts.** All 34 `clean-dist`/`clean-node-modules` scripts were `rm -rf`. `fs.rmSync` has been built in since Node 14.14, so no dependency is needed, and its `maxRetries`/`retryDelay` options are most of what a dedicated removal package actually provides — they matter on Windows, where a held file handle surfaces as `EBUSY`/`EPERM` rather than as a missing file, and deep Electron trees are where that happens. Retries are on the `node_modules` script only; build output has no such contention.
- **A root `scripts/` folder rather than an inlined `node -e` per package.** The invoking package's directory is the working directory for a package-manager script, so neither script takes an argument — the path _to_ the script varies by nesting depth, the path _from_ it never does. Two depths cover the workspace (`../../` for seven packages, `../../../` for ten). A private workspace package exposing these as `bin` entries would give one uniform string instead of two, at the cost of a new workspace member and a devDependency in every consumer; two path variants is less machinery for the same result.
- **Renamed to `clean:dist` and `clean:node-modules`, which is the convention the repo already drifted to.** Colon-separated names are already in use for `test:integration`, `test:e2e`, `format:check`, `db:migrate`, `migrate:postgres`, `check:migrations` and `make:mac:unsigned`; the two clean scripts accounted for 34 of the 35 hyphenated instances. Turbo task names must match script names, so `turbo.json`'s two entries rename in lockstep — missing that would make the fan-out silently match nothing.
- **`build` chains the clean inside the script rather than through turbo `dependsOn`, and the difference was measured rather than assumed.** `clean:dist` is `cache: false`, so as a `dependsOn` entry it force-executes on every invocation: a second run logged `clean:dist: cache bypass, force executing` followed by `build: cache hit, replaying logs`, meaning `dist` was deleted and then restored from cache on a build that had nothing to do. Chaining inside the build script instead means turbo skips the script entirely on a cache hit — confirmed by `dist` holding the same inode across a cached run — so the deletion happens only when turbo actually rebuilds. A fully cached workspace build stays at about one second.
- **The residual gap is worth stating rather than implying it is closed.** A cached build does not clean. That covers the case this exists for, because deleting a source file changes the build hash and forces a rebuild, which cleans. What survives is switching to a branch whose build is already cached, where an orphan from the other branch can persist. Closing that would require `dependsOn` and its cost on every build.
- **The `tsconfig.typecheck.json` convention is inverted to `tsconfig.build.json`, for the failure direction more than the naming.** Today `tsconfig.json` is `include: ["src"]` and a sibling widens to `["src", "tests"]` for typechecking. Two consequences: an editor opening a test file finds no project covering it and falls back to an inferred one, losing `strict` from `tsconfig.base.json`; and a package that never gains the widening config verifies its tests with nothing, silently — currently ten packages and sixty-nine test files. Inverted, `tsconfig.json` covers `src` and `tests` so the editor is right by default, and `tsconfig.build.json` narrows for emit. The failure then reverses: forgetting the build config emits tests into `dist`, which is immediately visible, rather than leaving them unchecked, which is not. `typecheck` also collapses to a uniform bare `tsc --noEmit`. `packages/types` already carries a `tsconfig.build.json` that is byte-identical to its `tsconfig.json` — a half-finished inversion doing nothing today — so this settles which of two competing conventions the repo keeps.
- **The inversion is scoped to the ten packages whose tests are already typechecked, which is what keeps it mechanical.** Those tests are verified today, so restructuring the configs cannot surface a new error. The other ten stay on the existing one-package-per-Change backlog in `INITIATIVE.md`'s "Not yet scoped", because enabling verification for the first time is not a config flip: C10 turned up 26 type errors, two dead fixtures, 115 lint problems, and a real engine bug where `===` was written for `=`.
- **Real ESLint for `packages/db-prisma` and `apps/http-server` only, for the same reason.** Both are packages this Change or its successor edits directly — the `repo-env.ts` fix lands in one, and C27 builds in the other. The remaining twelve `echo lint` stubs stay on the backlog; a first real run on `packages/events` produced 78 problems, so twelve packages is a different Change, not a larger version of this one.
- **The two source fixes are small and independently justified.** `packages/db-prisma/src/repo-env.ts` computes `export const repoRoot = findRepoRoot()` at module load, and `@lcase/db-prisma/postgres` re-exports `defaultPostgresUrl` from a module that imports it, so importing the Postgres client alone performs the walk — in a process that supplies its own `DATABASE_URL` and never calls the function. Making it lazy is the fix. `sqlite-url.ts` additionally uses `repoRoot` to build the database path, which is a deeper coupling and arguably correct for a local default; it is left alone, and noted so the embedded profile's need for an explicit URL elsewhere is not mistaken for a bug. Separately, `JsonlEventLog` calls `mkdirSync` without `recursive`, so it throws `ENOENT` rather than creating the path.
- **Out of scope.** Widening test typechecking to the remaining ten packages and real lint for the remaining twelve, both per above. Building each artifact into a staging directory and swapping it into place on success, which would additionally make a failed build leave the previous output intact — a genuinely better shape, but it solves atomicity rather than staleness, it fits the bundler step where an artifact is already one self-contained directory, and the staging directory would have to be a sibling of `dist` for the replace to be atomic at all.

### Completion evidence

- Every `clean:dist` and `clean:node-modules` script runs on Windows and macOS without a new dependency, and the `node_modules` one retries rather than failing on a held handle.
- `turbo.json` task names match the renamed scripts, and `turbo run clean:dist` resolves in every package that declares it.
- A cached workspace build does not delete or restore `dist`, and a real rebuild removes output whose source no longer exists.
- `tsconfig.json` covers `src` and `tests` in the ten packages that already typecheck tests, `tsconfig.build.json` narrows emit to `src`, and no `dist` anywhere contains a test file.
- `packages/db-prisma` and `apps/http-server` have real ESLint configs and scripts, with whatever the first run surfaces fixed rather than suppressed.
- Importing `@lcase/db-prisma/postgres` performs no filesystem walk, and `JsonlEventLog` creates its directory path.
- Full workspace `format:check`, `build`, `typecheck`, `lint` and tests green.

### What actually landed

Wider than planned. The Discussion scoped the verification floor to the packages
that already had it and deferred the rest to later increments; measuring the cost
first reversed that. A probe that widened each remaining package's config and
counted errors without fixing anything showed sixteen type errors across eight
packages, four of them zero — bounded enough to finish rather than schedule. The
packages were then done one at a time, each verified on its own before moving on.

**Cross-platform clean scripts.** `scripts/clean-dist.mjs` and
`scripts/clean-node-modules.mjs` at the repository root, using `fs.rmSync` rather
than `rm -rf` so Windows works, and rather than a dependency because Node has had
this built in since 14.14. Neither takes an argument: a package manager runs a
script with that package's directory as the working directory, so the path _to_
the script varies by nesting depth while the path _from_ it never does. The
`node_modules` one retries, which is what makes it survive a held file handle on
Windows and is most of what a dedicated removal package would have provided.
Twenty-three packages reference them as `clean:dist` and `clean:node-modules`,
matching the colon convention already used by `test:integration`, `format:check`
and the rest; those two scripts had been thirty-four of the thirty-five
hyphenated names. `turbo.json`'s task names renamed in lockstep, since a task
name that does not match a script name silently matches nothing.

**`build` chains the clean, inside the script rather than through turbo.** As a
`dependsOn` entry it would run on every invocation, because it is `cache: false`
— measured: a second run logged `clean:dist: cache bypass, force executing`
followed by `build: cache hit, replaying logs`, deleting `dist` and restoring it
on a build with nothing to do. Chained inside the build script, turbo skips it
entirely on a cache hit, confirmed by `dist` keeping the same inode across a
cached run. A fully cached workspace build stays around one second. The residual
gap is stated rather than papered over: a cached build does not clean, which
covers the case this exists for (deleting a source changes the hash and forces a
rebuild) but not switching to a branch whose build is already cached.

**The build-config inversion, everywhere.** `tsconfig.typecheck.json` is gone
from the repository — zero remain — and twenty-two packages now carry a
`tsconfig.build.json` instead. `tsconfig.json` covers `src` and `tests` with
`noEmit`, so an editor opening a test file gets the project's real options rather
than falling back to an inferred one, and `tsconfig.build.json` narrows to `src`
for emit. `typecheck` collapsed to a uniform bare `tsc --noEmit` in every
package. The failure direction is the point: forgetting the build config emits
tests into `dist` where it is visible immediately, rather than leaving them
unchecked where it is not. `packages/types` went the other way and lost its
`tsconfig.build.json`, which was byte-identical to its `tsconfig.json` and
excluded nothing; the pair is worth having only where the two files differ.

**Verified non-vacuously** rather than by reading config: a type error planted in
a `tests/` file was caught and the file went clean when it was removed. No `dist`
anywhere contains a test file.

**Twelve packages gained real ESLint** — `apps/cli`, `apps/http-server`,
`app-services`, `db-prisma`, `limiter`, `observability`, `flow-analysis`,
`json-ref-binder`, `replay`, `specs`, `run-flow`, `run-history` — each copying
the config `packages/components/worker` established. Two deviations from that
template. `db-prisma` ignores `src/generated`, which is gitignored Prisma codegen
that happened to pass and would otherwise start failing on a codegen change, in
code nobody here can edit. And `coverage` joined the ignore list in the template
itself, so packages copying it inherit the fix; `engine` was linting its own
generated coverage output silently, and only surfaced when a newer istanbul began
emitting a disable directive.

**Two workspace couplings fixed.** `packages/db-prisma/src/repo-env.ts` no longer
walks for `pnpm-workspace.yaml` at import time. The first attempt only deferred
the walk, which was not enough: `defaultPostgresUrl` calls `loadRepoEnv`, and a
host whose configuration omits a URL calls that, so the failure merely moved from
import to call. The actual defect was that loading an optional `.env` failed hard
without a checkout, so the lookup now returns undefined, `repoRoot()` throws only
for callers that genuinely need a path, and `loadRepoEnv()` is best effort. A
deployed process got its configuration from the real environment before that ran.
Separately, `JsonlEventLog` creates its directory path recursively. Both would
fail identically from plain `tsc` output copied out of the workspace; neither was
caused by bundling.

**State afterwards.** Every live package has real ESLint and has its tests
typechecked. Twenty-six of twenty-nine packages lint for real; the three that do
not are `apps/desktop`, which has no `lint` script at all, and the two archived
packages, all unmaintained. There are no test-typechecking gaps left.
`apps/workbench` was carried on the gap list for a while and should not have
been: its `tsconfig.app.json` already includes `tests` and is reached through the
root config's `references`, which a survey reading only the root config missed.
Its coverage was confirmed the same way as everywhere else, by planting an error
and watching `tsc -b` catch it.

**What the findings were worth, briefly.** Not catalogued here, because the
individual fixes were small and the pattern matters more than the list. Almost
every package had at least one dead import, unused fixture, or vestigial local,
invisible while `lint` was `echo lint`. Three separate packages had test fixtures
omitting a `flowversionid` that `RunScope` and `FlowScope` require — the same
defect Change C10 found in the engine, meaning `satisfies` had been asserting
nothing in those files. Two packages had test doubles explicitly typed as a port
that the port had since outgrown. None of it was dramatic, and none of it was
reachable before.

**Out of scope, unchanged from the Discussion.** `apps/desktop` and the archived
packages, where gating unmaintained code is a different question. Staging-
directory build output, which buys atomicity rather than freedom from staleness
and belongs with the bundler step.
