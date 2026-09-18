# UI Workspace Initiative — Arc: Web app API usage audit (Change C52)

**Previous:** [Server API reference docs](./api-reference-docs.md) (Change C51) · **Next:** [Activate the real production build](./production-build.md) (Change C53)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log. Follows directly from Change C51 (`arcs/api-reference-docs.md`) — having the real API surface written down first is what makes this audit possible at all.

## Change C52 — Web app endpoint usage audit — merged (PR #335)

### Discussion

**What this is, settled 2026-08-22.** For each endpoint documented in `docs/api-reference.md`, how much of its response does the web app actually read vs. what's available — a field-level usage audit, not a call-site index and not a refactor. The motivating worry, in the user's own words: "there are old API endpoints and there are new ones... I'm worried that the old ones might be providing too much information to the UI in different spots." So this doubles as a first pass at an efficiency question — not fixing anything now, but surfacing where a response is bigger than what's actually consumed, as input to a future API revision.

**Not the same shape as `docs/request-flow-map.md`.** The old map answered "what does this page call" — a page → component → hook → route → service call-site index, in page-based groups that no longer exist now that the UI is dockview panels, not routed pages. This audit answers a different question — for a given response shape, which fields are actually read downstream — so it's organized per-endpoint, mirroring `docs/api-reference.md`'s own order, not per-page.

**`docs/request-flow-map.md` retired, 2026-08-22.** Resolved once this audit existed and made it obvious the old map wasn't the right shape for either question anymore (stale on top of that — pre-Explorer page structure, missing `evals` entirely). Turned out to be moot either way: the file was untracked, never actually committed to git, so this was a plain local delete, not a `git rm`.

**Format concept, not yet built:** per endpoint, name the consuming RTK Query hook(s) and their call site(s), then a field-by-field table (field / used? / where / notes) against the response type already documented in `docs/api-reference.md`.

**Starting with a pilot on `GET /api/runs/:runId` (`RunDetail`), not a full sweep.** Doing the full field-by-field version for all 21 routes is a lot of mechanical grep work and most routes are small enough that it'd be obviously all-used. `RunDetail` is the real suspect — already flagged during Change C51 as having sprawled well past what was intended (five nested record types plus a shared `ArtifactIndex`; see `arcs/api-reference-docs.md`'s Discussion section). Treating it as the hardest case and a pilot: build it for real, see what it actually turns up, then decide whether the exhaustive version across the other 20 routes is worth repeating or whether a few targeted passes on suspected offenders is enough.

**Written as a real file in `docs/`, not scratch, so it can be reviewed as an actual artifact** — same reasoning as Change C51's live prototype: judge it on disk/in an editor, not inside a chat transcript.

### What actually landed

`docs/api-usage-audit.md` — a field-level usage audit covering all 21 endpoints, same order and accordion (`<details>`/`<summary>`) format as `docs/api-reference.md`, plus a top `## Summary` section rolling up the headline findings so they're visible without opening every entry. The pilot (`RunDetail`) started as a plain markdown table for review; once approved, the user asked for the same accordion treatment `docs/api-reference.md` uses, specifically so 21 entries stay scannable rather than one long scroll — and for links from each field table back to the real type definitions in `packages/types`, mirroring the call-site links already in place, so a reader can jump to source without a manual grep.

Full sweep built by tracing every RTK Query hook's real call sites against the response shapes already documented in Change C51 — every claim backed by an actual line of code, not inferred from the type alone. The four resource-section sweeps (Evals, Flows, Runs, Sims — Artifacts and the `RunDetail` pilot were done directly first) were delegated to parallel research passes and then spot-verified against the real files before being written in, consistent with this initiative's standing "verify mechanics empirically" practice.

**Explicit framing, the user's own words (2026-08-22):** "even though I'm not fixing this now, this helps me revisit this type of thing and help redesign the frontend + backend later, and keeps a record of what the UI initiative rework is shipping with." Not a todo list — a snapshot for later reference.

Headline findings (full detail lives in `docs/api-usage-audit.md`'s own Summary, not re-explained here):

- **4 of 21 endpoints have zero live frontend consumers**: `POST /api/evals` (its only caller, `EvaluateExportModal.tsx`, has been orphaned dead code since Change C43), `POST /api/flows/files`, `GET /api/flows/:flowId`, and the per-param curated-artifacts route (`GET /api/flows/versions/:versionId/params/:paramName/curated-artifacts` — the web app gets curated artifacts a different way entirely, via `GET /api/artifacts` filtered client-side).
- `RunDetail` (the pilot) confirmed as the worst case — 2 of ~20 `run` fields used, `steps`/`params`/`flow`/`flowVersion` entirely unread, each already covered by a narrower endpoint or the event stream instead.
- Two more sizeable waste cases: `GET /api/sims` (3 of 21 leaf fields used) and `GET /api/flows` (`latestVersion` fetched on every item, unused everywhere live).
- One fully-clean endpoint: `GET /api/artifacts/:hash` — every response branch has a real consumer.
- A cross-cutting pattern found along the way, not something the audit set out looking for: `GET /api/runs`, `GET /api/runs/:runId/params`, and `POST /api/runs` all discard the response's real `error` string in favor of hardcoded UI text (or, for `POST /api/runs`, no failure handling at all — no `else` branch).
- One indirection worth knowing about for future work: `GET /api/runs/details`'s two call sites never read the hook's own `data` — the real events flow out through a Redux slice fed by the query's `onQueryStarted` dispatch, shared with the live SSE stream.

`docs/request-flow-map.md` deleted (see Discussion above).
