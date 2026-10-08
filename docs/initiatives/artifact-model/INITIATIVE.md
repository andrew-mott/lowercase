# Artifact Model

## Summary

Replace the overloaded hash-keyed artifact catalog with stable saved-artifact
identity and explicit relationships. Saved items have independent editable
metadata and fixed content references; flow-level param candidates remain
available across compatible versions. Content in CAS can eventually be used
without a catalog row, supporting Eval materialization and workers without SQL.

Scaffolded as I8; implementation not started. The initial runway covers the
catalog and existing authoring/selection workflows. Evals remains a separate
[Initiative](../evals/INITIATIVE.md).

## Design principles

- Separate saved-item identity from content hash. Identical bytes may belong
  to independent saved items with different metadata and relationships.
- Keep content fixed initially. Metadata can be edited; changed content creates
  a new item. Preserve the path to revisions without building history now.
- Store relationships explicitly. Adding an association preserves existing
  ones; removing an association is deliberate.
- Share param candidates within a flow by param name, checking compatibility
  against the selected version. Availability does not select a run input.
- Preserve exact content references in runs and available legacy catalog intent.
  Generated content does not inherently require searchable catalog metadata.
- Keep Changes reviewable. Broader sharing UX, flow version authoring, and
  backend architecture work must not become prerequisites for useful Evals.

## Change index

| Change | Description                        | Status      | Where | See also |
| ------ | ---------------------------------- | ----------- | ----- | -------- |
| C1     | Catalog schema, repository, import | not started | [1]   | [2]      |
| C2     | Catalog API and artifact authoring | not started | [1]   |          |
| C3     | Catalog browsing and param choices | not started | [1]   |          |

## Next up

1. **C1:** Finalize the initial schema and repository boundary, then define a
   repeatable import of existing catalog intent. Inspect preservation needs
   before implementing or running any data migration.
2. **C2:** Move catalog creation and metadata editing to stable item identity.
3. **C3:** Adopt relationship-based browsing and flow-level param candidates.

This is a provisional runway; split or reorder the uncommitted Changes if the
API/UI cutover is too large to review together.

## Not yet scoped

- Content writer extraction, metadata-only store lookup, and media-type policy.
- Catalog-independent run validation, selected-content display, and generated
  artifact viewing/promotion, enabling CAS-only Eval inputs.
- Switching generated writers and removing the worker's SQL dependency.
- Artifact revisions, history UI, per-version candidate exclusions, and richer
  sharing controls. Proper flow version authoring remains separate work.
- Legacy retirement and replacement ADRs after the new boundaries are adopted.

The [research][2] retains revision alternatives, storage tradeoffs, provenance,
and future Eval requirements. Its broader stages are not additional commitments
in this Change index.

[1]: ./arcs/catalog.md
[2]: ../evals/research/artifact-model.md
