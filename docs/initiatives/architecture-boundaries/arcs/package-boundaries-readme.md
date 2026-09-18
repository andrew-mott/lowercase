# Architecture Boundaries Initiative — Arc: Package-Boundaries README (Change C6)

**Previous:** [`adrs.md`](./adrs.md) (Change C5)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable.

## Change C6 - Package-boundaries README - merged (PR #346)

### Discussion

- **Goal, restated directly rather than re-derived from `INITIATIVE.md`'s prior description: a plainly-stated, human-approachable map — "what's where," not the reasoning or governing principles.** Shouldn't shy away from _why_ where it genuinely helps, but that's not the point of the document. Confirmed as matching what was already scoped, not a new direction.
- **Real finding before drafting: the root `README.md` already had a "Code Layout" section doing roughly this job — and it was stale too**, listing `@lcase/engine`/`@lcase/worker`/`@lcase/limiter`/`@lcase/flow-analysis`/`@lcase/json-ref-binder` as flat packages with no mention of the `functional-core`/`components` split or the `Operations` tier at all. Resolved the location question for free: extract that table into a new `docs/architecture.md`, expand it to the real settled taxonomy, and leave `README.md` with a short pointer — exactly matching the "root README links to it" shape being discussed.
- **Clarified how `CLAUDE.md` actually works, since it came up while deciding scope**: no fixed/enforced schema — it's plain markdown Claude Code reads for project context, sections are whatever got written, not a required template. Its own first line already frames it as AI-session-facing guidance, consistent with treating it as more technical/dense than the new human-facing doc.
- **Decision: also refresh `CLAUDE.md` itself, in this same Change, no further splitting.** It's genuinely stale in verifiable, not just vibes-based, ways — checked directly: `packages/engine`, `packages/worker`, `packages/flow-analysis` referenced throughout by pre-Change-2 paths; the `packages/scheduler` paragraph cited `packages/limiter` (stale) right next to `packages/components/router` (current) in the same sentence; no mention anywhere of the `functional-core`/`components` split or `Operations`; and it still said "Tools are meant to be the primary extension point for this project," which ADR-0006 actually superseded. Duplication between `CLAUDE.md` and the new doc is fine, explicitly not something to engineer around.
- **Small fix during review: a dangling `INITIATIVE.md` reference in the `replay` table row** (no path, no context — unusable from a reader's perspective landing on this doc cold) turned into a real link with a labeled destination.

### What actually landed

- **`docs/architecture.md`** (new) — the human-facing package map: tiers with their physical locations, the full `packages/` listing including the ambiguous/special cases (`tools`, `db-prisma`, `replay`, `use-cases/*`, `archive/*`), the SQL/CAS storage split, and pointers out to the ADRs and research docs for anyone who wants the _why_.
- **`README.md`** — its stale "Code Layout" section replaced with a short pointer to the new doc; one other stale path (`packages/worker` → `packages/components/worker`) fixed in passing in the "Next" section.
- **`CLAUDE.md`** — refreshed: the missing `functional-core`/`components`/`Operations` tiers added to the layering list; every stale `packages/engine`/`packages/worker`/`packages/flow-analysis`/`packages/adapters/src/router` path corrected to its real post-Change-2 location; the "tools are the primary extension point" claim rewritten to match ADR-0006's actual settled conclusion (no registry, worker's protocol surface is the mechanism, third-party extension unexercised); the stale "domains" reorg reference removed (already noted as superseded in `docs/todo.md` itself, `CLAUDE.md` just hadn't caught up).
- All new cross-references (`docs/architecture.md` ↔ `CLAUDE.md` ↔ `docs/adr/000{5,6}...` ↔ `README.md`) checked to actually resolve, not just assumed correct.
