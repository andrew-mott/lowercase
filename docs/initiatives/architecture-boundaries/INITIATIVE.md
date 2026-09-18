# Architecture Boundaries

**Status: Complete — Changes #341–#346 merged to `dev`.**

## Summary

Settles the package-tier taxonomy (types, ports, specs, functional core, Operations, application services, components, adapters) and the worker/tool extensibility model together, since they're related boundary questions, not separate ones — correcting, not just executing, the taxonomy already sketched in `docs/todo.md`. Full reasoning, evidence, and open questions live in [`research/package-tier-taxonomy.md`](./research/package-tier-taxonomy.md), [`research/control-plane.md`](./research/control-plane.md), and [`research/worker-tool-extensibility.md`](./research/worker-tool-extensibility.md) — this doc stays overview-level.

The taxonomy itself is settled: eight tiers, each with a real membership test and evidence from the actual codebase, not just asserted. What's left is a light, deliberately-scoped organizational pass (physical package moves, two renames, confirmed-dead cleanup) to prove the shape actually holds before it gets written down as a formal decision record. Not a version-bump initiative — dev-only reorganization and documentation, no user-facing change.

## Evolution

Originally scoped as decision-first, ADR-only — no execution pass across the repo. That held for the research phase itself, but once the taxonomy was actually settled, writing ADRs straight off discussion started to feel premature: this initiative's own sibling, `ui-workspace`, already proved (`research/state-management.md`'s "Sequencing" section) that discussion alone repeatedly misses things only real code surfaces. Pivoted to: prove the shape with a light, low-risk organizational pass first (moves, renames, dead-code deletion — not the deeper refactors this taxonomy also identified, like the `artifacts` `format`/`contentType` merge), then write however many ADRs the settled shape actually needs. `worker-tool-extensibility` was always part of this initiative's stated scope, just not started yet.

## Change index

| Change | Description                                     | Status           | Where | See also   |
| ------ | ----------------------------------------------- | ---------------- | ----- | ---------- |
| C1     | Package-tier taxonomy + control-plane research  | merged (PR #341) | [1]   | [7], [8]   |
| C2     | Physical moves: functional-core/_, components/_ | merged (PR #342) | [2]   |            |
| C3     | Renames + dead-code cleanup                     | merged (PR #343) | [3]   |            |
| C4     | Worker/tool extensibility research              | merged (PR #344) | [4]   | [9]        |
| C5     | ADR(s) reflecting the settled, now-real shape   | merged (PR #345) | [5]   | [10], [11] |
| C6     | Package-boundaries README                       | merged (PR #346) | [6]   | [12]       |

## Next up

This initiative is complete — all six Changes merged. Real, already-identified follow-on work is deliberately not carried forward as scheduled next steps; see "Not yet scoped" below, and `worker-tools-artifacts`/other future initiatives for where some of it may land.

## Not yet scoped

- The `packages/artifacts` `format`/`contentType` merge and `ArtifactIndex` rename — real refactors, not organization; deliberately excluded from this initiative's execution pass, likely belongs to `worker-tools-artifacts` instead (see `research/package-tier-taxonomy.md`'s `artifacts` entry).
- The control-plane's actual event-driven implementation (start/quiesce/resume vocabulary, sink-registration redesign) — `research/control-plane.md` is explicitly a fragment, not a design ready to build.
- **`packages/use-cases/run-flow`'s internal decomposition — surfaced while checking whether Change C2's move list was complete, not previously tracked outside the research doc.** `run-flow` mixes three different shapes under one roof: a pure function, a clean one-port Operation (`runFlow()` itself), and `create-fork-spec.ts`'s two-port `startForkedSim()`, which needs to split into single-port pieces before it actually qualifies as an Operation (see `research/package-tier-taxonomy.md`'s Operations section). This is exactly why `packages/use-cases/*` wasn't part of Change C2's clean moves — unlike `flow-analysis`/`engine`/etc., its contents don't map onto one destination tier, so real code splitting is needed first, not just relocation. Not scoped or started.
- **`packages/replay`'s actual tier is less settled than Change C1's research concluded — genuinely open, not just a packaging-consistency call.** `ReplayEngine` was originally filed as a clean adapter, but it isn't a passive single-port translator: `replayAllEvents()` actively republishes every stored event back onto the bus in a loop, and `emitReplayMode()` emits its own event — real, multi-step, bus-facing orchestration, needing three ports at once (`EventStorePort`, `EventBusPort`, `EmitterFactoryPort`). That's the same shape (multi-port, does real work, not a thin pass-through) that got `NodeRouter` classified as **components**, not adapter, in the very same research doc — so "cleanly an adapter" doesn't actually hold once the write/replay paths are weighed, not just the pure `getAllEvents()` read path. Genuinely undecided between: folding the pure read path into `packages/adapters` while the replay/emit behavior becomes something Operations- or application-service-shaped (closer to how it's actually consumed today — `ReplayService` wraps it, called from `apps/http-server`); or reconsidering it as its own small component. Confirmed, still true regardless of where this lands: `JsonlEventLog`, the actual filesystem/JSONL storage implementation, already lives correctly inside `packages/adapters/src/event-store/` and isn't part of this question at all — see `docs/todo.md` for the separate, bigger open question about its future storage shape.
- **A standalone worker/tool extensibility guide, previously planned here, is cut.** "Tools" dissolved as a concept in Change C4's conclusion (no registry, no third-party-authored thing to document) and the worker's own internal architecture isn't settled — it's a known future rebuild target (`packages/worker`'s internal complexity, per `CLAUDE.md`). A guide would either document something that barely exists or something about to change underneath it. Revisit if tools resurface as a real concept during that rebuild; until then, a dedicated worker/engine doc is a "maybe eventually," not scoped or planned.

[1]: ./arcs/taxonomy-and-control-plane.md
[2]: ./arcs/physical-moves.md
[3]: ./arcs/renames-and-cleanup.md
[4]: ./arcs/worker-tool-extensibility.md
[5]: ./arcs/adrs.md
[6]: ./arcs/package-boundaries-readme.md
[7]: ./research/package-tier-taxonomy.md
[8]: ./research/control-plane.md
[9]: ./research/worker-tool-extensibility.md
[10]: ../../adr/0005-package-tier-taxonomy.md "ADR-0005"
[11]: ../../adr/0006-worker-tool-extensibility-model.md "ADR-0006"
[12]: ../../architecture.md "docs/architecture.md"
