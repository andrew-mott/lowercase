# Artifact model evolution for evaluations

Research as of 2026-09-30, against repository revision `857977d6`.
Working direction updated 2026-10-08; the code inventory remains from that
research pass.
Research and working decisions; no implementation is recorded here. This
document supports Evals and the [Artifact Model Initiative][artifact-model].
Its Change index and Arc hold the current implementation runway; the broader
options and future requirements remain here. This document does not supersede
an ADR by itself.

## Recommendation and reading guide

Evolve toward immutable content in CAS, searchable authored items in SQL,
and explicit relationships for curation and history. Generated content should
be usable without a generic SQL `Artifact` row. Keep explicitly curated param
candidates, with flow-level matching by param name as the new default.

The current working direction is stable saved-artifact identity with fixed
content references, deferring revision records and content editing. The revision
models and tradeoffs below remain future design research. SQL revision rows are
the preferred option to revisit when history is needed; CAS revision manifests
remain an alternative if portable histories or reconstruction without SQL become
requirements.

### Current working direction: revisions deferred

- Give each saved artifact a stable ID separate from its content hash.
- Keep editable names, descriptions, and curation relationships attached to
  that identity, with explicit relationship tables.
- Keep its content hash and declared media type fixed. Changed content creates
  a new saved artifact; metadata can still be edited.
- Keep runs connected to the exact content hashes they used.
- Add revisions later by turning each existing item's fixed content reference
  into its initial revision, preserving item IDs and their relationships.

Deferring revisions reduces the initial schema/API work without abandoning
history. It does not promise a migration with no consumer changes: future
curation and composition behavior must decide whether to pin a revision or
follow an item's current revision. Preserve the current identity boundary and
fixed content so that decision does not require reconstructing lost history.

### Current working direction: associations and param candidates

Use `ArtifactItem`, `ArtifactFlow`, `ArtifactFlowVersion`, and
`ArtifactParamCandidate` for the initial proposal. Adding a relationship
preserves other relationships; removal is explicit. Creating another saved
item with identical bytes gives it independent metadata and relationships.

Param candidates target `(artifactItemId, flowId, paramName)`. A version's
picker matches its parent flow and declared param name, then filters for
compatibility with that version's param definition. Candidates become available
across matching versions without copying rows; the user still selects the
actual input. Creating an item from a param associates it with the flow by
default, so the current Share toggle is not required for that path.

Version-specific artifact visibility remains expressible through
`ArtifactFlowVersion`, for example for templates referencing particular steps.
Per-version param candidates, exclusions, revision pins, and richer sharing UI
are deferred. Keep candidate lookup behind a repository/service operation so
later policies do not spread through the frontend. Proper multiple-version
authoring is not a prerequisite for this catalog work.

### Starting point and reading guide

The current runway starts with the catalog schema, repository, and legacy-data
mapping, followed by API/authoring and browsing/param selection. It is recorded
in the [Artifact Model Initiative][artifact-model]. Extracting content writing
from SQL registration remains a small independent option in the staged
migration below; it need not precede the catalog work. Switching the worker to
content-only writes has additional consumer prerequisites described below.

Read [requirements](#requirements-and-anticipated-workflows) and
[the candidate model](#candidate-sql-model) for the proposed destination, then
[the migration stages](#staged-migration) for how to approach it. The inventory
and storage tradeoffs explain why those stages are needed.

## Requirements and anticipated workflows

### Confirmed direction

- Keep work small enough to review personally. Evals should produce useful
  product behavior before a full backend architecture refactor is complete.
- Support the worker writing content to S3 or filesystem CAS without SQL.
  A generated hash does not automatically need a searchable catalog entry.
- Replace the overloaded artifact model: catalog identity, content, flow
  associations, and param curation have different responsibilities.
- Preserve one shared artifact authoring experience, including editable
  display metadata. Composition authoring should reuse that experience.
- Preserve explicitly curated run-param candidate lists. The current version
  scope becomes flow ID plus param name by default, with compatibility checked
  against the selected version. Content-type compatibility alone does not make
  an arbitrary artifact a candidate.
- Author a reusable text/Markdown composition that selects params, outputs,
  and exports from a source run. Materialize it lazily into an ordinary CAS
  artifact, then supply its reference to an ordinary evaluator flow.
- Keep historical runs connected to the exact definitions and input content
  they used. An edit must not change the meaning of an earlier evaluation.
- Support eventual editing/history for authored artifacts. SQL versus CAS
  placement of revision history is still open.
- Defer revisions for the initial catalog replacement. Allow creation and
  metadata edits only; changing content creates a new saved artifact.
- Defer per-version candidate exclusions and a broader sharing UI redesign.
  Adjust existing authoring, browsing, and selection only as needed to adopt
  the normalized relationships and the new candidate default.

### Anticipated requirements, not prerequisites

| Workflow                               | Information worth preserving                                                                                      | What need not be built now                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Evaluate one step from a completed run | Source run and target, template content, selected source content, rendered input, evaluator definition and params | Generic evaluation orchestration                |
| Golden datasets                        | Stable case identity, exact inputs and expected answers, dataset membership at evaluation time                    | Dataset editor, batching, metric library        |
| A/B comparisons                        | Both candidate runs/configurations, common case or dataset snapshot, evaluator/rubric snapshot, repeated trials   | A fixed pairwise result schema today            |
| Prompt improvement by an LLM           | Candidate prompt content, derivation from an earlier candidate, producing run, evaluations, accepted selection    | Git branches, merge UI, autonomous optimization |
| Flow evolution                         | Stable flow identity, immutable definition snapshots, which snapshot each run used                                | Full publishing/versioning UI                   |

These use cases explain why identity and snapshots matter. They do not imply
one universal revision table for flows, datasets, prompts, and executions.
An LLM-produced candidate may later become a catalog item: catalog membership
means deliberately retained/findable, not necessarily human-authored bytes.
Parallel candidates also need not form a single linear revision chain.

Still open: cross-run/global artifact search, binary composition attachments,
branching histories, portable bundles, and whether composition compatibility
should eventually span several flow definitions. No schema should claim to
solve those requirements implicitly.

## What exists, and what actually depends on it

The [API usage audit][api-audit] is a useful starting point, but it predates
some current behavior. The [earlier proposal][old-proposal],
[review][old-review], and [reconciliation][old-reconciliation] already debated
Git-like objects and SQL provenance. This pass rechecks their relevant claims
against source rather than treating either proposal as an accepted design.

| Area              | Current evidence                                                                                                              | Migration consequence                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Content writing   | [ArtifactWriter][writer] encodes content, hashes bytes, writes CAS, then always calls the SQL repository                      | Extract a shared content writer; keep encoding/hashing out of worker business logic  |
| Content reading   | [ArtifactReader][reader] and `ArtifactService.getArtifact()` already read CAS without SQL                                     | Basic preview/download need no global content catalog                                |
| Worker host       | [Worker host assembly][worker-host] constructs SQL solely for the artifact repository                                         | Remove that client/config/lifecycle dependency when its writer is switched           |
| Authored content  | [ArtifactService][artifact-service] creates a curated artifact; `PATCH` changes metadata by hash                              | Introduce stable item identity before multiple authored items can share bytes        |
| Inline run inputs | `ArtifactService.storeInputArtifact()` saves uncurated content, then reloads its SQL index row                                | This caller also needs a content-write result independent of SQL                     |
| Run submission    | [RunService][run-service] rejects a supplied param hash unless `getArtifact(hash)` finds a SQL row                            | A CAS-only materialization cannot yet be passed directly to a run                    |
| Run outputs       | `RunService.getRunOutputs()` uses SQL metadata to avoid loading large/binary bodies, with a CAS fallback                      | Removing SQL rows currently causes additional body reads; add metadata-only lookup   |
| Run history       | [Run tables][schema] store params, outputs, exports, and definition hashes without foreign keys to `Artifact`                 | Preserve these owner references even when per-hash catalog rows stop being written   |
| Run consumers     | [PrismaRunQuery][run-query] supports fork reuse; run output APIs and [EvalService][eval-service] also consume persisted steps | These projections are operational data, even where the frontend ignores their fields |
| Artifact panel    | [Panel hook][artifact-panel] queries SQL metadata by hash and version                                                         | Content can render without a row, but metadata editing currently cannot              |
| Param picker      | [RunInputRow][param-picker] filters curated candidates by version, param name, and content type                               | Replace version-scoped curation with flow/name matching and version compatibility    |
| Selected params   | [Flow graph hook][flow-graph] also fetches all artifacts; the picker uses that list to describe selected hashes               | Replace selected-value lookup before generated content disappears from that list     |

The picker already displays a selected compatible artifact outside its curated
candidates, but only when the artifact is present in its general list. A
generated eval input needs an explicit descriptor/lookup, not a fabricated
curation row.

Two historical claims require correction:

- **Param curation already has a relationship table.**
  `ArtifactParamCuration` joins hash, flow version, and param name. The gaps
  are its dependence on a global hash row, the single-valued flow/version
  columns, and conflation of catalog membership with `curated`. Replacing it
  must preserve its useful relationships.
- **The current writer does not guarantee the ADR's curation preservation.**
  [ADR-0003][adr-curated] relies on system writes omitting curation fields.
  Today the writer explicitly supplies `curated: false`, and the
  [repository][artifact-repository] copies it into its upsert update. By code
  inspection, saving the same content through a system path can clear that
  flag. This was not reproduced against a live database in this research.
  Include the scenario in regression coverage when changing the write path.

An association limitation was rechecked on 2026-10-08. The repository replaces
param-curation rows only within the edited version, but overwrites the artifact's
single `flowVersionId`. The picker queries the artifact list using that column,
so adding it under another version can make it disappear from the old version
even when the old curation row remains. This is code-inspected behavior, not a
live database reproduction. Separate association rows and relationship-based
list queries must prevent that disappearance.

## Metadata placement starts with queries

| Question or fact                                    | Proposed owner                                               | SQL required for every blob?             |
| --------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| Fetch bytes by hash; find byte size                 | CAS and a content-description operation                      | No                                       |
| Decode/render a particular use of those bytes       | Content reference/revision with its declared media type      | No                                       |
| Browse named items, rename one, search descriptions | Authored-item catalog                                        | Only cataloged items                     |
| Offer candidates for a flow-version param           | Flow/name candidate relationships plus version compatibility | Only curated candidates                  |
| Show a historical run's inputs, outputs, exports    | Run persistence and content references                       | Owner records, not a generic blob row    |
| Browse edit history                                 | SQL revisions or a revision-manifest index                   | Depends on revision design               |
| Explain how a composition was rendered              | Materialization/evaluation record and its source references  | A record per materialization if retained |
| Search all generated audio across every run         | A future query-specific index                                | Unconfirmed requirement                  |

S3 supports object metadata and metadata retrieval without loading the body.
It also has an AWS-managed metadata-table service; saying "S3 cannot search
metadata" would be inaccurate. That service does not by itself supply this
application's curation relationships or a portable filesystem/MinIO design.
Prefer SQL for the product queries already identified.
Sources: [S3 object metadata][s3-metadata], [HeadObject][s3-head].

Add a store-level `describe`/`stat` capability returning existence, size, and
the stored media-type hint. S3 can implement it with `HeadObject`; filesystem
storage can read the sidecar and stat the content. Keep missing content and
storage failures distinct. This avoids downloading audio just to validate a
param. SQL may cache descriptors for catalog lists without becoming an
existence requirement for generated content.

### Media type is not determined by the current hash

The hash is SHA-256 of encoded bytes. The same bytes may be plain text,
Markdown, or JSON. Therefore `contentType` is a declaration about their use,
not an intrinsic consequence of the hash. `size` is intrinsic to those bytes;
labels, filenames, and source-run relationships are contextual.

This is already observable in the implementations: [filesystem CAS][fs-store]
returns early on an existing hash, preserving the first declared type;
[S3 CAS][s3-store] unconditionally puts the object and its latest declared
type. The current reader's explicit-type overload checks that stored type.
Two saves of identical bytes as text and Markdown can therefore behave
differently depending on the backend.

Three approaches deserve an explicit decision:

| Approach                                                    | Benefit                                                       | Cost                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| One declared type per hash, reject conflicting declarations | Keeps hash-only references and provides predictable behavior  | Legitimate reuse of identical bytes as different types is rejected; conflict handling must agree across stores |
| Byte hash plus declared type on each durable reference      | Preserves deduplication and supports multiple interpretations | Requires gradual changes to readers, run/job references, and HTTP responses                                    |
| Hash a typed descriptor/envelope and reference that         | Content and interpretation have one immutable reference       | Adds an object/lookup layer and migration of the meaning of an artifact hash                                   |

Recommended destination: explicit references containing a byte hash and media
type. Start by giving new saved items/materializations that information. Existing
hash-only APIs can continue resolving through stored metadata during migration.
An explicit reader must validate/decode according to the reference contract;
the existing overload cannot simply be reused because it checks object metadata.
Validate supported interpretations when creating the reference.

Before switching broad write traffic, settle consistent conflict behavior for
the remaining hash-only callers. Do not silently trust whichever backend's
metadata wins. This decision can be its own small Change and does not require
the event JSON Schema migration.

S3 conditional writes can protect an object key from replacement, but they do
not resolve the meaning of two different media-type declarations. Any chosen
write-once policy also needs equivalent filesystem behavior and verification
against the supported S3-compatible backend.
Source: [S3 conditional writes][s3-conditional].

## Candidate SQL model

These are responsibilities and proposed names, not a final Prisma schema.
Use `ArtifactItem` to distinguish the new catalog identity from today's
hash-keyed `Artifact` table. The current proposal is:

| Entity                   | Main fields                                                              | Key constraint                           |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| `ArtifactItem`           | ID, name, optional description, fixed content hash/type/size, timestamps | Content hash is not unique item identity |
| `ArtifactFlow`           | Item ID, flow ID                                                         | Unique item/flow pair                    |
| `ArtifactFlowVersion`    | Item ID, flow-version ID                                                 | Unique item/version pair                 |
| `ArtifactParamCandidate` | Item ID, flow ID, param name                                             | Unique item/flow/param tuple             |

The shorter relationship names replace the earlier `ArtifactFlowAssociation`,
`ArtifactVersionAssociation`, and proposed `ArtifactParamCuration` names.
The existing legacy `ArtifactParamCuration` table remains part of the source
inventory, not the new schema. New candidate relationships refer to item IDs.

The earlier revision-bearing model is retained below as future research. Its
version-specific curation was an earlier alternative; the new initial default
is flow/name matching. Neither revision rows nor version-specific candidate
policies are required for the initial schema.

| Entity                       | Owns                                                                                | Key constraint                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ArtifactItem`               | Stable ID, display name, optional description, current revision, catalog timestamps | Content hash is not unique item identity                                             |
| `ArtifactRevision`           | Item ID, immutable content hash/type/size, sequence or creation order               | Every revision belongs to one item; a current revision must belong to that same item |
| `ArtifactFlowAssociation`    | Catalog visibility/relevance for a stable flow                                      | Unique item/flow pair                                                                |
| `ArtifactVersionAssociation` | Catalog visibility/relevance for a specific flow version                            | Unique item/version pair                                                             |
| `ArtifactParamCuration`      | A candidate for one flow-version param                                              | Explicit target and unique candidate/version/param tuple                             |

Two items may reference identical content while having different names and
associations. Editing one must not rename, re-scope, or advance the other.
Promoting a generated result creates a catalog identity referencing existing
content; it does not copy the blob or redefine who originally produced it.

`name` would replace the current user-facing `label`; a temporary API mapper
can preserve the old field. `description` is optional item metadata, while
upload filename is separate. Renaming an item need not create a content
revision. If a historical label matters for a report, snapshot it in that
report rather than interpreting the current name as historical truth.

Flow/version associations describe availability in an authoring context.
Param candidates describe a more specific choice offered at run setup. A
version's artifact list can include direct version associations and associations
to its parent flow. Param candidates require an explicit flow/name relationship
and compatibility with the selected version's definition. Creating a candidate
also creates its flow association transactionally, making the item discoverable.
Adding availability elsewhere must not move or erase an earlier relationship.

The current "Share" switch writes a flow ID while listing code can still filter
by the exact version. The new create-from-param default is flow-wide availability
and flow/name candidates. Adjust that path without a broader sharing-controls
redesign. Preserve existing association data during the migration; do not infer
its original intent solely from the toggle label.

When revisions are introduced, prefer **pinning a revision initially**. Editing a prompt
would leave existing recommendations unchanged until deliberately updated.
Following an item's current revision is another valid product behavior, but
must be explicit and revalidate compatibility at selection/submission. Every
run ultimately records the resolved immutable reference regardless of policy.

Param names can remain strings scoped to a flow. Validate them against the
selected version's definition when creating a candidate, and check compatibility
again when listing/selecting/submitting for a version. A renamed param stops
matching automatically. A separate Param
table would need synchronization with the JSON definition and is not required
just to normalize the artifact relationships. Enforce foreign keys and unique
constraints for actual SQL entities, and item/head ownership in the database
where representable or transactionally in the repository.

### Can the schema land without revisions?

Yes. A stable item with a fixed content hash/type and explicit relationship
tables already solves most of the catalog problem. Later, create its initial
revision and move those fields there. The restriction is that replacing content
before that transition loses the edit history we intend to provide.

This is the current working direction. Keep item IDs stable and metadata and
relationships independent of the content hash. When revisions arrive, backfill
one initial revision per item and migrate content lookups through it. Runs keep
their existing exact content references. Do not invent prior revision chains
from old labels or timestamps.

Initial revision rows were the earlier recommendation and remain a viable
alternative: they add a table and joins now but reduce later content-lookup
changes. We are deferring that structure because content editing and history
are not needed for the first slice. The future model, concurrency requirements,
and SQL/CAS history tradeoffs below are retained for that later work.

### Writes, concurrency, and failures

Write immutable content first. After it succeeds, commit the item and relevant
association changes together in SQL; include revision/head changes when those
are introduced. A SQL failure may leave unreferenced content; it must not return
a successful authored-item save.
An intentional CAS-only write has no SQL partial-success state.

When editing is added, include an expected current revision (or equivalent
concurrency token). Insert the revision and advance the head transactionally
only if that expectation still holds. A sequence number alone does not prevent
two tabs overwriting each other's current pointer. Creation retries also need
an idempotency key or equivalent application identity: deduplicated bytes do
not deduplicate newly generated item IDs. Prisma supports transactions and
optimistic concurrency patterns; the exact implementation must work with both
configured SQL providers. Source: [Prisma v7 transactions][prisma-transactions].

## SQL history versus Git-like manifests

Git separates content objects, trees grouping content, commits connecting
snapshots to history, and mutable refs selecting a head. That distinction is
useful here without adopting Git's object format or assuming every execution
is an authored revision. Sources: [Git objects][git-objects],
[Git references][git-refs].

| Option                                      | What SQL owns                                                   | Strength                                                      | Tradeoff                                                                                |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Fixed-content items, revisions later        | Names, fixed content references, associations                   | Smallest catalog replacement                                  | No content editing until history is added                                               |
| SQL items and immutable revision rows       | Catalog, history, current head, associations                    | Direct history queries and transactional changes in one place | SQL remains authoritative for history and must be backed up                             |
| CAS revision manifests plus SQL items/heads | Search, current selection, associations; optional history index | Portable immutable history and content can travel together    | Additional object writes, dependent reads, manifest schema/versioning, index rebuilding |

A CAS manifest might contain content hash/type, parent revision reference,
and provenance. Its hash identifies a revision; the byte hash identifies
content. Reverting to earlier bytes can still create a new revision. History
stored this way cannot be queried by arbitrary criteria without traversal or
an index, and losing SQL can still lose names, associations, and which heads
were selected unless those are separately backed up/exported.

When history is added, prefer SQL revision rows for the interactive workload.
Choose CAS manifests sooner if portable histories or SQL-independent
reconstruction are explicit goals. Exporting a snapshot manifest later can serve portability
without making both SQL rows and manifests competing authorities today.

S3 bucket versioning preserves versions of the same object key. It does not
connect different content hashes into one prompt's edit history and is not
a replacement for application revisions. Source: [S3 Versioning][s3-versioning].

## API and frontend continuity

Keep content retrieval and catalog operations distinguishable. Hash lookup
answers "show these bytes"; item lookup answers "show this authored thing and
its fixed content reference," eventually including its current revision.
They can live in one frontend API module and reuse the same editor/viewer.
They need not share an overloaded metadata request type.

| Existing operation                        | Migration direction                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/artifacts`                     | Create a catalog item with a fixed content reference, optionally with explicit associations; retain a request adapter during cutover        |
| `PATCH /api/artifacts/:hash`              | Move metadata/association edits to stable item identity; never arbitrarily select an item by shared content hash                            |
| `GET /api/artifacts`                      | Query catalog items/candidates; stop using global content inventory to describe selected run hashes                                         |
| `GET /api/artifacts/:hash` and `/content` | Preserve content preview/download; introduce unambiguous item routes separately when needed                                                 |
| Curated candidates                        | Match flow/param name and selected-version compatibility; return item identity and fixed content descriptor, adding revision identity later |
| Inline input upload / materialization     | Return content references directly; catalog creation is optional                                                                            |

Exact route spellings are an implementation decision. Adapt old clients until
their call sites are migrated, with one authoritative writer per concern in
each stage. Once duplicate-content items are possible, a hash-only metadata
edit becomes ambiguous: that is a cutover boundary, not a permanent alias.

Reuse content editing, content-type selection, display-name controls, and the
panel layout. Move associations into an explicit context section while keeping
them in the same user workflow. Metadata display for generated content should
show its content descriptor and known run context, with a deliberate action
to save it as a catalog item. The existing "metadata not found" state should
not become the normal generated-artifact experience.

Redux drafts and caches will need changes: current mutations patch lists by
hash and optimistically synthesize association data. Catalog selection/cache
identity must become item based, adding revision identity when needed; content
preview caches can stay hash based until typed references require a richer key.
Fetch selected content
descriptors independently of the curated candidates, including historical
params and prebound eval inputs. This preserves the dropdown without pretending
every selected value belongs in it.

## Flow versions and evaluations

### Flow identity

[FlowService][flow-service] currently creates a new `Flow` plus sequence-1
`FlowVersion` for each import. The table shape anticipates multiple versions,
but there is no append-revision operation. A run nevertheless records its
exact `flowDefHash` already.

Keep stable flow identity, immutable definition snapshots, and mutable catalog
metadata distinct. Hash the complete stored definition, including metadata.
The stored JSON is serialized from the parsed object, so this is not a promise
to retain the original uploaded file's whitespace. A future behavioral diff
or fingerprint may disregard presentation fields; it must not replace the
exact stored-content hash or claim equivalence of external API behavior.

Candidates target an existing Flow ID and param name, while the selected
FlowVersion supplies compatibility checks. Version-specific artifact visibility
uses existing FlowVersion IDs. Multiple-version authoring is not required to
normalize these relationships. When accepting both flow/version IDs and
definition hashes, validate that they agree; storing all three fields does not
enforce that relationship automatically.

Default composition compatibility to an exact source definition snapshot when
initially persisted. Broader compatibility may later be a checked set of
required references. Do not silently interpret "same Flow ID" as compatible
after params or steps change. Flows can keep their domain-specific revision
table even if prompts use generic artifact revisions.

### Composition and evaluator are different contexts

```text
template content + completed source run
                 |
          resolve and render
                 |
       rendered content reference
                 |
selected evaluator param + remaining normal params
                 |
          ordinary evaluator run
```

The source-flow context supplies reference suggestions and compatibility.
The evaluator-flow context supplies the receiving param. Authoring a template
under a source flow does not make it a ready input to an evaluator: the latter
needs rendered content from a chosen source run.

For an eval-launch workflow, supply the rendered reference directly to the
selected evaluator param, displaying it even if it is not curated there.
Other params retain their curated choices. Opening an evaluator flow normally
continues to show its ordinary curated inputs. A later explicit "compose from
run" input action could connect these workflows; it should not be implicit
dropdown behavior. `Flow.kind === "eval"` can categorize evaluator choices,
but a compatible input and explicit param mapping still need validation.

A persisted composition can reference a fixed-content catalog item plus its
source-definition compatibility. When content editing arrives, define whether
the composition pins a template revision or follows the item's current one.
Materialization records must always retain the exact template content used.
Reuse the item name/description; avoid a
second independently editable name for the same authored thing. No separate
composition-manifest artifact is required. The precise SQL extension or
relationship should be chosen when that authoring behavior is scoped.

The materializer itself can start from a template content reference and source
run ID. Reuse reference parsing/path traversal where appropriate, but
[the existing binder][binder] mutates a step object and formats objects using
`util.inspect`. It is not a Markdown renderer. Define supported reference
forms, escaping, deterministic JSON rendering, missing-value errors, and binary
handling explicitly. Use `steps.<id>.exports.<name>` consistently with existing
flow syntax; the discussion's singular `export` was illustrative. Missing or
unsupported references should fail visibly rather than silently omit context.

On materialization/launch, retain exact template and source definition
references, source run and target, resolved source content references, rendered
reference, evaluator definition and param bindings, and renderer version when
its behavior can evolve. Some facts can be reached through immutable owner
records rather than copied into every row. This preserves evidence of what was
evaluated; it does not promise identical future LLM responses.

### Future evaluation shapes

Dataset revisions need a fixed membership snapshot as well as per-case input
and expected-answer references. A/B evaluation needs both subjects and their
labels/order, plus shared case/evaluator context. Prompt optimization needs
candidate derivation and the producing run; automatically generated candidates
should not all advance one shared "current prompt" head.

These are later domain relationships. The existing `EvalResult` and
`EvalService` are single-target, and [the result sink][eval-sink] expects
`judge.score` and one score payload. Revisit those contracts when adding new
evaluation modes. Do not force golden cases and pairwise outcomes into nullable
columns on the current single-target record during the artifact migration.

## Run persistence, provenance, and retention

Keep run-owned references while removing generic per-hash catalog writes.
The existing [SQL projection sink][run-sink] coalesces events and upserts step
state, then persists terminal run status after its step writes. The eval sink
has a separate completion race/retry path. Completed-event delivery alone is
not evidence that every consumer has persisted its view.

For initial composition, read a completed persisted run and verify the required
refs are available. Replacing these projections with a final CAS run manifest
would also require incomplete/failed-run persistence, restart/replay behavior,
attempt identity, and reliable publication of that manifest. That is a separate
decision; removing SQL from the worker does not require it.

Do not treat two runs producing the same hash as one occurrence, or output
differences across executions as authored revisions. Record provenance on
relationships: run/step/export, revision author or producing run, and
materialization sources. Use separate fields for role identifiers rather than
concatenated strings that can collide with dotted step or export names.

There is no GC capability on the current artifact store port. Do not introduce
deletion as part of this migration. Future retention must cover catalog
revisions, curation pins, flow definitions, run inputs/outputs, fork specs,
materializations, datasets, and in-flight writes. Content created before an
owner-record failure can be orphaned; solving that needs grace/reconciliation
rules. SQL catalog absence is never sufficient evidence that a blob is unused.

## Staged migration

Stages are dependency boundaries, not preassigned Changes or a commitment to
finish the entire list before returning to Evals. Split a stage when its
persistence, service, and UI work makes review too large. The approach follows
expand/migrate/contract: add the new representation, move consumers, then retire
the old one. Source: [Prisma data migration guide][prisma-migration].

### Independent option: extract content writing

Extract encoding, hashing, and CAS persistence into a content writer; make
the current catalog writer delegate to it. Keep current callers' behavior and
error contracts during this extraction. Prove the new capability saves and
reads content without any SQL repository and preserves current content hashes.
This was the earlier recommended first small Change and requires no schema
decision. The current scaffold starts with catalog work; retain this option
for when content-only writes are scoped.

The media-type contract and metadata-only lookup can be follow-up Changes.
Alternatively, schema work below can start immediately alongside the retained
legacy writer; the extraction is not a prerequisite for reviewing the schema.

### Expand the authored catalog schema

Introduce stable fixed-content items and the associations that preserve the
current UI workflows. Defer revision records and content editing. Add a
repository boundary with create/get/list and metadata updates. Content edits
can wait. Validate same-content/different-item independence and exact candidate
queries with fixtures before planning the frontend cutover.

The repository currently uses Prisma v7. The authored [SQLite schema][schema]
generates the Postgres schema. Changes
need committed migrations for both providers and provider-parity tests. Follow
the repository's common subset and [migration checks][migration-checks]; avoid
designing around a Postgres-only constraint/index without a SQLite equivalent.

Initial candidate fixtures should cover matching names across two versions of
one flow, renamed/incompatible params, isolation between flow IDs, and additive
associations. Version-specific candidate exclusions remain later work.

### Import existing catalog intent, then move authoring and selection

Use a repeatable mapping from legacy hash to new fixed-content item. Inventory
`curated`, labels, flow/version associations, and param-curation rows together;
the flag alone may miss intentionally retained content. Do not catalog all
generated hashes just to copy the old table. Ambiguous candidates should be
reported for review and retained in legacy storage until resolved.

Preserve known associations and names. The old model cannot recover two
independent authored identities collapsed into one hash, old labels overwritten
by updates, or revision lineage that was never recorded. Preserve available
facts and document those limits. Existing run hashes require no rewriting.

Legacy param-curation rows become flow/name candidates through their versions'
parent flow IDs. Deduplicate identical item/flow/param tuples while preserving
available flow/version visibility. Report that this deliberately broadens
candidate availability across compatible versions. Do not fabricate version
associations or histories that the old single-valued columns have already lost.

For the local app, prefer a short write pause for final backfill/reconciliation
and writer cutover over an indefinite two-way synchronization scheme. Confirm
what local data must be preserved first; old ADR claims about no production
users are not permission to reset a current database. Keep a mapping and backup
through verification. Rolling deployments would need a separately designed
compatibility window.

Move the authoring mutation, metadata panel, explorer, and curated-param queries
in reviewable groups through a temporary API adapter. Verify create-from-param,
returned selection, reopening, rename, and cross-version associations. End
hash-addressed metadata edits before allowing independently named duplicate
content. Keep old read responses only as long as known consumers need them.

### Make content consumers independent of catalog membership

Change run-param validation to verify content existence/type through the content
capability, while checking parameter declarations separately from curation.
Update output description, selected-param display, and generated-artifact
metadata/promotion. A missing catalog row becomes normal; missing CAS content
still fails. Keep the existing curated candidate list intact.

Exit evidence: a generated artifact without a catalog row can be viewed,
downloaded, used as a compatible run param, and reopened from run history.
Missing/incompatible inputs still fail. Metadata lookup must not load an entire
binary body. Cover filesystem and S3-compatible behavior, including duplicate
bytes and media-type declarations.

### Switch generated writers and remove worker SQL

Move worker output/export writes to the content writer and remove SQL client
assembly, configuration, packaging assumptions, and lifecycle requirements
from the worker host. Migrate inline inputs and other hash-owned writes
separately as useful. Keep run projections and result references functioning.

Exit evidence: a remote worker starts and executes without SQL configuration;
its outputs remain usable by the application. This is a deployment behavior
change as well as a class refactor. Retire the legacy table/types/routes only
after their remaining consumers and import mapping have been accounted for.
Supersede [ADR-0002][adr-associations] and [ADR-0003][adr-curated] when their
replacement is chosen and implemented.

### Resume Evals and add history behavior when useful

The pure composition renderer can be built at any stage. Materialization needs
the content writer and persisted run references. Launching a CAS-only result
needs catalog-independent run validation. A shared saved-composition authoring
UI benefits from the catalog/API transition. These are distinct dependencies;
there is no need to finish worker deployment cleanup before proving rendering.

Append-revision editing, history UI, explicit flow revision creation, dataset
snapshots, and richer comparisons can follow when their workflows need them.
If Evals gets priority before catalog migration, keep its first slice a
hash-based materialization service; defer a second permanent authoring API.

## Decisions to settle at each boundary

Before the writer extraction: only its ownership, return shape, and preservation
of existing hashes/error behavior. Before the first catalog migration:

- Display name/description ownership and what promotion creates.
- Exact flow/version visibility and param-candidate query behavior.
- Legacy import classification and treatment of ambiguous records.

The initial catalog uses fixed-content items with revisions deferred. Before
adding content editing, revisit SQL rows versus CAS manifests, backfill initial
revisions, and decide whether curation/compositions pin revisions or explicitly
follow the current one. The revision research above remains relevant to that
boundary.

Before broad CAS-only writes: media-type conflict policy, metadata-only lookup,
catalog-independent validation, and generated-content UI handling. Before
composition implementation: reference syntax/rendering rules, compatibility,
and the records that retain materialization inputs/results.

Portable history manifests, branching, dataset schema, flow publishing, global
generated-content search, and run-projection replacement remain later decisions.
The first useful outcome is a coherent content/catalog boundary with the
existing authoring experience retained and flow-level param candidates adopted.

[artifact-model]: ../../artifact-model/INITIATIVE.md
[api-audit]: ../../../api-usage-audit.md
[old-proposal]: ../../worker-tools-artifacts/research/artifact-versioning-and-gc.md
[old-review]: ../../worker-tools-artifacts/research/artifact-versioning-and-gc-review.md
[old-reconciliation]: ../../worker-tools-artifacts/research/artifact-versioning-and-gc-reconciliation.md
[adr-associations]: ../../../adr/0002-artifact-flow-association-schema.md
[adr-curated]: ../../../adr/0003-artifact-curated-flag.md
[writer]: ../../../../packages/artifacts/src/artifact-writer.ts
[reader]: ../../../../packages/artifacts/src/artifact-reader.ts
[worker-host]: ../../../../apps/worker-host/src/profile/worker-host.profile.ts
[artifact-service]: ../../../../packages/app-services/src/artifact.service.ts
[artifact-repository]: ../../../../packages/adapters/src/artifact-repository/prisma-artifact-repository.ts
[run-service]: ../../../../packages/app-services/src/run.service.ts
[schema]: ../../../../packages/db-prisma/prisma/sqlite/schema.prisma
[run-query]: ../../../../packages/adapters/src/run-query/prisma-run-query.ts
[eval-service]: ../../../../packages/app-services/src/eval.service.ts
[artifact-panel]: ../../../../apps/workbench/src/components/workbench/artifact-panel/use-artifact-panel.ts
[param-picker]: ../../../../apps/workbench/src/components/workbench/flow-graph-panel/side-panel/RunInputRow.tsx
[flow-graph]: ../../../../apps/workbench/src/components/workbench/flow-graph-panel/use-flow-graph-panel.ts
[fs-store]: ../../../../packages/adapters/src/artifact-store/fs-artifact-store.ts
[s3-store]: ../../../../packages/adapters/src/artifact-store/s3-artifact-store.ts
[flow-service]: ../../../../packages/app-services/src/flow.service.ts
[binder]: ../../../../packages/functional-core/json-ref-binder/src/bind.ts
[eval-sink]: ../../../../packages/components/observability/src/sinks/eval-result-projection.sink.ts
[run-sink]: ../../../../packages/components/observability/src/sinks/sql-run-projection.sink.ts
[migration-checks]: ../../../../packages/db-prisma/scripts/check-migrations.mjs
[s3-metadata]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html
[s3-head]: https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
[s3-conditional]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html
[s3-versioning]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html
[git-objects]: https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
[git-refs]: https://git-scm.com/book/en/v2/Git-Internals-Git-References
[prisma-transactions]: https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions
[prisma-migration]: https://www.prisma.io/docs/guides/v7/database/data-migration
