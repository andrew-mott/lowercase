# Artifact Versioning, Grouping, and Garbage Collection — a Git-Inspired Model

Status: exploratory research, not scoped to any current Change. Raised while
designing Change C7's writer/reader ports (see
[`arcs/artifacts-investigation.md`](../arcs/artifacts-investigation.md)), but the
model here is a longer-term direction, not a commitment for this initiative.

## Motivation

Three real, separate needs, currently unmet or half-met:

1. **User-created artifacts (e.g. prompts) have no revision history.** Editing one
   over time means either mutating it in place (losing history) or manually
   creating "weather prompt v1," "weather prompt v2" with no structural
   correlation between them.
2. **Step outputs could opt into the same kind of history**, correlated by
   `(flowVersionId, stepId)` rather than a human-chosen name — "how has this
   step's output changed across runs" — but authored by a run, not a person.
3. **Flow versions already attempt something like this and don't have it.**
   `FlowVersion` today is independent snapshots with no lineage — no record of
   what a version was forked from.

Also live: garbage collection has no real design. Deleting a flow, flow version,
or run isn't safe today because there's no way to check whether the artifacts
they reference are also used elsewhere.

## Why git, and what's not being borrowed

Git's object model separates four things: **blobs** (raw content, content-addressed,
no name or metadata), **trees** (map names to blob/tree hashes — a directory
snapshot), **commits** (point to one tree, zero or more parent commits, plus
author/message — the unit of history), and **refs** (mutable named pointers at a
commit — the only mutable thing in the whole model).

```ts
type Sha = string;

type Blob = Uint8Array;

type FileMode = "100644" | "100755" | "120000" | "040000" | "160000";
interface TreeEntry {
  mode: FileMode;
  name: string; // lives on the tree entry, not the blob
  type: "blob" | "tree" | "commit";
  hash: Sha;
}
type Tree = TreeEntry[];

interface Person {
  name: string;
  email: string;
  timestamp: number;
  timezoneOffset: string;
}
interface Commit {
  tree: Sha;
  parents: Sha[]; // 0 = root, 1 = normal, 2+ = merge
  author: Person;
  committer: Person;
  message: string;
}

type Ref = { kind: "direct"; hash: Sha } | { kind: "symbolic"; target: string };
```

One detail that matters for hashing design: git doesn't hash raw bytes alone — it
prepends a type+length header (`blob <n>\0`, `tree <n>\0`, `commit <n>\0`) before
hashing, so an object's type is baked into its hash. This project's
`hashBytes()` hashes bytes alone, no type prefix — meaning two artifacts with
byte-identical content but different declared `contentType` collapse to the same
hash today. Worth knowing as a deliberate difference, not an oversight to fix
reflexively — changing it isn't free once real data exists under the current
scheme.

**Not needed here**: file modes, symlinks, submodules (all filesystem-specific,
meaningless for content-addressed artifacts with no directory hierarchy), and
branching/merging (git's DAG exists because independent people fork timelines and
reconcile later; a prompt's edit history, or a step's output history, is
inherently linear — one prior revision, not a merge case to design for).

## Three separate problems, not one

Easy to conflate under "versioning." They're distinct, and git's model only
speaks to two of them:

1. **A single artifact's content changing over time** — Series + Revision (below).
2. **Grouping many artifacts produced together as one snapshot** — a run's
   outputs, a step's exports, a flow version's artifact set. Tree (below).
3. **An artifact associating with many independent things** (many flow versions,
   many parameters) — the existing, half-finished curated-artifacts mechanism
   (`Artifact.flowId`/`flowVersionId`/`curated`, `listCuratedArtifacts`). Git
   doesn't help here — it has no concept of "what references this blob" as a
   queryable relation; that's genuinely a many-to-many relational problem, and
   SQL is already the right tool for it. The reason it feels unfinished is more
   likely an under-designed schema (single `flowId`/`flowVersionId` columns
   instead of a proper join table) than the wrong storage model.

## The model

```ts
type Hash = string; // sha256 hex, same as today

// A snapshot grouping -- just JSON, saved through the same
// ArtifactWriterPort/ArtifactContentReaderPort as any other content.
interface ArtifactTree {
  entries: {
    role: string; // e.g. "step-3.output", "step-3.exports.summary"
    hash: Hash;
    contentType: string;
  }[];
}

// One entry in a lineage -- also just JSON, also saved the same way.
// `previous` points at the PRIOR Revision object's own hash, so a revision's
// hash depends on its whole history -- tamper-evident by construction, same
// trick a git commit gets for free.
interface Revision {
  content: Hash;
  previous?: Hash;
  author: { kind: "user"; userId: string } | { kind: "run"; runId: string };
  timestamp: number;
  message?: string;
}

// The ONLY genuinely new, mutable storage concept in this whole model.
// Everything above fits the existing artifact store with zero new mechanism.
interface Series {
  id: string; // e.g. "weather-prompt", or (flowVersionId, stepId)
  kind: "user-artifact" | "step-output";
  currentRevision: Hash;
}

// What a GC pass walks from.
type Root =
  | { kind: "flow-version"; flowVersionId: string; treeHash: Hash }
  | { kind: "run"; runId: string; treeHash: Hash }
  | { kind: "series-head"; seriesId: string }
  | { kind: "curated-artifact"; artifactHash: Hash };
```

`Tree` and `Revision` need no new storage — they're ordinary content, addressed
and stored the same way everything else in `packages/artifacts` already is.
`Series` is the one new thing, and it's small: a stable ID plus one mutable
pointer.

**Trees and series coexist over the same hash, independently.** A step's output
always goes into its run's tree, regardless of whether that step is opted into
series-tracking. If it is, the same hash is _also_ appended as a new `Revision`
in that step's `Series` — but only when the content actually changed. Git itself
refuses to create a no-op commit by default (`--allow-empty` required to force
one) for the same reason: a run's tree already records "it ran"; a series should
record "it changed," not duplicate what the tree/run history already gives you.

## Garbage collection: reachability, not reference counting

Git computes garbage via mark-and-sweep from roots (every ref, `HEAD`, reflogs),
walking everything reachable and treating the rest as collectible. It does not
maintain a reference count anywhere — counting requires correctly
incrementing/decrementing across every mutation, which is exactly the kind of
bookkeeping that quietly drifts wrong. Reachability-from-known-roots avoids that
by construction: define what's definitely alive, walk from there, anything
untouched is garbage.

```ts
interface GcMark {
  hash: Hash;
  unreachableSince: number;
  eligibleForDeletionAt: number; // grace period, git-style: mark now, sweep later
}

async function computeReachable(
  roots: Root[],
  load: (h: Hash) => Promise<unknown>,
): Promise<Set<Hash>> {
  // walk each root: trees -> entry hashes; series-heads -> follow `previous`
  // all the way back; collect everything touched.
  throw new Error("sketch only");
}
```

Git also doesn't delete unreachable objects immediately — it marks them
unreachable and holds them for a grace period (`gc.pruneExpire`, ~2 weeks by
default) before actually removing anything, since "this became unreachable by
mistake" is a real, recoverable failure mode. Worth adopting regardless of the
rest of this model, given a solo project has no undo on an accidental permanent
delete.

## SQL vs. CAS: a placement principle

The dividing line isn't "structured vs. unstructured" or "relational vs.
document" — it's:

- **Derivable from the immutable object graph** (what's in a run's tree, a
  series' revision history, GC reachability) → CAS is authoritative. SQL only
  earns a copy as a fast index when a specific query needs to be fast and
  frequent — never as a second source of truth.
- **Mutable independent of content, or a relationship between two independently
  existing things** → genuinely SQL's job. A hash's whole point is identity by
  content; something that changes without the content changing (a label) or that
  connects an artifact to something with its own separate lifecycle (a flow
  version, a parameter) can't be modeled by content-addressing without breaking
  identity.

Applied to today's artifact metadata: `label` fits the second bucket cleanly as
ordinary mutable SQL state. The curated/`flowId`/`flowVersionId` association also
belongs in SQL, but as a proper many-to-many join table (artifact ↔ flow version
↔ param), not the current single-column-pair shape — that's most of why it feels
"half-finished."

**Not every artifact needs a SQL `Artifact` row.** Only artifacts that need to be
individually addressable — found, labeled, curated, or associated with something
other than the run that produced them — need one. Ordinary run/step-produced
content doesn't; its only relevant grouping (which run made it) is already
answered by that run's tree. This reassigns who writes SQL, and when: the
worker's writes during execution become pure CAS writes (`ArtifactStorePort`
directly, no metadata step, nothing to partially fail), and one thing — an
observability sink reacting to `run.completed`, the same role
`SqlRunProjectionSink` already plays — folds the run's own emitted events into
one tree, saves it once, and writes one row (`Run.outputTreeHash`), rather than
the worker writing a metadata row per artifact during execution.

## Remote CAS (S3/MinIO): what's parallel, what's sequential

Root and tree lookups are independent of each other — SQL already holds each
root's tree hash, so fetching them is N independent GETs with no ordering
dependency, safely fanned out concurrently. Revision-chain walks are not: each
hop requires the previous hop's hash, so it's inherently sequential — real
network latency per hop, not a local file open. Git hit the same wall at scale
locally and added the commit-graph file specifically to avoid re-walking parent
pointers one at a time for common history queries.

Same fix applies here: keep CAS-stored `Revision` objects as the authoritative,
immutable record, but maintain a small SQL index over the same graph —
`(seriesId, revisionHash, previousHash, timestamp, authorId)` — written once per
revision, queried directly for anything needing the chain fast (a UI history
view, a GC pass). SQL becomes a cache purpose-built for the one access pattern
(ordered traversal) that's expensive to do by resolving hashes one at a time over
a network; CAS stays ground truth if that index ever needs rebuilding.

## Deliberately deferred: cross-run queries

"All artifacts ever produced by this flow" (across many runs, not one) is a
harder shape — it spans an unbounded number of run-trees, not one object.
Answering it means either unioning many trees at query time (fine while run
counts are small, degrades as they grow) or maintaining a separate rolling index
specifically for that query. Not building this now; it's a low-value edge case
today. Revisit only if it becomes a real, frequent, latency-sensitive need —
same "build the index only when a specific query shape earns it" principle as
the revision-chain case above.

## Consequence for Change C7's actual port design

This narrows what `ArtifactWriterPort` (the fused CAS+SQL capability from
`capability-modules.md`) is actually for. It is **not** the general write path —
most execution-time writes (worker, during a run) don't need it at all, since
they don't need SQL identity and can call `ArtifactStorePort` directly with no
partial-failure case to design for (there's nothing to partially fail across when
only one write is happening). The writer is specifically for the narrower,
less-frequent case: user-created artifacts, curated/promoted artifacts, and the
once-per-run tree/row bookkeeping done by observability at completion. Worth
keeping in mind while shaping `save()`'s actual signature so the design doesn't
implicitly assume every artifact write needs both ports.

## Open questions, not decided here

- Whether flow versions should actually adopt the Series/Revision shape, or stay
  independent snapshots — `FlowVersion`'s current scaffolding was already an
  attempt at something like this and may need reshaping rather than replacing.
- Exact shape of the curated/association join table.
- Whether `Series`/`Revision`/`Tree` should live in `packages/artifacts` itself,
  or a separate concern layered on top of it.
- Whether hashing should ever incorporate a type/format prefix (git-style), given
  today's type-agnostic hashing already has real content in production under it.
- The exact SQL index shape for revision-chain traversal and GC reachability
  caching.
