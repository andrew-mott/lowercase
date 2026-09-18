# Artifact Versioning and GC Review

Status: architecture review of
[`artifact-versioning-and-gc.md`](./artifact-versioning-and-gc.md), not an
implementation or migration plan.

## Verdict

Do not adopt the proposed CAS `Tree` / `Revision` / `Series` graph as the
primary artifact-history and garbage-collection model.

The proposal contains several good ideas worth retaining:

- content bytes should remain immutable and content-addressed;
- a user-facing artifact needs a stable identity separate from a content hash;
- garbage collection should use mark-and-sweep with a grace period, not a
  mutable reference count;
- intrinsic content facts, mutable presentation metadata, and usage provenance
  are different concepts.

The Git analogy stops helping after those points. Lowercase already has a
central SQL database containing the ownership and occurrence records that Git
has to encode into objects because Git is decentralized. Runs, steps, exports,
parameters, flow versions, and simulations are relational entities here. A CAS
commit graph would duplicate those relationships, introduce a second graph
whose consistency must be maintained, and still require SQL for mutable heads,
queries, and GC roots.

The better fit for the current system is:

> CAS is authoritative for immutable bytes and their hash. SQL is
> authoritative for ownership, provenance, revision occurrences, media type,
> retention, and reachability. JSONL is an audit/replay record, not an artifact
> liveness authority.

Under that model:

- keep `ArtifactWriterPort` as the general fused CAS-plus-content-registration
  write capability;
- do not inject `ArtifactStorePort` into Worker;
- model user-authored revision history with a stable SQL item and append-only
  SQL revision rows pointing at CAS hashes;
- treat each run-step output/export as an occurrence already represented by
  `RunStepProjection` and `RunStepExport`, including repeated identical hashes;
- group a run through its existing SQL run/step/export/param structure;
- compute GC reachability from durable SQL references, with pending-write
  protection and a grace period.

An immutable run manifest can still be generated later for export, signing, or
portable snapshots. It should be a derived representation, not the source of
truth for normal queries or safe deletion.

## Evidence Reviewed

This review checked the proposal against the current implementations rather
than the proposal's description of them:

- [`schema.prisma`](../../../../packages/db-prisma/prisma/schema.prisma)
- [`artifacts.ts`](../../../../packages/artifacts/src/artifacts.ts)
- [`ArtifactStorePort`](../../../../packages/ports/src/artifacts/artifact-store.port.ts)
  and
  [`ArtifactRepositoryPort`](../../../../packages/ports/src/artifacts/artifact-repository.port.ts)
- [`PrismaArtifactRepository`](../../../../packages/adapters/src/artifact-repository/prisma-artifact-repository.ts)
- [`JsonlEventLog`](../../../../packages/adapters/src/event-store/jsonl.store.ts),
  [`ReplaySink`](../../../../packages/components/observability/src/sinks/replay.sink.ts),
  and [`ReplayEngine`](../../../../packages/replay/src/replay.ts)
- [`SqlRunProjectionSink`](../../../../packages/components/observability/src/sinks/sql-run-projection.sink.ts)
  and the pure `updateRunIndex()` fold
- run, step, and job event schemas
- Worker output storage and Engine completion planning
- all production `ArtifactsPort` and `ArtifactRepositoryPort` consumers
- [`isArtifactCompatible`](../../../../packages/functional-core/flow-analysis/src/artifact-compat.ts)
- the strict flow-definition schemas in
  [`packages/specs`](../../../../packages/specs/src/flow.types.ts)

One correction to the task framing itself: `packages/replay` contains the replay
engine, but the JSONL implementation is actually
`packages/adapters/src/event-store/jsonl.store.ts`.

## Factual Claim Audit

### Claims that hold

1. **User-created content has no stable revision identity.**

   `Artifact.hash` is the SQL primary key, and no table relates one content hash
   to a prior one. The current HTTP API creates content with `POST /artifacts`
   and only edits metadata with `PATCH /artifacts/:hash`; it cannot mutate
   content in place. The real current limitation is therefore not lost bytes,
   but the absence of a logical item that correlates separately-created hashes.

2. **There is no implemented artifact GC.**

   `ArtifactStorePort` can only `putBytes()` and `getBytes()`. It cannot enumerate,
   stat, mark, or delete objects. No application service exposes flow, run, sim,
   or artifact-content deletion either. GC needs real new behavior.

3. **Content hashing is type-agnostic.**

   `Artifacts.hashBytes()` is raw SHA-256 over bytes. The same bytes saved as
   text and Markdown have the same logical hash. The filesystem adapter can
   still create separate extension-specific files for that hash, while the
   single SQL `Artifact` row is upserted and its `contentType`/`format` can be
   overwritten by the later write. The proposal identifies the hash behavior
   correctly but understates the existing metadata ambiguity.

4. **There is no cross-resource transaction for CAS plus SQL.**

   `Artifacts.write()` and the older `put*()` path write the filesystem first
   and then call `PrismaArtifactRepository.writeArtifact()`. A SQL failure leaves
   valid unregistered content. A typed incomplete outcome preserving the hash
   remains the right capability-level behavior.

5. **Revision-chain reads are sequential.**

   A `previous`-hash chain over a remote CAS would require one dependent fetch
   per hop. An index would be needed for efficient history queries. This is a
   real cost, but it is also evidence against creating that chain when the
   desired history is already relational.

### Claims that need qualification

1. **"FlowVersion is independent snapshots with no lineage."**

   There is no `parentFlowVersionId` or fork/base field, so explicit lineage is
   absent. It is not a collection of completely unrelated snapshots, however:
   each row belongs to a `Flow`, has a per-flow `sequence`, and has a unique
   `(flowId, sequence)` constraint. The repository currently only creates
   sequence `1` and has no append-version operation, so the implementation is
   less complete than the schema suggests. If fork lineage is needed, an
   optional parent/base column on `FlowVersion` is a more direct fit than a
   second generic revision graph.

2. **"Step-output history is missing."**

   There is no dedicated history API or optimized cross-run index, but the data
   already exists. `RunStepProjection` records one output hash per
   `(runId, stepId)`, `RunStepExport` records named export hashes, and `Run`
   supplies `flowVersionId` and time/status context. Querying those rows by flow
   version, step, and output role produces a history, including repeated
   identical values. What is missing is a query/read model, not necessarily a
   new persistence model.

3. **"Deleting owners is unsafe because references cannot be checked."**

   No blob deletion path exists today, so current code leaks rather than
   accidentally deletes shared content. References can be found in known SQL
   columns, many of which are indexed. What is missing is a complete inventory
   and a deletion policy, not the theoretical ability to inspect references.

4. **"Tree and Revision are ordinary artifacts requiring no new storage
   mechanism."**

   Their JSON bytes could be stored by the current CAS, but making them safe
   graph objects requires more than storage: versioned schemas, type
   discriminators, canonical entry ordering, unique-role validation, integrity
   checks, graph decoding, cycle/depth protection, and root update semantics.
   Current `ArtifactStorePort` also lacks enumeration and deletion. "No new
   blob backend" is true; "zero new mechanism" is not.

5. **"The event log carries run outputs."**

   Terminal step events normally carry the accepted primary output and declared
   export hashes, including reused steps. That is enough for a best-effort fold
   of normal completed step results. It is not a complete record of every CAS
   write, and it carries no content/media type on those references.

### Claims that are incorrect in the current repository

1. **The curation association is not only a narrow single pair.**

   `Artifact.flowId` and `Artifact.flowVersionId` are single-valued scope fields,
   as stated. But `ArtifactParamCuration` is already the proposed many-to-many
   join keyed by `(artifactHash, flowVersionId, paramName)`, with real foreign
   keys and cascade behavior. `PrismaArtifactRepository.listCuratedArtifacts()`
   queries it directly. The proposal conflates direct flow scope with
   param-level curation and recommends a table that already exists.

2. **`Series` is not the only new mutable storage concept.**

   The sketch also requires durable root pointers such as
   `Run.outputTreeHash`, flow-version tree roots, GC marks, deletion epochs, and
   likely a revision index. Saving a tree and then updating its owner is another
   CAS-plus-SQL partial-failure boundary. Advancing a series head is a
   compare-and-swap operation, not merely storing a small pointer.

3. **SQL does not already hold tree roots.**

   There is no `treeHash` or `outputTreeHash` column in the current schema.
   `FlowVersion` stores `definitionHash`; `Run` stores `flowDefHash` and optional
   `forkSpecHash`; output/export hashes live in step projection tables. The
   remote-CAS section describes a hypothetical future state as if it were a
   current placement fact.

4. **A `run.completed` observer cannot currently build the proposed tree from
   that event.**

   `RunCompletedDataSchema` is `null`. The event contains no output manifest.
   A new sink would have to duplicate `SqlRunProjectionSink`'s per-run shadow
   fold, query a projection that may still be flushing, or reread JSONL. Even
   then, current step events provide hashes but not the `contentType` required
   by the proposed `ArtifactTree` entries.

5. **The JSONL log is not the current durable source of truth for run
   artifacts.**

   The replay sink is configurable, calls `recordEvent()` without awaiting it,
   and the JSONL store explicitly ignores write-stream backpressure. It exposes
   no close/flush operation through `EventStorePort`; `getEvent()` is
   unimplemented; reads parse JSON without event-schema validation. Current app
   configs enable the sink, but the runtime contract does not require it.
   `ReplayEngine` republishes with `{ internal: true }`, which deliberately
   bypasses the observability topic, so replay does not rebuild the SQL
   projection sink. This is useful debugging/replay infrastructure, not yet an
   authoritative durable log suitable for GC.

6. **Branching is not categorically absent from step-output history.**

   Multiple runs of the same flow version can execute concurrently. Two runs
   can read the same series head, create different revisions with the same
   `previous`, and race to replace `currentRevision`. Without optimistic
   concurrency and retry, one change becomes unreachable. With retry, the
   system imposes an arbitrary total order. The proposed "inherently linear"
   assertion is therefore false for the concrete step-output use case.

7. **Git's default no-empty-commit behavior is not a sufficient domain rule.**

   Git can represent empty commits; porcelain merely requires an explicit
   option. More importantly, a workflow execution is an occurrence, not only a
   content transition. "This step ran again at this time and produced the same
   hash" is real provenance already represented cheaply by the run and step
   rows.

## Persistence Reality

### SQL is already the queryable provenance graph

The current schema records these CAS references:

- `FlowVersion.definitionHash`
- `Sim.forkSpecHash`
- `Run.flowDefHash`
- `Run.forkSpecHash`
- `RunParam.artifactHash`
- `RunStepProjection.outputHash`
- `RunStepExport.artifactHash`
- `Artifact.hash` and `ArtifactParamCuration.artifactHash`

`PrismaRunQuery.getRunDetail()` reads the run, step projections, exports, and
params from SQL. `getReusableStepData()` also reads step output/export hashes
from SQL, not JSONL. Eval setup and the workbench use this SQL read model. These
rows are not merely an optional cache in current behavior.

The SQL projection is imperfect: it is updated asynchronously, can race other
completion sinks, and is mutable via upsert. Those are reasons to clarify its
ownership and completion semantics. They are not evidence that duplicating it
into a CAS graph will simplify the system.

### JSONL overlaps SQL but is weaker operationally

The event schemas are more informative than `run.completed` itself:

- `step.completed` and `step.failed` can contain `outputHash` and
  `exportHashes`;
- `step.reused` can contain the same hashes plus `sourceRunId`;
- `run.completed` and `run.failed` contain `null` data.

There is also a concrete completeness hole. Worker stores declared exports
sequentially. If one later export fails, earlier successful export writes are
discarded from `storeDeclaredExports()`'s returned error. A failed `JobResult`
can preserve the primary output but has no exports field, so those earlier CAS
hashes never reach the job or step terminal event. The current fused writer at
least leaves SQL `Artifact` rows for them. A raw-CAS worker would leave them
unattributed until GC.

The in-memory bus and observability tap also provide no completion barrier:

- `InMemoryEventBus.publish()` queues delivery and resolves without waiting for
  handlers;
- its subscription wrapper does not await returned promises;
- `ObservabilityTap` awaits sinks one by one, but separate event invocations can
  interleave;
- `SqlRunProjectionSink.handle()` starts a fire-and-forget flush;
- `EvalResultProjectionSink` already has retry delays specifically to work
  around the resulting `run.completed` projection race.

A stateful sink will usually observe terminal step events before terminal run
events on the current in-memory path, but the port contracts do not guarantee
that ordering or that prior sink work is durable. It is not a safe foundation
for a GC root without a new invariant.

### CAS is only a byte store today

`FsArtifactStore` stores extension-specific files under hash-sharded paths. The
port exposes no content descriptor, object type, creation time, enumeration,
or deletion. `getBytes(hash)` searches known extensions and returns only bytes.

Consequences for the proposed graph include:

- a GC cannot discover the set to sweep through the current port;
- a hash alone cannot recover media type after removing SQL metadata;
- a tree's entries must be deterministically sorted because JSON array order is
  hash-significant;
- the free-form dotted `role` string can collide when step IDs or export names
  contain dots; structured role fields are required;
- internal graph objects need an explicit kind and schema version rather than
  relying on arbitrary JSON being interpreted in the correct context;
- deleting a logical hash must account for every extension-specific physical
  file that may exist for it.

## Narrowing `ArtifactWriterPort` Creates Real Gaps

The prior capability-module research found that every production write currently
uses both CAS and `ArtifactRepository`. The new proposal reverses that based on
a future storage theory, not a new current use case. The consumer audit confirms
that the reversal is premature.

| Consumer                          | Current behavior and dependency                                                                                                    | Effect of worker/raw-CAS proposal                                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker                            | Reads typed refs; writes primary JSON output and declared JSON/text/Markdown exports.                                              | Breaking today. Worker outputs are later consumed through metadata-dependent paths. Worker would also have to own or duplicate hashing, canonicalization, and extension policy if given `ArtifactStorePort` directly. |
| Engine's three effects            | Read known JSON/text/Markdown content by hash.                                                                                     | Unaffected; they should receive `ArtifactContentReaderPort`.                                                                                                                                                          |
| `ArtifactService`                 | Creates uploads/curated content, performs metadata-aware `getAuto()`, lists and curates rows.                                      | Requires the fused writer and catalog/repository behavior.                                                                                                                                                            |
| `FlowService` / `addFlowToCas()`  | Writes flow definitions and reads them by known JSON format; `FlowVersion.definitionHash` is the durable owner relation.           | A generic `Artifact` row is not required by that one relation, but a raw store is still the wrong consumer API. The proposal does not account for this write at all.                                                  |
| `RunService`                      | Reads flow JSON and requires an `Artifact` metadata row for every supplied run-param hash so it can call `isArtifactCompatible()`. | Directly fails for a worker output reused as a parameter.                                                                                                                                                             |
| `SimService` / `startForkedSim()` | Writes fork specs; `Sim` or the eventual `Run` stores the hash.                                                                    | The proposal does not account for these writes. The event-only `startForkedSim()` path is especially vulnerable if its terminal SQL projection never lands.                                                           |
| `EvalService`                     | Takes a prior run's export hash and submits it as a parameter to an eval run.                                                      | Indirectly depends on Worker having registered that hash, because `RunService` rejects an unknown artifact before starting the eval.                                                                                  |
| Observability eval projection     | Reads a known JSON export hash after run completion.                                                                               | Content-reader only, but its existing SQL race demonstrates why a second completion sink is not automatically ordered.                                                                                                |

Two user-visible paths also depend on worker-created metadata:

1. `PrismaRunQuery.getRunDetail()` decorates run params and exports with
   `ArtifactIndex` records.
2. The workbench opens a run output/export through `GET /artifacts/:hash`.
   `ArtifactService.getArtifact()` calls `getAuto()`, which needs the SQL row to
   determine format. With no row it falls back to bytes, and the route returns
   only a byte length instead of JSON/text content.

The eval path is the strongest counterexample to "ordinary run output needs no
SQL identity." A worker-produced export is immediately reusable as another
run's typed input without any manual promotion step.

This does not prove that every future blob must have rich user-facing metadata.
It proves that every accepted content write currently needs a durable content
descriptor discoverable by hash. That descriptor can be much narrower than the
current overloaded `Artifact` row, but removing it requires replacing all of
the above behavior first.

If a real CAS-only use case later appears, expose an
`ArtifactContentWriterPort` owned by `packages/artifacts`. It should own encoding,
canonicalization, hashing, and storage errors. A component must not call the raw
`ArtifactStorePort`, whose API requires the caller to supply a hash and physical
extension. No current consumer proves that this additional inbound port is
needed yet.

## Specific Model Problems

### Run trees duplicate an existing aggregate

A run is already grouped by `Run`, `RunParam`, `RunStepProjection`, and
`RunStepExport`. That structure supports the main read paths and can be queried
without loading and decoding another CAS object. A run tree would duplicate the
same facts and create a consistency question whenever SQL projection and tree
creation disagree.

Saving the tree does not eliminate partial failure. The proposed sink must:

1. save the tree to CAS (and, if using the fused writer, register its metadata);
2. update `Run.outputTreeHash` in SQL.

If step 2 fails, the tree is orphaned and its child blobs may appear unreachable.
If the sink retries with nondeterministically ordered entries, it can produce a
different tree hash. The same coordination problem recurs for revision-object
saves followed by series-head updates.

Failed and abandoned runs are also omitted from the proposal. They can produce
valuable primary outputs and partially stored exports, but a sink reacting only
to `run.completed` never roots them. Content written by a long-running active
run is temporarily unreachable as well. A grace period reduces risk but does
not define ownership or protect runs longer than the grace period.

### The proposed GC root set is incomplete

The sketched roots cover future flow-version trees, future run trees, series
heads, and curated hashes. They do not establish liveness for the current
`Sim.forkSpecHash`, `RunParam.artifactHash`, failed/in-progress run outputs,
un-curated but intentionally retained artifacts, or JSONL records whose replay
still needs content. Flow definitions and run fork specs are covered only if
new trees are successfully created and include them, which is not specified for
historical or failed writes.

Mark-and-sweep also needs a consistent view while roots are changing. A blob can
be written after the mark snapshot but before its SQL owner reference; a series
head or run reference can advance while sweep is in progress. A grace period is
useful recovery time, but safe deletion still requires an epoch/snapshot rule or
a second liveness check immediately before deleting each candidate.

### Step series confuse changes with executions

For step outputs, the natural immutable event is a run-step occurrence:

```text
(runId, flowVersionId, stepId, role, hash, mediaType, status, time, reusedFrom)
```

That occurrence exists whether or not the bytes changed. A changes-only view is
derived by comparing adjacent occurrence hashes. Storing a CAS `Revision` only
when content changes loses the direct occurrence relation and then depends on
the run tree to put it back.

The proposed series key is also too coarse. A step has a primary output and zero
or more named exports that can change independently. If any retention or
presentation policy is opt-in, its natural granularity is an output role:

```text
(flowVersionId, stepId, "output")
(flowVersionId, stepId, "export", exportName)
```

A flow-level default with per-role overrides could be useful eventually. A
single per-step boolean cannot express "track this declared export but not the
large raw response."

### Current flow specs cannot express the proposal

The flow schemas are strict. Capability-step common fields contain only
`args`, `pipe`, and `tool`; HTTP JSON export declarations contain `ref`, `type`,
optional JSON schema, and optional eval context. MCP has no declared exports.
There is no history/retention field at the flow, step, primary-output, or export
level.

Adding a step-level field is mechanically possible, but it would encode the
wrong granularity described above. More importantly, persistence correctness
and GC reachability must never be opt-in. An opt-in flag may control retention,
pinning, indexing, or UI presentation; every durable owner reference still has
to be recorded.

### Media type is reference metadata under the current hash rule

Because hashes cover bytes only, a hash cannot uniquely determine whether the
bytes should be interpreted as plain text, Markdown, JSON, audio, or another
format. The current single `Artifact.contentType`/`format` pair already handles
this poorly when identical bytes are used with different types.

The proposed tree places `contentType` on entries, which is directionally
correct, but `Revision` points only to a hash and loses the same information.
Changing the hash algorithm to include a type prefix would be a disruptive
identity migration. The less disruptive model is to keep byte hashes and store
`mediaType` on each durable reference/revision. Intrinsic content inventory
should contain only facts such as hash and byte size.

## Recommended Alternative: Relational Provenance Over CAS

This model solves the three stated goals without recreating Git's object graph.

### 1. Keep a narrow content catalog

Conceptually separate immutable content registration from user-facing artifact
identity:

```ts
type ArtifactContentRecord = {
  hash: string;
  sizeBytes: number;
  createdAt: string;
};
```

This row is an inventory record, not proof that content is live and not the
place for mutable labels or a globally authoritative media type. The current
`Artifact` table mixes content inventory, presentation metadata, curation, and
scope. Those concepts should be separated when the artifact model is revised.

`ArtifactWriterPort` should continue to own:

- canonicalization/encoding;
- hash computation;
- CAS write first;
- content-record write second;
- the typed content-only outcome when the second write fails.

That keeps Worker and application services away from physical store vocabulary
and preserves by-hash discoverability. Caller-specific ownership writes, such as
`FlowVersion.definitionHash` or a run-step output reference, remain owned by the
caller/use case; the writer does not pretend to transact across every aggregate.

### 2. Model user-authored artifacts as items and revisions in SQL

A stable item solves the actual "prompt v1 / prompt v2" problem:

```ts
type ArtifactItem = {
  id: string;
  label: string;
  currentRevisionId: string;
};

type ArtifactRevision = {
  id: string;
  itemId: string;
  sequence: number;
  contentHash: string;
  mediaType: string;
  createdAt: string;
  authorId?: string;
  message?: string;
  parentRevisionId?: string;
};
```

The exact names are not decisions here. The structural decision is that a
logical item and its append-only revision occurrences are relational, while
revision content remains in CAS. SQL can enforce uniqueness, order revisions,
handle optimistic concurrency, list history in one query, and retain two
concurrent edits without making one revision unreachable.

For an explicit user save with unchanged bytes, the product can either return
the current revision as a no-op or record a checkpoint when audit intent is
explicit. That is a user-artifact policy, not a rule inherited from Git.

### 3. Use run-step rows as execution history

Do not create `Series` or CAS `Revision` objects for normal step outputs.
Preserve every execution occurrence in SQL, even when hashes repeat. A query by
`Run.flowVersionId`, step ID, and output/export role is the history. Add the
missing media type and, if useful, source execution/reuse provenance to the
durable reference.

This gives both views cheaply:

- occurrence history: every run in time/order;
- change history: occurrence history with consecutive duplicate hashes
  filtered out.

It also removes the series-head race between concurrent runs.

### 4. Keep run grouping relational

`RunDetail` is already the run manifest for application queries. The durable
group consists of the run's definition/fork/param references plus its step
output/export references. This representation handles completed, failed,
reused, and partially completed runs instead of only successful terminal runs.

If a portable immutable snapshot later earns its cost, serialize this SQL-owned
group to a versioned, canonical CAS manifest. Treat its hash as a cache/export
or integrity checkpoint. It must be rebuildable and must not be the only path
by which child content stays live.

### 5. Mark and sweep from SQL references

Keep the proposal's mark-and-sweep idea, but walk the actual ownership graph.
At minimum, the reachable set must include hashes from:

- flow-version definitions;
- sim fork specs;
- run flow definitions and fork specs;
- run parameters;
- run-step primary outputs;
- run-step exports;
- user artifact revisions and curated/pinned items;
- any future owner table that persists a content reference.

The content catalog supplies the candidate inventory; owner/reference rows
supply liveness. GC also needs:

- a durable pending-write or age rule so CAS content is not swept between its
  content write and owner-reference write;
- protection for active runs;
- a mark epoch or a second root check before deletion so roots created during a
  scan are not lost;
- a grace period and tombstone/mark record;
- store-level enumeration, age/stat, and delete capabilities;
- deletion of every physical representation of a logical hash;
- a declared policy tying JSONL retention to SQL run-reference retention.

This is still reachability rather than reference counting. It simply uses the
database that already owns the relationships instead of duplicating them into
CAS objects.

### 6. Keep JSONL out of the GC root set

Scanning JSONL for liveness would make GC depend on an optional, unindexed,
not-fully-durable store with no API to enumerate run logs. Prefer this invariant:

> While a run's replay log is retained, its SQL run and artifact-reference rows
> are retained too. Deleting the run history deletes or expires both together.

If JSONL is later promoted to an authoritative event store, it first needs
durable acknowledged appends, flush/close semantics, schema validation,
ordering/idempotency guarantees, global discovery, and a projection rebuild
path. That is a separate event-store architecture decision.

## Historical Reconstruction

A complete CAS run tree cannot be guaranteed for every historical run.

For a normally projected run, SQL already provides step IDs, primary output
hashes, and named export hashes. Current production writes also usually provide
an `Artifact` row from which media type can be recovered. Such runs can be
converted to a manifest after the fact if a derived manifest is wanted.

JSONL can fill some SQL gaps when the replay sink was enabled and all writes
landed: folding `step.completed`, `step.failed`, and `step.reused` recovers
accepted hashes. It still does not recover media type directly or the
successfully stored exports discarded by a later export failure. A missing,
truncated, buffered, or disabled log cannot be treated as complete.

Therefore:

- normal historical run output groupings are best-effort reconstructable;
- exact "every blob physically written by this run" trees are not;
- user artifact lineages cannot be inferred from similarly named independent
  hashes and must begin when a stable item/revision relation is introduced;
- the relational alternative needs no run-tree backfill to become useful,
  because the current run projection tables are already its starting model.

## Decisions for the Current Artifact-Port Work

This review is not a build plan, but it does resolve the design pressure that
triggered it:

1. Do not narrow `ArtifactWriterPort` to user-created/curated content based on
   the Git-inspired proposal.
2. Keep the previously established split between a fused writer and a narrower
   content reader.
3. Keep `ArtifactStorePort` behind the artifact capability module. Worker should
   not receive it.
4. Treat a durable, by-hash content descriptor as part of a successful accepted
   write until current eval, compatibility, query, and UI behavior has another
   explicit source.
5. Do not add `Tree`, `Revision`, `Series`, `Run.outputTreeHash`, or flow-spec
   tracking flags as part of the current port refactor.
6. Treat user artifact versioning and GC as later, separate model decisions.
   They should build on SQL provenance and retention rather than constrain the
   writer/reader port prematurely.

## Genuine Open Questions

The evidence does not settle these product policies:

- whether deleting a run should also make its otherwise-unreferenced outputs
  collectible, or whether run outputs have an independent retention period;
- whether a user-created item points to one mutable head or supports explicit
  branches/conflict copies;
- whether saving unchanged user content should be a no-op or an explicit audit
  checkpoint;
- whether the event log is intended to become authoritative enough to rebuild
  all SQL projections;
- whether a portable/tamper-evident run manifest is valuable independently of
  normal run grouping and GC.

None of those questions requires a Git-shaped CAS graph now. The current code
supports a simpler boundary: bytes in CAS, relationships and occurrences in
SQL, and replay events as a separate retained history.
