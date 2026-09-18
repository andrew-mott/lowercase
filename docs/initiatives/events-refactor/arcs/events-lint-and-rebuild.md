# Events Package Refactor Initiative — Arc: Lint Config + Clean/Rebuild Pass (Change C3)

**Previous:** [`step-emission-in-engine.md`](./step-emission-in-engine.md) (Change C2)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable.

## Change C3 - Give `packages/events` a real ESLint config, then clean/rebuild/fix - merged (PR #349)

### Discussion

_Starting point, carried over from `INITIATIVE.md`'s `Next up`:_

- Today `packages/events` uses the `echo lint` stub every `packages/*` package uses — real ESLint currently only exists in `apps/workbench` (per `CLAUDE.md`). Give this package a real, working ESLint config and command.
- Alongside it, add clean commands for `node_modules`/`dist`, then actually run the sequence — clean, reinstall, rebuild, run the new lint for real, fix whatever it surfaces — as a maintenance pass while this package is already being touched, not a separate cleanup detour.
- **Opportunistic, per package, not a monorepo-wide sweep**: the intent is to give each package this same treatment as work naturally touches it going forward, not to schedule the rest of `packages/*` now.

### The `tests/` typecheck blind spot, found before any ESLint work started

Raised mid-discussion, not part of the original scope: every package's `tsconfig.json` has `"include": ["src"]` only, so `pnpm typecheck` (`tsc --noEmit`) never actually type-checks anything under `tests/`, repo-wide. Vitest doesn't backstop this either (it transpiles `.test.ts` via esbuild, which strips types without checking them).

Turned out to already be a known, tracked, _solved_ problem (`docs/todo.md`) — not a new discovery. A working fix already landed in `packages/artifacts`/`packages/adapters`: a sibling `tsconfig.typecheck.json` per package (`extends: "./tsconfig.json"`, `rootDir: "."`, `include: ["src", "tests"]`, `noEmit: true`), with `package.json`'s `typecheck` script pointed at it via `-p`. The base `tsconfig.json`/`pnpm build` stay untouched. Deliberately incremental rollout, adopted as packages get touched for other reasons — `packages/events` being mid-Change-3 was exactly that trigger, so applied here too rather than deferred.

Turning it on caught one real, previously-invisible bug: `tests/parser.test.ts` imported `AnyEvent` via `import { AnyEvent } from "../../types/src"` — a relative path reaching straight into `@lcase/types`' `src/` directory, bypassing the package boundary entirely (worse than the plain missing-`.js`-extension failures this same fix caught in `artifacts`/`adapters`). Fixed to match every other import site in the package: `import type { AnyEvent } from "@lcase/types"`.

Verified: `pnpm typecheck`/`pnpm vitest run` clean in `packages/events`, `pnpm -w typecheck` clean across all 26 packages.

### What actually landed

**ESLint config** (`packages/events/eslint.config.js`, new): the shared baseline already established by `packages/types`/`packages/ports` — `js.configs.recommended` + `tseslint.configs.recommended`, `@typescript-eslint/consistent-type-imports: "error"` — minus their `no-restricted-syntax` types-only-package restriction, which doesn't apply here since `events` has real runtime code (`emit()`, `buildEvent()`, the registries), unlike those two pure-types packages. One addition beyond that shared baseline: `@typescript-eslint/no-unused-vars` configured with `varsIgnorePattern`/`argsIgnorePattern: "^_"`, to recognize this package's existing underscore-prefixed "intentionally unused" convention — e.g. `category.registry.ts`'s `const _checkSubmittedTypes: _ListsAllSubmittedTypes = true`, a compile-time exhaustiveness check that only type-checks if a const array truly lists every member of a union. Real, load-bearing type-level code, not dead code — confirmed by reading the pattern directly before configuring around it, not assumed.

`package.json`: `"lint": "echo lint"` → `"eslint ."`; added `clean-dist`/`clean-node-modules` scripts (`rm -rf ./dist` / `rm -rf ./node_modules`), matching the already-established `turbo.json` `clean-dist`/`clean-node-modules` tasks (already adopted by 10 other packages, not a one-off precedent); added matching `devDependencies` (`@eslint/js`, `eslint`, `typescript-eslint`, versions matched to `packages/ports`).

**Sequence actually run**: `clean-dist` + `clean-node-modules` → workspace-root `pnpm install` → `pnpm build` → `pnpm lint`, exactly the order proposed (install before lint, since the sequence's main point was to get real, un-stale signal, and clean/rebuild is lower-stakes hygiene compared to what lint would surface) — 78 real lint errors surfaced on the first real run.

**Triage, fixed in order**:

1. **Config-level, not code** (~15 errors) — the underscore-prefix `no-unused-vars` exception above; no file touched.
2. **Mechanical, `--fix`-safe** (51 errors) — 45 `consistent-type-imports`, plus 6 `no-useless-escape` (two regexes in `emitter.test.ts` with unnecessary `\-` escapes — not actually auto-fixed by this ESLint version despite being flagged fixable, so hand-fixed).
3. **Genuine dead code, deleted** (8 symbols): `RunDescriptorSchema` (`run.data.schema.ts` — its own comment already said _"removed descriptor for now to reduce duplication of data"_, i.e. already self-marked superseded), `JobDescriptorDataSchema`/`PipeDataSchema` (`job.data.schema.ts`, same unused-descriptor shape, never exported) plus their now-orphaned type imports (`JobDescriptor`, `PipeData`), and unused imports `ZodSchema` (`event-schema.registry.ts`), `EventType`/`JobResumedParsed`/`JobSubmittedParsed`/`z` (`job.parser.ts`), `StepEmitter` (`emitter.test.ts`), and a pointless unused `const e = expect(...).toThrow()` assignment in `parser.test.ts`.
4. **One real `any`** — `step-emitter.test.ts`'s `testId as any` → `testId as ReturnType<typeof crypto.randomUUID>`. Fixed alongside it, spotted while in the file rather than caught by lint: `import { afterEach } from "node:test"` instead of `"vitest"` — the exact bug Change C1's plan notes had already flagged as existing in this file and deliberately not copied into new tests, apparently never fixed here until now.
5. **A real bug, held back for explicit review before touching**: `EventParser`'s constructor accepted a `registry: EventSchemaRegistry` parameter but never stored it — `parse()` read the module-level `eventSchemaRegistry` singleton directly instead, silently discarding whatever was passed in. Inconsistent with its sibling `JobParser` in the same file's package, which does this correctly (`constructor(private readonly eventRegistry...)`, `this.eventRegistry` at use time). Checked blast radius before fixing: `EventParserPort` isn't wired into `runtime.ts` or any app anywhere, and the only two real call sites (`parser.test.ts`) both happen to pass the exact same singleton the class already hardcoded — so the bug was inert, not live, today. Fixed anyway to be correct by construction (`private readonly registry`, `this.registry` at use time) rather than left as a latent trap for whenever real injection is needed.

**Verified after every stage**: `pnpm lint`/`pnpm typecheck`/`pnpm vitest run` clean in `packages/events` (23/23 tests), `pnpm -w typecheck` clean across all 26 packages, `pnpm -w build` clean workspace-wide.
