# Prove Swappable Infrastructure Initiative — Arc: Work-tracking migration (Change C6)

**Context:** [`queue-adapter.md`](./queue-adapter.md) (Changes C4–C5, C7–C9, C11–C14) · **Next:** [`package-tooling.md`](./package-tooling.md) (Change C10), [`sql-adapter.md`](./sql-adapter.md) (Changes C15–C16)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Establishes unambiguous internal work identifiers and migrates the living documentation to the resulting layout and terminology.

## Change C6 - Work-tracking terminology + documentation migration - merged (PR #365)

This Change separates internal planning IDs from GitHub objects, then makes the current repository consistently teach the new system. It merged through PR #365.

### Discussion

- **`PR N` was carrying two meanings.** Internally it named a small, initiative-local unit of work, while externally it naturally reads as a GitHub pull-request number. The mapping is normally one-to-one, but the namespaces are different and readers outside the planning context cannot infer which one a reference means.
- **The replacement vocabulary is Initiative, Arc, and Change.** An Initiative is the outcome-oriented body of work; an Arc is a coherent stream within it; a Change is the smallest internally tracked unit, normally mapping one-to-one to a GitHub pull request. Their compact forms are `I#`, `A#`, and `C#`; a GitHub object remains `PR #N`.
- **The canonical layout should move cleanly rather than leave a compatibility tree.** Keeping `docs/milestones/` as redirects would make the repository continue teaching the retired name. Git history preserves the old layout, so the living tree moves to `docs/initiatives/` with `INITIATIVE.md` indexes and repaired links.
- **Historic public PR descriptions remain historical.** They are not rewritten simply to replace an old internal label. New PR descriptions can include a useful internal reference such as `I# / A# / C#`, but those IDs stay out of titles and user-facing prose.
- **Tracking IDs do not belong in ordinary code comments.** Comments should describe durable behavior or rationale; a planning ID stays only when it is a useful durable link to a design record. This pass also removes stale or decorative dates rather than inventing replacements.
- **The project name is `lowercase`.** The same cleanup removes remaining `pipewarp` references in the living repository after the local workspace was renamed, without preserving the retired project name as an active convention.

### What actually landed

- Moved the canonical work-tracking tree from `docs/milestones/` to `docs/initiatives/`, renamed each `MILESTONE.md` index to `INITIATIVE.md`, and repaired repository links to the moved records.
- Replaced the old internal Milestone/PR terminology throughout current documentation and active guidance with Initiative/Arc/Change; preserved real GitHub PR references as `PR #N`.
- Added [`docs/work-tracking.md`](../../../work-tracking.md) as the concise, canonical rule set and pointed repository guidance at it so future agents follow the same convention.
- Removed internal tracking labels from ordinary code comments, audited dated planning/process prose, and updated living documentation and tooling references from `pipewarp` to `lowercase`.
- Kept old public GitHub PR descriptions unchanged. The implementation landed in PR #365 through local commits `716da1b` (structural move) and `18a61f9` (terminology and cleanup).
