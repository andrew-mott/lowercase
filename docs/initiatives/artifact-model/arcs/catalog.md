# Artifact Model — Arc A1: Catalog identity and relationships (Changes C1–C3)

**Next:** — none yet

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep
that doc scannable. This Arc replaces the catalog's overloaded identity and
relationships, then adopts them in the existing artifact authoring and
run-input workflows. Broader options remain in the
[artifact-model research](../../evals/research/artifact-model.md).

## Change C1 - Catalog schema, repository, and legacy import - not started

Introduce the normalized catalog alongside the existing model, with repository
operations and a repeatable import path for retained catalog data. This is the
first implementation candidate; its exact migration boundary needs review
before building.

### Discussion

**Initial schema proposal:**

| Table                    | Main fields                                                        | Unique key                          |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------------- |
| `ArtifactItem`           | ID, name, optional description, content hash/type/size, timestamps | Item ID; content hash is not unique |
| `ArtifactFlow`           | Artifact item ID, flow ID                                          | Item/flow                           |
| `ArtifactFlowVersion`    | Artifact item ID, flow-version ID                                  | Item/version                        |
| `ArtifactParamCandidate` | Artifact item ID, flow ID, param name                              | Item/flow/param                     |

The names are agreed working names; this is not yet a final Prisma schema.
Upload filenames remain distinct from names/descriptions. Decide their storage
and how missing legacy labels map to item names before finalizing the fields.

Content hash/type/size are fixed for an item's lifetime in this first model.
Creation and metadata editing are supported; changing content creates a new
item. Two items may refer to identical bytes while keeping independent names
and associations. Reusing an existing item shares that item's metadata.

No revision table or current-revision pointer is needed initially. Later,
backfill one initial revision from each item's fixed content fields, preserving
item IDs. Future curation/composition pinning and content editing remain open;
the research keeps the SQL/CAS history alternatives and concurrency concerns.

**Relationships and queries:**

- `ArtifactFlow` makes an item available within a flow. A version's artifact
  list includes its parent flow's items and directly associated version items.
- `ArtifactFlowVersion` preserves version-specific visibility, useful for
  content tied to an exact definition. It is not a param-candidate override.
- `ArtifactParamCandidate` offers an item for a flow's named param across
  versions. Match the flow ID and param name, then filter against the selected
  version's param definition. Renamed or incompatible params stop matching;
  unrelated flows do not inherit candidates with the same name.
- Creating a candidate creates its flow association in the same transaction.
  Validate the param against the version used to create it. Keep later lookup
  policy behind a repository/service operation.
- Adding another relationship preserves existing ones. Removal affects the
  explicitly selected relationship; association APIs must not silently move
  an item between contexts.

Param names remain strings rather than independently managed SQL entities.
Enforce foreign keys to real entities and unique relationship tuples. Candidate
availability does not automatically select the input; runs retain the exact
content hash used. Per-version candidate exclusions and richer sharing controls
are deferred, as is multiple-version flow authoring.

**Repository and migration boundary:**

Add create/get/list, metadata updates, and relationship operations with provider
parity for SQLite and Postgres. Cover duplicate-content item independence,
additive associations, and candidates across matching, renamed, incompatible,
and unrelated-flow params. Do not couple catalog existence to all CAS content.

Inventory legacy `curated`, labels, flow/version fields, and param-curation rows
together. Define a repeatable legacy-hash-to-item mapping without importing
every generated blob. Preserve available names and associations; report
ambiguous records rather than inventing lost identity or relationship history.
Translate legacy param curations through their versions' parent flow IDs and
deduplicate matching tuples. This intentionally broadens availability across
compatible versions and must be visible in migration review.

Prepare the import and reconciliation mechanism without assuming permission
to reset a database or run it against existing data. The old writer remains
authoritative until the API/UI cutover; plan final reconciliation around that
boundary so writes after an initial import are not lost. Preserve existing
run hashes and content bytes. The legacy catalog stays until consumers migrate.

**Before implementation:** settle the exact fields, legacy-data preservation
needs, import classification, and coexistence/cutover arrangement. Review the
remaining media-type conflicts identified in research before exposing new write
behavior; storing a declared type does not by itself fix the current CAS policy.
Split C1 if schema/repository and legacy import are too large to review together.

## Change C2 - Catalog API and artifact authoring - not started

Move saved-item creation and metadata editing to stable item identity while
reusing the existing artifact authoring experience.

### Discussion

Creation returns an item identity and fixed content descriptor. Metadata and
association edits target the item, so identical hashes cannot pick an arbitrary
catalog entry. Creating another item with the same bytes remains independent;
explicitly reusing an item adds relationships to that item.

Create-from-param saves a flow association and flow/name candidate by default.
The Share toggle is unnecessary for that path. Adapt the editor, metadata panel,
and caches enough to support these rules; defer a broader sharing UI redesign.
Content preview/download remains hash-addressed.

Define the compatibility adapter and authoring/selection handoff with C3 before
cutover. Existing create-from-param and reopening behavior must remain usable
between Changes. Reconcile legacy writes before changing authority; avoid an
indefinite second catalog API or ambiguous hash-based metadata editing.

## Change C3 - Catalog browsing and param choices - not started

Adopt relationship-based lists and flow-level candidates in the artifact explorer
and run-input picker, completing the initial catalog UI transition.

### Discussion

Use stable item identity for catalog selection/caches and content hashes for
actual run inputs. The version's picker resolves its flow/name candidates and
checks compatibility against that version. Verify adding an association does
not make an item disappear from its earlier contexts.

Reopening run history must still describe the exact selected content even when
it is outside the candidate list. Keep selected-content lookup distinct from
candidate discovery; broader CAS-only input support remains a later boundary.

Coordinate final catalog cutover with C2 and preserve available legacy data.
Proper flow version authoring, per-version exclusions, revision selection, and
a full artifact-panel redesign remain deferred. Narrow or split this Change
after inspecting the actual frontend dependencies.
