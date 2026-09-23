# Work tracking

This document defines the target work-tracking convention and the rules for
migrating to it. It is deliberately small: the initiative index and its arc
files hold the actual work history.

## Canonical terms

- **Initiative (`I#`)** — a large, outcome-oriented body of work.
- **Arc (`A#`)** — a related, narratively coherent stream within one
  initiative.
- **Change (`C#`)** — the smallest internally tracked unit of work. A Change
  normally maps one-to-one to a GitHub pull request.
- **GitHub PR (`PR #N`)** — the repository-wide pull request object assigned
  by GitHub. It is not a Change identifier.

Write a complete internal reference as `I3 / A2 / C4` (hardly ever used if ever). `I#` is globally
unique; `A#` and `C#` are scoped to their initiative, so do not cite either
alone where the initiative is not already clear. A merged Change ID is permanent
and never reused; planned IDs follow the planning-runway rule below.

The canonical layout is:

```text
docs/
  initiatives/
    README.md
    <initiative-slug>/
      INITIATIVE.md
      arcs/
        <descriptive-arc-name>.md
```

Use descriptive, kebab-case directory and arc-file names. The initiative
index, not filename numbering, maps IDs to documents.

## Writing rules

- Refer to an internal unit as `Change C4` or `C4`, not `PR 4`.
- Refer to the external object as `GitHub PR #381` or `PR #381`, never `PR
381` when ambiguity is likely.
- Code comments explain durable behavior or rationale. Do not add tracking
  IDs to them unless the ID is a useful, durable link to a design record; use
  the documentation link in that rare case.
- During a migration, remove existing internal tracking IDs from code comments
  by default. Retain one only when it is the durable design-record link above.
- Dates in active planning or process prose must be accurate and meaningful.
  Remove a stale or decorative date rather than guessing a replacement. Keep
  historical dates only when they are factual, or verify a correction from
  repository history before changing one.
- An initiative's Change index carries each Change's current status, and gains
  the GitHub identifier once it merges, for example `C4 — merged (PR #381)`.
  See Change status below.

## Planning runway

An Initiative may intentionally carry a small, useful runway of future Changes:
pre-numbered rows in its Change index, Arc files, and the discussions needed to
make the next choices legible. Keep the index compact and put detailed reasoning
in the relevant Arc/Change entry.

Those future numbers are a forecast, not a commitment. Before implementation is
committed, a planned Change may be reordered, renumbered, split, combined, or
skipped as understanding changes. Prefer whole integer `C#` values rather than
suffixes such as `C2a`. Once implementation has been committed, keep that
Change's number stable; merge makes it permanent historical identity.

Do not pre-enumerate work merely to fill a roadmap. Add enough planned Changes
to make the likely next path clear, and revise the runway deliberately when the
work changes.

## Change status

A Change moves through four states, recorded identically in the arc file's
Change heading and in the initiative's Change index:

- **not started** — written down, nothing built.
- **in progress** — being implemented.
- **in review** — implemented and verified, with the pull request open or about
  to be.
- **merged (PR #N)** — landed. The GitHub identifier appears here and nowhere
  earlier, because it does not exist until the pull request is opened.

Move through the states rather than skipping them. A Change that goes straight
from `not started` to `merged` leaves no record that it was ever in flight,
which is most of what the status is for. Its not a big deal if this is missing, generally the imporant thing is before a PR, its at least moved to `in review`, then post PR, to `merged (PR #N)`.

A Change's **What actually landed** section is written _before_ the pull request
is opened, while the implementation is fresh and while it can still inform the
PR description. It records where the outcome diverged from the Discussion —
decisions reversed, constraints discovered, scope that moved in or out — not a
summary of the diff. A Change whose Discussion was itself written after the code
needs no such section: it already describes the outcome.

After merge the only remaining edit is bookkeeping — the status becomes
`merged (PR #N)` in both places, and the initiative's "Next up" list drops the
entry.

## Migration playbook

Use this only for an explicitly requested, repository-wide migration. Do not
partially adopt the new vocabulary while the old structure is still canonical.

1. Inspect the working tree first. Preserve unrelated edits and do not bury
   them in the migration.
2. Inventory current references before changing them. Classify each one as an
   internal tracking reference, a real GitHub PR/Milestone reference, a
   historical quote, or unrelated prose.
3. Make a **moves-only commit**. Move `docs/milestones/` to
   `docs/initiatives/`, rename each `MILESTONE.md` to `INITIATIVE.md`, and
   repair only paths and links made invalid by those moves. Do not rewrite
   narrative terminology in this commit.
4. Make a **terminology commit**. Update current documentation, templates,
   indexes, and active instructions to Initiative, Arc, and Change. Remove
   internal tracking IDs from code comments unless a comment needs a durable
   design-record link. Audit dated planning/process prose at the same time:
   remove stale dates and verify any historical-date correction from
   repository history. Preserve numeric identity: legacy milestone `3`
   becomes `I3`; an old internal PR `4` becomes `C4` in the same initiative.
   Add arc IDs where the index needs them, rather than numbering filenames.
5. Keep real GitHub identifiers intact. `PR #381` and GitHub Milestone names
   must not be renamed. Do not edit old public GitHub PR descriptions merely
   to revise their historical internal wording.
6. Validate the result. Check internal links, search for remaining legacy
   terms, and inspect every remaining match. A remaining legacy reference is
   acceptable only when it identifies a real GitHub object or explains the
   historical migration.

Do not keep a `docs/milestones/` compatibility directory or redirect stubs.
Git history preserves the prior layout; the current repository should teach
only the current vocabulary.
