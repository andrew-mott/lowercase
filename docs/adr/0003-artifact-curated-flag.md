# ADR-0003: Dedicated `curated` flag on `Artifact`

Date: 2026-07-21
Status: Accepted

## Context

While sketching Artifacts mode's v1 UI (`docs/initiatives/ui-workspace/INITIATIVE.md`), the plan leaned on a shortcut: since `flowId`/`flowVersionId` on `Artifact` can only ever be set through deliberate curation (ADR-0002's write-restriction, never the worker's content-put path), "has `flowVersionId` set" was going to double as the signal for "browse user-made artifacts" — no new schema needed, just a UI rule that artifact creation always associates with the current flow version.

That shortcut makes `flowId`/`flowVersionId` carry two different meanings at once: their original job (curation scope — which artifacts get offered as candidates for a flow version's params) and, now, a proxy for authorship intent (did a person make this, versus a run produce it as a byproduct). Those meanings can drift apart: a plausible future feature is the _system_ writing `flowVersionId` onto a run-produced artifact directly (for query convenience, since it's already derivable transitively through `Run.flowVersionId`), with nothing about that decision looking like a provenance choice at the time. Once that happens, the proxy silently breaks — the browse list would start showing things that were never authored by a person.

This does **not** revisit ADR-0002's actual decisions (bare-string params, single-valued scope, deferring a full content-creation-provenance system) — those hold. It's specifically about not overloading `flowId`/`flowVersionId` with a second job they weren't designed for.

Separately confirmed while designing this: calling `Artifact`'s existing `put()` again on a hash that already has curation-related fields set (e.g. a run later produces byte-identical content to something already curated) does **not** clear them — Prisma treats an explicit `undefined` value in an `update`'s `data` as "leave this column alone," not "set it to `NULL`." Verified directly against the real Prisma client, not assumed. This means the same protection this ADR relies on for `curated` already held for `flowId`/`flowVersionId` in the merged ADR-0002 work, without anyone having designed for it explicitly.

## Decision

Add a dedicated `curated: Boolean @default(false)` column to `Artifact` — decoupled entirely from `flowId`/`flowVersionId`. A boolean, not a timestamp: the need is "was this deliberately curated," not "when" — `Artifact.time` already covers general timestamp duties and shouldn't be overloaded either.

`curated` is excluded from `ArtifactIndexInput`, the exact same mechanism ADR-0002 already uses for `flowId`/`flowVersionId` — so the worker's content-put path structurally cannot reach it, at the type level, not by convention. It's added to `ArtifactAssociation` and set through the existing `associateArtifact` method, since curating an artifact and associating it with a flow/param are the same category of deliberate user action.

Because the worker can never touch `curated` (same enforcement as above) and `put()` already preserves untouched columns across repeated calls on the same hash (confirmed above), two things fall out for free, not as separate mechanisms to build:

- The "same hash produced by both a person and, later, a run" edge case is already safe — a subsequent worker `put()` cannot clear `curated`, because it never has access to that field at all.
- "The system can never un-curate something" doesn't need a business rule — it's already true by construction, the same way the system can never curate something in the first place. Only a deliberate call to `associateArtifact` (available to flip `curated` either direction) can ever change it.

## Consequences

- One additive column, one migration, one line in `associateArtifact`'s `definedFields` payload — small.
- Artifacts mode's "browse user-made artifacts" filter becomes `curated = true`, unambiguous and independent of whatever `flowId`/`flowVersionId` end up meaning later.
- `flowId`/`flowVersionId` are now free to evolve independently — e.g. the system could start setting them on run-produced artifacts for query convenience someday, without that decision having any bearing on what counts as "user-made."
- Doesn't solve full content-creation-provenance (still deferred per ADR-0002) — `curated` only answers "was a person's deliberate say-so ever involved," not "who specifically, or when, or from what."
