# Artifact Versioning and GC — Reconciliation

Status: follow-up to
[`artifact-versioning-and-gc.md`](./artifact-versioning-and-gc.md) (the original
model) and [`artifact-versioning-and-gc-review.md`](./artifact-versioning-and-gc-review.md)
(the critique). Records where discussion and verification against real usage
data landed — not a new proposal, not an implementation plan. Both prior
documents stay as-is; this is the reconciliation between them.

## What survived the review

Real findings, true independent of which overall direction (CAS graph vs.
relational provenance) eventually wins:

- **The `Series`-head design has a real concurrency bug.** Two concurrent runs
  reading the same `currentRevision`, both appending a revision, one silently
  clobbering the other on write. No compare-and-swap in the original sketch.
- **The flat dotted `role` string can collide** if a step ID or export name
  itself contains a dot. Needs structured role fields, not string
  concatenation.
- **`run.completed`'s event payload is `null` today.** An observability sink
  can't build the proposed tree from that event as originally imagined without
  new payload fields first — verified directly against `RunCompletedDataSchema`,
  not a matter of interpretation.
- **Two real, currently-live consumers would break if per-artifact SQL identity
  disappeared entirely** — see "The two real breakages" below.
- **JSONL/replay is not durable enough to be a GC liveness authority as-is** —
  fire-and-forget publish, no backpressure, `getEvent()` unimplemented, replay
  republishes with `{ internal: true }` which bypasses the observability topic
  entirely. Real caution, independent of the rest.

## What did not survive verification

Checked against [`docs/api-usage-audit.md`](../../../api-usage-audit.md) (a
prior, independent audit of actual frontend consumption) and the real engine
code:

- **"`RunStepProjection`/`RunStepExport` are actively used, not merely an
  optional cache" — true for exactly one consumer, false as a general claim.**
  The audit confirms `RunDetail.steps`/`.params` are entirely unread by both
  live frontend call sites — the UI derives step status from the event stream
  (`useRunEventsWithStatus`) instead. The one real, verified consumer is
  `getReusableStepDataFx` (`packages/components/engine/src/effects/get-reusable-step-data.effect.ts`,
  triggered from `fork-spec-result.planner.ts`), which calls
  `PrismaRunQuery.getReusableStepData()` — a direct
  `runStepProjection.findMany()` query, used to decide which of a forked run's
  parent-run step outputs can be reused instead of re-executed. Real,
  load-bearing, but singular — not evidence that this table is broadly
  queried today.
- **"`PrismaRunQuery.getRunDetail()`'s `ArtifactIndex` decoration is a
  user-visible path" — contradicted by the same audit.** `RunDetail.steps` and
  `.params` (which carry the decorated `ArtifactIndex` records) are confirmed
  entirely unread by both of `RunDetail`'s live call sites.

## The two real breakages, and what they actually need

- `ArtifactService.getArtifact()` → `getAuto()` — with no SQL row, falls back to
  raw `"bytes"` instead of parsed JSON/text/markdown. Real: `GET
/api/artifacts/:hash` is fully used across 4 live call sites (per the audit),
  this is exactly how a user previews step output/export content in the
  workbench.
- `RunService` requiring an `Artifact` row to call `isArtifactCompatible()`
  when a worker-produced hash is reused as a run param. Real and load-bearing
  for starting a run.

Both need exactly one thing: **the content-type of a hash.** Neither needs
relational identity — a label, curation, flow association, or revision history.
That's the resolution: this is blob-intrinsic metadata (immutable, write-once,
keyed by hash — not a relationship and not the content's own identity), and it
belongs colocated with the content itself, not gated behind a SQL row. Since
storage here is S3/MinIO-compatible, this isn't a design invented for this
project — object stores already support exactly this via `Content-Type` at
`PutObject`/`HeadObject`, retrievable without fetching the body.

This is why `ArtifactWriterPort`/`ArtifactContentReaderPort`'s underlying
`ArtifactStorePort` carrying `contentType` on both write and read (already
scoped for the current port work) closes both real gaps, without requiring
"every artifact gets a SQL `Artifact` row."

## Occurrence data doesn't need a generic `Artifact` row either

GC reachability and "what did this run produce" both already have a home:
`RunStepProjection.outputHash`, `RunStepExport.artifactHash`, and
`RunParam.artifactHash` record each hash directly on the row that produced or
selected it. No join through a generic per-hash catalog table is required for
either query — the review's own evidence list for GC roots already enumerates
exactly these columns.

## Sharpened SQL vs. CAS principle

Not "SQL is better at relationships and querying" as a vague heuristic — four
specific primitives, checked against what actually broke in the original model:

1. **Transactional consistency across multiple facts** — CAS has no equivalent
   beyond "swap one pointer after everything underneath is immutably written,"
   which doesn't help for unrelated facts changing together.
2. **Safe concurrent mutation** — the series-head race is the direct evidence;
   SQL gives compare-and-swap close to for free, a CAS+pointer design has to
   reinvent it.
3. **Ad-hoc, evolving query flexibility** — an index answers combinations you
   didn't fully anticipate; a CAS graph only answers the shapes you've built
   an index for.
4. **Native many-to-many structure** — foreign keys and join tables; CAS has no
   concept of "what references this" as a queryable relation at all.

Blob-intrinsic metadata (content-type, size) needs none of these four — it's
immutable and belongs to exactly one hash — so it doesn't argue for SQL despite
being "metadata." It argues for living with the content, in CAS.

## Decision for now

- **Keep the current SQL schema as-is.** The larger relational-provenance
  question this reconciliation doesn't resolve — item/revision tables for
  user-created content, a real curated-artifact join table, GC's actual root
  enumeration and grace-period mechanics — remains genuinely open. Deliberately
  not decided here; it needs its own dedicated design pass later, not a
  decision made under pressure to keep the current port work moving.
- **Implement only the CAS-level metadata that `load()` actually needs**: the
  new `ArtifactStorePort` (not `LegacyArtifactStorePort`) carries `contentType`
  on both `putBytes`/write and `getBytes`/read.
- **`getAuto()` is not being fixed — it's being superseded.** Once `load()`
  exists, `getAuto()` retires along with the rest of the old `ArtifactsPort`
  surface; no work goes into patching it to work under the new model.
- **`isArtifactCompatible()` and other format-dependent consumers (backend and
  frontend) will need real migration work to become format-agnostic against
  the new content-type-carrying flow.** Expected and deliberately deferred, not
  part of the current port-shape work.

## Open questions carried forward

- Whether user-artifact revision history becomes SQL item/revision tables (the
  review's proposal) or something else — undecided.
- The actual shape of a real curated-artifact join table.
- GC's real root enumeration and grace-period/epoch mechanics against the
  existing schema.
- Whether `getReusableStepData()`'s dependency on `RunStepProjection` needs to
  change if run/step artifact bookkeeping is ever redesigned.
