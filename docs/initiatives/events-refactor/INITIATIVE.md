# Events Package Refactor

**Status: Complete — merged (#347, #348, #349).**

## Summary

Refactor `packages/events` — originally scoped narrowly around `EmitterFactory`'s boilerplate (self-documented in its own doc comment as "currently in between being refactored"), now aimed at a new event-emission core: a single generic `emit()` function, context (scope/trace/span) handled via propagation rather than per-domain construction, and a span-per-entity-identity model — replacing the current per-domain-class architecture rather than incrementally DRYing it up.

Delivered as a first working slice, deliberately not a full-package rewrite: the new core (Change C1), proven out in one real domain (`step` emission in the engine, Change C2), plus real ESLint/typecheck coverage and a maintenance pass (Change C3). The hand-rolled Zod event/data schemas (`*.event.schema.ts`/`*.data.schema.ts`) were deliberately left untouched — see `Not yet scoped` below, now resolved to `json-schema-migration`'s territory rather than staying an open question here.

Full research/discussion behind everything below: [`research/history-and-current-shape.md`](./research/history-and-current-shape.md).

## Evolution

Originally scoped as possibly folding into `json-schema-migration`'s "hand-rolled Zod schemas" problem, since both live in `packages/events`. Split into its own initiative instead once it became clear the `EmitterFactory` boilerplate (the primary thing motivating picking this up now) and the schema-format question (Zod vs. JSON Schema) are genuinely different units of work, not one problem — that's separate, though, from whether they belong in one initiative or two. A initiative can hold more than one unit of work; whether this stays split from `json-schema-migration` or the two get combined is a real, still-open question of size and pacing, not a closed decision — the door stays open to combining them at the initiative level even though the underlying work is being kept cleanly separable either way.

Started with a long discussion-first research pass across the whole of `packages/events` (and the parts of `packages/types` it depends on) before any Change was planned — covering the type-level DX-driven design origin, the Cloud Events + OpenTelemetry/W3C Trace Context envelope history, the confirmed-dead-but-fully-wired span-nesting capability, `EmitterFactory`/`BaseEmitter`/the ten domain emitter classes, and the registries/parsers — written up in [`research/history-and-current-shape.md`](./research/history-and-current-shape.md). That surfaced an initial natural split: three mechanical, low-risk cleanup targets that don't depend on resolving the harder open design question (the nested-span strategy, at that point still genuinely unresolved), plus two items deliberately left unscoped.

**That initial split was then superseded before Change C1 even started building.** Discussing Change C1's implementation directly (rather than just outlining it) surfaced that the three cleanup targets were symptoms of one architecture, not three separate problems, and that a genuinely new core (single `emit()`, context propagation instead of per-domain construction) dissolves what the other two Changes would have fixed rather than requiring them as separate steps. That same discussion also produced a real answer to the previously-unresolved nested-span question — a span keyed to each entity's identity, parent found by reference rather than a stack or coordinator — which is now part of Change C1's scope instead of a deferred open question. Change C1 was rescoped in place (arc file replaced, not amended) to reflect this rather than kept as a stale plan next to a changed discussion.

## Change index

| Change | Description                               | Status           | Where | See also |
| ------ | ----------------------------------------- | ---------------- | ----- | -------- |
| C1     | Event-emission core: single `emit()`      | merged (PR #347) | [1]   | [4]      |
| C2     | Engine `step` emission onto new core      | merged (PR #348) | [2]   | [1]      |
| C3     | `packages/events` ESLint config + rebuild | merged (PR #349) | [3]   |          |

## Not yet scoped

- **`event-schema.registry.ts`/`category.registry.ts`/`event-types.ts`'s hand-maintained schema/type wiring — deferred to `json-schema-migration`, not this initiative.** Real overlap with that initiative (this is exactly the hand-rolled-Zod-schemas problem it names), and its own `INITIATIVE.md` already scopes moving `packages/events`' schemas to JSON Schema directly. No longer an open "which initiative" question.
- **Broader adoption beyond the `step` proof** (`worker`, `router`, `limiter`, etc.) — deliberately not committed as ordered initiative Changes yet. A real open strategic question: migrate these as their own dedicated pass, or defer most of it to each subsystem's own future refactor (a broader refactor of `packages/*` beyond just `events` is a real, separately-intended future direction), since migrating a call site now that gets rewritten again during that system's own refactor could just be redone work. Leaning toward deferring, not settled.
- **A principled, consistent answer for what belongs in the envelope header vs. `data`.** Not applied consistently today (see research doc) — sometimes deliberately duplicated as an experiment, sometimes header-only, sometimes `data`-only; `LimiterScope` keeping its ids in `data` is one concrete instance. A real future goal to derive an actual rule and align existing events to it. Not scoped or started.
- **Error propagation across the whole event-bus-adjacent backend — bigger than this initiative, not just `packages/events`.** Surfaced directly from `buildEvent()`'s current behavior (throws on schema-validation failure, which can halt whatever handler called it) — but the real question is broader: should a failure like this instead emit an event and/or return a Result-shaped value (mirroring the existing, deliberate `{ok,value}`/`{ok,error}` envelope convention already used on API responses) so callers across `engine`/`worker`/`router`/`limiter` can react without crashing? Explicitly named as needing its own research and design pass, not a `buildEvent()` tweak — touches `engine-hardening`'s territory too (currently scoped to `packages/engine` specifically, per its own `INITIATIVE.md`, not this broader cross-cutting question). Not scoped or started; may end up as its own future initiative rather than fitting inside an existing one.

Scaffolded now, not yet scoped in full detail.

[1]: ./arcs/event-emission-core.md
[2]: ./arcs/step-emission-in-engine.md
[3]: ./arcs/events-lint-and-rebuild.md
[4]: ./research/history-and-current-shape.md
