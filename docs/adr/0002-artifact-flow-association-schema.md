# ADR-0002: Artifact-to-flow association schema for Artifacts mode

Date: 2026-07-21
Status: Accepted

## Context

Artifacts mode (the next `apps/workbench` workspace mode, not yet built) needs a way for someone to create an artifact and deliberately associate it with a flow version — so that other pages (Sims, Run mode) can offer a curated, named set of artifacts to pick from for a run param, instead of every artifact that has ever existed globally.

Today's `Artifact` table (`packages/db-prisma/prisma/schema.prisma`) has zero relations to anything — just `hash`, `time`, `label`, `filename`, `contentType`, `size`, `format`. Flow params themselves aren't modeled in SQL at all: `RunParam` ties a value to a bare `name: String` on a specific run, with no relation to any param-defining entity — the flow definition's own JSON (in CAS) is the only place a param's existence/type is recorded. The wider SQL schema was originally optimized for the fewest tables and simplest queries, to get off the old filesystem-based store — not for the most accurate structure — and is understood to have real gaps as a result.

No production data or users exist against this schema, so getting a first version of this wrong is cheap to fix later; this isn't a decision that needs to anticipate every future shape.

## Decision

In short: params stay unmodeled in SQL, referenced by bare string; `Artifact` gains nullable `flowId`/`flowVersionId` for scope, writable only by deliberate curation (never automatically by the worker); a new join table handles param-level curation; usage-provenance needs no new schema; content-creation-provenance is deferred, with its future shape documented rather than built now.

**Params are referenced by bare string, never materialized as their own table.** This matches an existing, consistent precedent already in the schema: `RunStepProjection.stepId`, `RunStepExport.name`, and `RunParam.name` are all bare strings scoped implicitly by a run's `flowVersionId`, with the flow definition JSON as the sole source of truth for what they mean. A materialized `Param` table would need reconciling whenever a flow definition changes; a bare-string reference just goes stale the same way a renamed step id already can — a risk that's structurally closed off once flow versions get real publish/immutability semantics (not yet built): a param rename would require a new flow version anyway, since prior runs' `RunParam` rows reference the old definition and that history doesn't get rewritten.

**`Artifact` gains two new nullable columns: `flowId String?` and `flowVersionId String?`**, for flow/flow-version scope — the same dual-FK shape `Sim` already uses, just nullable (an artifact can be unscoped/global). Deliberately single-valued per artifact for now (one artifact belongs to at most one flow version, or one flow, and is always additionally considered global) rather than a many-to-many join table — the actual current need is single-valued, and upgrading to a join table later is a cheap, mechanical migration given there's no production data to preserve.

**These two columns are written only by the deliberate curation action (Artifacts mode's create/associate flow), never automatically by the worker when a run produces an export.** This is the load-bearing part of the decision: without this restriction, every incidental run byproduct would also carry a `flowVersionId`, and a "show me the artifacts curated for this flow version" query would be swamped by unlabeled step exports, defeating the actual purpose of these columns. Restricting who can write them means "`flowVersionId` is set" reliably means "a person chose this," at zero schema cost. A run-produced artifact can still later be promoted into a curated one — that's still the same deliberate action, just acting on bytes that happened to originate from a run instead of a raw upload.

**Param-level curation (which specific artifacts are offered for a specific param) is a new join table**, keyed on `(artifactHash, flowVersionId, paramName)` — genuinely many-to-many (one artifact curated for several params; one param with several candidate artifacts) and, per the no-new-`Param`-table decision above, referencing the param by its bare name rather than a foreign key.

**Usage-provenance needs no new schema.** "Which runs have used or produced this artifact" is already fully answerable today via `RunStepExport.artifactHash` and `RunParam.artifactHash`, both already indexed.

**Content-creation-provenance is a distinct, deferred concept, not solved by the above.** "Was this specific artifact row deliberately uploaded by a person, or did it first come into existence as a run's export" isn't derivable from usage-provenance, because CAS dedupes by hash — a user could upload byte-identical content to something a run also produced. If/when this is needed, the shape should be a separate, append-only table (e.g. `ArtifactCreationEvent {id, artifactHash, createdBy: "user" | "run", runId?, stepId?, createdAt}`), not a second row on `Artifact` — `hash` stays the sole identity of the content; the new table records the history of how the system came to know about it. Not built now; considered a rare-enough edge case to defer.

**Out of scope, deliberately**: the existing `contentType`/`format` redundancy on `Artifact` is known legacy duplication, left alone until the future binary-artifact-support work that's expected to resolve it properly.

## Consequences

- Enables the core Artifacts-mode capability (curated, flow-version-scoped artifact picker) without inventing a new `Param` entity or touching `RunParam`/`RunStepExport`/`RunStepProjection`'s existing shape at all.
- Two explicitly-deferred gaps, documented so they're not lost: promoting single-valued flow/flow-version scope to genuine many-to-many if that need ever materializes; and content-creation-provenance if disambiguating user-uploaded vs. run-produced bytes ever becomes load-bearing rather than cosmetic. Either would warrant its own future ADR rather than silently expanding this one.
- Requires care in the worker/artifact-write path specifically to _not_ set the new columns automatically — an easy thing to get wrong by default, since it'd be the more obvious naive implementation.
- Not yet implemented — the actual Prisma migration, port/adapter changes, and API surface are a follow-up planning + implementation pass.
