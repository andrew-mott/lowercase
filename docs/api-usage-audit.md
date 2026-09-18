# Web app API usage audit

Companion to [`docs/api-reference.md`](api-reference.md). For each endpoint documented there: which hooks/components actually call it, and — for responses with any real shape — how much of that response is actually read downstream vs. fetched and ignored.

This isn't a call-site index (`docs/request-flow-map.md` used to do that, for the old page-based UI — retired as part of this audit, stale and superseded, see the Summary/arc notes). The question here is specifically about waste: does an endpoint hand back more than any consumer reads, and if so, is equivalent data already available elsewhere.

Sections and route order mirror `docs/api-reference.md` (alphabetical by resource, GET → POST → PATCH within a resource). All 21 endpoints covered.

## Summary

**Zero live frontend consumers (4 of 21 endpoints):**

- `POST /api/evals` — its only call site, `EvaluateExportModal.tsx`, has been an orphaned, unimported component since Change C43.
- `POST /api/flows/files` — hook exported, never called.
- `GET /api/flows/:flowId` — hook exported, never called; `GET /api/flows/versions/:versionId` covers every real need instead.
- `GET /api/flows/versions/:versionId/params/:paramName/curated-artifacts` — never called; the UI gets curated artifacts a different way entirely (`GET /api/artifacts?flowVersionId&curated=true`, filtered client-side).

**Most fetched-but-unused response data:**

- `GET /api/runs/:runId` (`RunDetail`) — 2 of ~20 `run` fields used, `steps`/`params`/`flow`/`flowVersion` (all nested, several fields deep) entirely unread. The worst case by far, and the one Change C51 already flagged as sprawling.
- `GET /api/sims` (`SimListItem[]`) — 3 of 21 leaf fields used; `flow`/`flowVersion` fetched on every sim and discarded at the list-mapping call site.
- `GET /api/flows` (`FlowListItem[]`) — `flow` fully used, but `latestVersion` is fetched on every item and unused everywhere live.

**Fully-utilized, no waste:** `GET /api/artifacts/:hash` — every field of every response branch (json/text/markdown/bytes) has a real consumer.

**Cross-cutting pattern — failure responses are routinely discarded:** `GET /api/runs`, `GET /api/runs/:runId/params`, and `POST /api/runs` all check `ok` but never surface the response's own `error` string — hardcoded UI text is shown instead, or (for `POST /api/runs`) nothing at all. The backend's real error message doesn't reach the user in any of these three flows.

**Indirection worth knowing about:** `GET /api/runs/details`'s two call sites never read the hook's own `data` — they use it only for `isFetching`. The real event data flows out through a Redux slice fed by the query's `onQueryStarted` dispatch (shared with the live SSE stream), read back out via selectors in different files entirely.

---

## Artifacts

<details>
<summary><code>GET</code> <code><b>/api/artifacts</b></code> — <code>ArtifactListItem[]</code> — 9 of 12 leaf fields used, well-utilized</summary>
<br>

**Consumed by:** `useListArtifactsQuery`, called from:

- [`ArtifactList.tsx:31`](../apps/workbench/src/components/workbench/explorer/version/ArtifactList.tsx#L31) — one flow version's curated artifacts, shown in the FlowExplorer tree
- [`use-flow-graph-panel.ts:68`](../apps/workbench/src/components/workbench/flow-graph-panel/use-flow-graph-panel.ts#L68) — all artifacts, for run-param compatibility filtering
- [`use-flow-graph-panel.ts:69`](../apps/workbench/src/components/workbench/flow-graph-panel/use-flow-graph-panel.ts#L69) — curated artifacts scoped to one version, for the curated-only params picker
- [`use-artifact-panel.ts:90`](../apps/workbench/src/components/workbench/artifact-panel/use-artifact-panel.ts#L90) — one artifact by hash, for the metadata tab

##### `artifact` ([`ArtifactIndex`](../packages/types/src/artifacts/artifact-index.ts) minus `flowId`/`flowVersionId`/`curated` — those live under `associations` instead)

| Field         | Used? | Where                                       |
| ------------- | ----- | ------------------------------------------- |
| `hash`        | yes   | row key/selection id, title fallback        |
| `label`       | yes   | title, metadata tab, edit draft             |
| `filename`    | yes   | title fallback                              |
| `time`        | yes   | metadata tab                                |
| `contentType` | yes   | `isArtifactCompatible` param-type filtering |
| `size`        | yes   | metadata tab (formatted)                    |
| `format`      | yes   | `isArtifactCompatible`, metadata tab        |
| `id`          | no    | —                                           |

##### `associations`

| Field            | Used? | Where                                         |
| ---------------- | ----- | --------------------------------------------- |
| `flowId`         | yes   | Share switch (metadata tab)                   |
| `paramCurations` | yes   | curated-param filtering, edit draft seeding   |
| `flowVersionId`  | no    | only ever written, never read back            |
| `curated`        | no    | only ever assumed `true` on write, never read |

##### Takeaway

Well-utilized relative to `RunDetail` below — 9 of 12 leaf fields genuinely read across the app's four call sites. The two unused `associations` fields are asymmetric writes (set once, never read back), not unread response bloat.

</details>

<details>
<summary><code>POST</code> <code><b>/api/artifacts</b></code> — <code>Result&lt;ArtifactIndex, string&gt;</code> — response read directly at both live call sites, not just cached blind</summary>
<br>

**Consumed by:** `useCreateArtifactMutation`, live call sites:

- [`use-artifact-authoring-panel.ts:176`](../apps/workbench/src/components/workbench/artifact-authoring-panel/use-artifact-authoring-panel.ts#L176)
- [`CreateArtifactDialog.tsx:192`](../apps/workbench/src/components/workbench/shared/CreateArtifactDialog.tsx#L192)

A third call site, [`EvaluateExportModal.tsx:103`](../apps/workbench/src/components/evals/EvaluateExportModal.tsx#L103), is dead — that component has had zero importers since Change C43 (its own header comment: "kept intentionally, not dead code to sweep," preserved as a reference for a future real evals rework). Not counted as a live consumer.

##### Usage, both live call sites

On success (`result.ok`), `result.value` (the new `ArtifactIndex`) is read directly, not just cache-patched: `result.value.hash` opens the new artifact panel and (when returning to a param picker) sets the selected hash; `result.value.label`/`.filename` feed `titleFor(...)` for the panel label and a success toast; `result.value.contentType`/`.format` feed `isArtifactCompatible(...)` to decide whether the new artifact can fill the param it was created for. The whole value is also pushed into the `listArtifacts` cache (same fields as `GET /api/artifacts` above get read whenever that cached entry is later displayed — `time`/`size` included, `id` still never read). `result.error` is read on failure.

</details>

<details>
<summary><code>GET</code> <code><b>/api/artifacts/:hash</b></code> — <code>GetArtifactRes</code> — fully utilized, every response branch has a real consumer</summary>
<br>

**Consumed by:** `useGetArtifactQuery` / `useLazyGetArtifactQuery`, called from:

- [`ArtifactContentPanel.tsx:8`](../apps/workbench/src/components/workbench/artifact-panel/ArtifactContentPanel.tsx#L8) — main content preview panel
- [`ArtifactHashLoader.tsx:16`](../apps/workbench/src/components/workbench/flow-graph-panel/side-panel/step-results/ArtifactHashLoader.tsx#L16) — resolves a param ref's artifact content inline
- [`StepOutputExportsPanel.tsx:33`](../apps/workbench/src/components/workbench/flow-graph-panel/side-panel/step-results/StepOutputExportsPanel.tsx#L33) (lazy) — step output/export preview, on demand
- [`RunInputRow.tsx:83`](../apps/workbench/src/components/workbench/flow-graph-panel/side-panel/RunInputRow.tsx#L83) (lazy) — "open in main panel" preview, on demand

##### Fields

| Field                        | Used? | Where                                                         |
| ---------------------------- | ----- | ------------------------------------------------------------- |
| `format`                     | yes   | every call site branches on it                                |
| `value` (json/text/markdown) | yes   | every call site renders it                                    |
| `byteLength` (bytes branch)  | yes   | `ArtifactContentPanel.tsx` — "N bytes, preview not supported" |
| `ok` / `error`               | yes   | every call site                                               |

##### Takeaway

The one endpoint so far with no waste at all — every field of every response branch has a real consumer somewhere in the app.

</details>

<details>
<summary><code>PATCH</code> <code><b>/api/artifacts/:hash</b></code> — <code>Result&lt;ArtifactIndex, string&gt;</code> — same consumption profile as <code>POST</code>/<code>GET /api/artifacts</code></summary>
<br>

**Consumed by:** `useUpdateArtifactMetadataMutation`, one live call site: [`use-artifact-panel.ts:156`](../apps/workbench/src/components/workbench/artifact-panel/use-artifact-panel.ts#L156).

Same pattern as `POST /api/artifacts`: `result.ok` checked, `result.value` (the updated `ArtifactIndex`) patched wholesale into two cache entries (this panel's own hash-scoped lookup and the curated-scoped list), consumed later the same way `GET /api/artifacts` is. `result.error` shown on failure.

</details>

---

## Evals

<details>
<summary><code>GET</code> <code><b>/api/evals</b></code> — <code>EvalResultRecord[]</code> — 8 of 13 top-level fields used; the nested <code>payload.overall</code>/<code>payload.passed</code> duplicate is dead, only the flattened copies are read</summary>
<br>

**Consumed by:** two hooks, both only called from [`Evals.tsx`](../apps/workbench/src/pages/Evals.tsx) — `useListEvalsByTargetShapeQuery` (`Evals.tsx:22`) and `useListEvalsByExperimentIdQuery` (`Evals.tsx:31`), merged into one `results` array (`Evals.tsx:35-36`) and passed to `EvalScoreChart` and `EvalResultTable`. No other consumer of `EvalResultRecord` anywhere in `apps/workbench`.

##### [`EvalResultRecord`](../packages/types/src/db-sql/eval-result-record.ts)

| Field                             | Used? | Where                                       |
| --------------------------------- | ----- | ------------------------------------------- |
| `id`                              | yes   | React key only (`EvalResultTable.tsx`)      |
| `targetRunId`                     | yes   | `EvalResultTable.tsx`, `EvalScoreChart.tsx` |
| `targetFlowVersionId`             | yes   | `EvalResultTable.tsx`, `EvalScoreChart.tsx` |
| `evalFlowVersionId`               | yes   | `EvalResultTable.tsx`                       |
| `overall` (flattened)             | yes   | `EvalResultTable.tsx`, `EvalScoreChart.tsx` |
| `passed` (flattened)              | yes   | `EvalResultTable.tsx`, `EvalScoreChart.tsx` |
| `createdAt`                       | yes   | `EvalResultTable.tsx`, `EvalScoreChart.tsx` |
| `payload.dimensions[*].score`     | yes   | `EvalResultTable.tsx`                       |
| `targetStepId`                    | no    | —                                           |
| `targetExportName`                | no    | —                                           |
| `evalRunId`                       | no    | —                                           |
| `evalFlowId`                      | no    | —                                           |
| `experimentId`                    | no    | —                                           |
| `payload.dimensions[*].rationale` | no    | —                                           |
| `payload.rationale`               | no    | —                                           |
| `payload.overall` (nested)        | no    | —                                           |
| `payload.passed` (nested)         | no    | —                                           |

##### Takeaway

The `overall`/`passed` duplication (flattened on the record and nested again in `payload`, flagged during Change C51) resolves cleanly on the read side — the frontend exclusively reads the flattened copies; the nested duplicates are dead weight. Within `payload`, only `dimensions[*].score` is read; `rationale` at both levels is never shown anywhere.

</details>

<details>
<summary><code>POST</code> <code><b>/api/evals</b></code> — its only call site is orphaned dead code, unreachable since Change C43</summary>
<br>

**Consumed by:** `useRequestEvalMutation`, one call site: [`EvaluateExportModal.tsx:91`](../apps/workbench/src/components/evals/EvaluateExportModal.tsx#L91). That component has zero importers anywhere in `apps/workbench/src` — its own header comment explains why: "Unused as of the UI Workspace initiative's Change C43 (pruning old pages)... kept intentionally, not dead code to sweep. This is v1 evals' judge-trigger UI, preserved as a reference for what to compare against when building the real evals rework."

Within that dead code, the response is fully handled — `result.ok`/`result.error` checked, and on success `result.evalRunId` drives a `navigate(...)` call — so nothing here is a usage gap in the code itself. It's simply not reachable from any live page today, which makes this the only endpoint in the whole API with **zero live consumers**.

</details>

---

## Flows

<details>
<summary><code>GET</code> <code><b>/api/flows</b></code> — <code>FlowListItem[]</code> — <code>flow</code> fully used, but <code>latestVersion</code> is fetched on every item and thrown away everywhere except one dead call site</summary>
<br>

**Consumed by:** `useGetFlowsQuery`, called from:

- [`flow-settings-panel/Content.tsx:8`](../apps/workbench/src/components/workbench/flow-settings-panel/Content.tsx#L8)
- [`FlowExplorer.tsx:21`](../apps/workbench/src/components/workbench/explorer/FlowExplorer.tsx#L21) — the tree
- [`EvalTargetPicker.tsx:29`](../apps/workbench/src/components/evals/EvalTargetPicker.tsx#L29)
- `EvaluateExportModal.tsx:80` — dead code, same orphaned component as `POST /api/evals` above

##### `flow` ([`FlowRecord`](../packages/types/src/db-sql/flow-record.ts))

All 6 fields used live: `id`, `name`, `description`, `kind`, `createdAt`, `updatedAt`.

##### `latestVersion` ([`FlowLatestVersionSummary`](../packages/types/src/api/flows/get-flows.ts))

| Field            | Used? | Where                                                                     |
| ---------------- | ----- | ------------------------------------------------------------------------- |
| `id`             | yes   | `EvalTargetPicker.tsx`; also `EvaluateExportModal.tsx` (dead)             |
| `definitionHash` | no    | only read in the dead `EvaluateExportModal.tsx` — effectively unused live |
| `flowId`         | no    | —                                                                         |
| `sequence`       | no    | —                                                                         |
| `versionLabel`   | no    | —                                                                         |
| `description`    | no    | —                                                                         |
| `createdAt`      | no    | —                                                                         |

##### Takeaway

`FlowExplorer.tsx` and `flow-settings-panel/Content.tsx` destructure only `{ flow }` from every list item and never touch `latestVersion` at all — version data comes from a separate call (`GET /api/flows/:flowId/versions` below) instead. 5 of 7 `latestVersion` fields are dead weight on every item, in every live request.

</details>

<details>
<summary><code>POST</code> <code><b>/api/flows</b></code> — <code>CreateFlowRecordResult</code> — fully consumed, mostly structurally (written into the <code>getFlows</code> cache) rather than field-by-field</summary>
<br>

**Consumed by:** `useAddJsonFlowMutation`, one call site: [`use-flow-authoring-panel.ts:46`](../apps/workbench/src/components/workbench/flow-authoring-panel/use-flow-authoring-panel.ts#L46).

Not a discarded-payload case: `result.ok`/`result.error` are checked, `flow.name` and `version.id` are read directly (toast + panel navigation), and the whole `flow`/`version` objects are written into the `getFlows` RTK Query cache to keep the explorer tree in sync without a refetch. Every field of `CreateFlowRecordResult` ends up traveling somewhere real — most of it structurally, via that cache write, rather than being individually destructured at the call site.

</details>

<details>
<summary><code>POST</code> <code><b>/api/flows/files</b></code> — zero call sites in the web app</summary>
<br>

**Consumed by:** `useUploadFlowFileMutation` — confirmed via grep, its only appearance in `apps/workbench/src` is the export line in `flows-api.ts` itself. No component calls it.

##### Takeaway

Genuinely dead. The one file-upload flow that does exist in the live UI (`CreateArtifactDialog.tsx`'s upload step) goes through `POST /api/artifacts` (`useCreateArtifactMutation`) instead, not this endpoint.

</details>

<details>
<summary><code>GET</code> <code><b>/api/flows/:flowId</b></code> — zero call sites in the web app</summary>
<br>

**Consumed by:** `useGetFlowDefQuery` — confirmed via grep, same as above: only the export line in `flows-api.ts`, no component calls it.

##### Takeaway

Also genuinely dead. Every place the frontend needs a `FlowDefinition`, it goes through `GET /api/flows/versions/:versionId` (below) instead, which nests the definition inside a version record. This flow-level shortcut has no live caller — consistent with the `PostFlowReq`/`getFlowDef()` naming trap flagged in Change C51 (`docs/todo.md`), where this same "flowId-or-hash" service method was already flagged as loosely specified; it turns out the frontend doesn't even reach it via this route at all.

</details>

<details>
<summary><code>GET</code> <code><b>/api/flows/:flowId/versions</b></code> — <code>FlowVersionRecord[]</code> — 4 of 7 fields used</summary>
<br>

**Consumed by:** `useGetFlowVersionsQuery`, one call site: [`explorer/version/List.tsx:33`](../apps/workbench/src/components/workbench/explorer/version/List.tsx#L33) (the tree's per-flow version list), fanning out through `version/Row.tsx` into `FlowExplorer.tsx`.

##### [`FlowVersionRecord`](../packages/types/src/db-sql/flow-record.ts)

| Field            | Used? | Where                                                                                                                          |
| ---------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`             | yes   | row/selection keys, panel `versionId` throughout                                                                               |
| `sequence`       | yes   | fallback label ("Version N")                                                                                                   |
| `versionLabel`   | yes   | preferred label, when set                                                                                                      |
| `createdAt`      | yes   | formatted date in the row                                                                                                      |
| `flowId`         | no    | — (a `flowId` is used elsewhere, but sourced from `GET /api/flows/versions/:versionId`'s own `version.flowId`, not this array) |
| `definitionHash` | no    | —                                                                                                                              |
| `description`    | no    | —                                                                                                                              |

</details>

<details>
<summary><code>GET</code> <code><b>/api/flows/versions/:versionId</b></code> — <code>FlowVersionDefinition</code> — the most-called hook in the app (7 call sites), each reading a different narrow slice</summary>
<br>

**Consumed by:** `useGetFlowVersionDefQuery`, called from 7 places: `json-definition-panel/Content.tsx`, `event-graph-panel/Content.tsx`, `artifact-authoring-panel/use-artifact-authoring-panel.ts`, `shared/CreateArtifactDialog.tsx`, `artifact-panel/use-artifact-panel.ts`, `flow-graph-panel/use-flow-graph-panel.ts`, `evals/EvalTargetPicker.tsx`.

##### `definition` ([`FlowDefinition`](../packages/types/src/flow/flow-definition.ts), top-level keys only — see Change C51 on why this large/evolving type isn't expanded further)

| Key           | Used? | Where                                                                                                           |
| ------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| `steps`       | yes   | `flow-graph-panel` (graph itself, step lookups), `EvalTargetPicker` (filters httpjson steps)                    |
| `start`       | yes   | `flow-graph-panel` (start-node marking, Settings tab)                                                           |
| `params`      | yes   | `artifact-authoring-panel`, `CreateArtifactDialog`, `artifact-panel` (compatibility checks), `flow-graph-panel` |
| `name`        | no    | never read as a discrete field anywhere                                                                         |
| `version`     | no    | (the definition's own schema-version string, distinct from the `FlowVersionRecord` below) — never read          |
| `description` | no    | —                                                                                                               |
| `kind`        | no    | —                                                                                                               |
| `inputs`      | no    | —                                                                                                               |
| `outputs`     | no    | —                                                                                                               |

`json-definition-panel/Content.tsx` is the one exception: it `JSON.stringify`s the whole `definition` for the Monaco viewer, so every key is technically rendered there, just never inspected programmatically.

##### `version` ([`FlowVersionRecord`](../packages/types/src/db-sql/flow-record.ts))

All 7 fields used somewhere across the 7 call sites — but no single call site uses more than a few: `flowId` (4 sites, artifact-metadata plumbing), `id`/`sequence`/`versionLabel`/`definitionHash`/`description`/`createdAt` mostly concentrated in `flow-graph-panel`'s own Settings tab display.

##### Takeaway

Two call sites are pure opposites — `json-definition-panel/Content.tsx` uses only `definition` and never touches `version`; `event-graph-panel/Content.tsx` uses only 2 of `version`'s 7 fields and never touches `definition` at all. Three more (`artifact-authoring-panel`, `CreateArtifactDialog`, `artifact-panel`) each fetch the entire response but use only `definition.params` and `version.flowId` — the same narrow slice, for the same reason (artifact/param compatibility), every time. Only `flow-graph-panel`'s own hook uses a genuinely broad slice of both. Across the whole app, `FlowDefinition.name/version/description/kind/inputs/outputs` are never read as discrete fields by any component.

</details>

<details>
<summary><code>GET</code> <code><b>/api/flows/versions/:versionId/params/:paramName/curated-artifacts</b></code> — zero call sites, confirmed dead</summary>
<br>

**Consumed by:** nobody. Grepped for the route path and for `GetCuratedArtifactsRes`/`curated-artifacts` across `apps/workbench/src` — zero matches outside the server route itself.

##### Takeaway

The web app achieves "curated artifacts for this param" a different way entirely: it fetches ALL curated artifacts for the flow version via `GET /api/artifacts?flowVersionId&curated=true` (`useListArtifactsQuery`, see Artifacts above) and filters client-side in [`RunInputRow.tsx`](../apps/workbench/src/components/workbench/flow-graph-panel/side-panel/RunInputRow.tsx) against each `ArtifactListItem.associations.paramCurations`, matching on `flowVersionId`+`paramName`. This dedicated, per-param-scoped server endpoint has no reason to exist for the current UI — it's not a matter of underused fields, the whole route is unreached.

</details>

---

## Runs

<details>
<summary><code>GET</code> <code><b>/api/runs</b></code> — <code>RunListItem[]</code> — 2 of 9 fields used, plus the failure-branch <code>error</code> string is discarded in favor of a hardcoded message</summary>
<br>

**Consumed by:** `useListAllRunsQuery`, one call site: [`RunList.tsx:21`](../apps/workbench/src/components/workbench/explorer/version/RunList.tsx#L21) (FlowExplorer tree), passing selected items on through `onSelectRun` into `FlowExplorer.tsx`.

##### [`RunListItem`](../packages/types/src/run-index-store/run-list.ts)

| Field          | Used? | Where                                                                |
| -------------- | ----- | -------------------------------------------------------------------- |
| `runId`        | yes   | React key, `onSelectRun`, panel identity/label in `FlowExplorer.tsx` |
| `startTime`    | yes   | sort order, formatted date in the row and the panel label            |
| `flowName`     | no    | —                                                                    |
| `flowVersion`  | no    | —                                                                    |
| `flowDefHash`  | no    | —                                                                    |
| `endTime`      | no    | —                                                                    |
| `duration`     | no    | —                                                                    |
| `forkSpecHash` | no    | —                                                                    |
| `parentId`     | no    | —                                                                    |

##### Takeaway

Same shape as the `RunDetail` finding below — 2 of 9 fields read. On the failure branch, `RunList.tsx` shows a hardcoded `"Error loading runs"` rather than the response's own `error` string — the real message never reaches the user (a pattern that repeats across every Runs `GET` below).

</details>

<details>
<summary><code>POST</code> <code><b>/api/runs</b></code> — <code>runId</code> used on success, failure is entirely unhandled (no <code>else</code> branch at all)</summary>
<br>

**Consumed by:** `useRequestRunMutation`, one call site: [`use-flow-graph-panel.ts:290`](../apps/workbench/src/components/workbench/flow-graph-panel/use-flow-graph-panel.ts#L290) (`handleRun`).

On success (`result.data?.ok`), `result.data.runId` is used — dispatched into the panel's own Redux state, which then drives `useGetRunDetailQuery`/`useGetRunParamsQuery`/the event stream for that panel. On failure, there is no `else` branch at all: `result.data.error` is never read, and RTK Query's own transport-level `result.error` (a real HTTP/network failure, distinct from `{ ok: false }`) isn't checked either — a failed run request currently gives the user no feedback whatsoever.

</details>

<details>
<summary><code>GET</code> <code><b>/api/runs/:runId</b></code> — <code>RunDetail</code> — 2 of ~20 <code>run</code> fields used, <code>steps</code>/<code>params</code>/<code>flow</code>/<code>flowVersion</code> entirely unread</summary>
<br>

**Consumed by:** `useGetRunDetailQuery`, called from two places:

- [`use-flow-graph-panel.ts:96`](../apps/workbench/src/components/workbench/flow-graph-panel/use-flow-graph-panel.ts#L96)
- [`event-graph-panel/Content.tsx:71`](../apps/workbench/src/components/workbench/event-graph-panel/Content.tsx#L71)

No other call sites in `apps/workbench` (confirmed via grep for the hook name).

##### `run` ([`RunRecord`](../packages/types/src/db-sql/run-record.ts))

| Field              | Used? | Where                                                                                  |
| ------------------ | ----- | -------------------------------------------------------------------------------------- |
| `simId`            | yes   | both call sites — resolves the run's sim (if any) to feed `useGetSimQuery`             |
| `startTime`        | yes   | `event-graph-panel/Content.tsx` — fallback panel-header label when no sim name applies |
| `id`               | no    | —                                                                                      |
| `traceId`          | no    | —                                                                                      |
| `status`           | no    | —                                                                                      |
| `source`           | no    | —                                                                                      |
| `flowId`           | no    | —                                                                                      |
| `flowVersionId`    | no    | —                                                                                      |
| `flowDefHash`      | no    | —                                                                                      |
| `parentRunId`      | no    | —                                                                                      |
| `forkSpecHash`     | no    | —                                                                                      |
| `experimentId`     | no    | —                                                                                      |
| `targetRunId`      | no    | —                                                                                      |
| `targetStepId`     | no    | —                                                                                      |
| `targetExportName` | no    | —                                                                                      |
| `endTime`          | no    | —                                                                                      |
| `duration`         | no    | —                                                                                      |
| `createdAt`        | no    | —                                                                                      |
| `updatedAt`        | no    | —                                                                                      |

18 of 20 `run` fields unread.

##### `steps`, `params`, `flow`, `flowVersion`

All four entirely unread — zero fields from any of them, including their own nested types ([`RunStepProjectionRecord`](../packages/types/src/db-sql/run-record.ts)/[`RunStepExportRecord`](../packages/types/src/db-sql/run-record.ts) under `steps`, [`RunParamSelection`](../packages/types/src/db-sql/run-record.ts) under `params`, [`ArtifactIndex`](../packages/types/src/artifacts/artifact-index.ts) nested under both `steps` and `params`, [`FlowRecord`](../packages/types/src/db-sql/flow-record.ts) / [`FlowVersionRecord`](../packages/types/src/db-sql/flow-record.ts)), touched anywhere in either call site.

Not incidental — both consumers get the equivalent information from elsewhere already:

- Step status/results: `useRunEventsWithStatus` (event-sourced, live) in `use-flow-graph-panel.ts`, not `steps`.
- Run params: a dedicated `useGetRunParamsQuery` call, not `params` (this is the same derivability noted in Change C51 — `GET /api/runs/:runId/params` is itself just a projection of this same `RunDetail.params`, and even that dedicated lightweight endpoint isn't fed from this call).
- Flow/flow version: `useGetFlowVersionDefQuery`, not `flow`/`flowVersion`.

##### Takeaway

Two call sites, both fetch the full `RunDetail`, both use it for exactly one thing: resolving `run.simId` (to look up a sim) and, in one of the two, `run.startTime` for a display label. Everything else — 18 of 20 `run` fields plus all of `steps`, `params`, `flow`, `flowVersion` — is dead weight on the wire for every request, and in three of those four cases (`steps`, `params`, `flow`/`flowVersion`) there's already a narrower, purpose-built endpoint or event stream supplying the real data instead. This is the endpoint Change C51 flagged as having "expanded way beyond what I wanted it to" — this confirms it's not just verbose, it's mostly unused by the only two things that call it today.

</details>

<details>
<summary><code>GET</code> <code><b>/api/runs/:runId/params</b></code> — <code>RunParamManifest</code> — consumed wholesale, never per-key, and the failure-branch <code>error</code> is discarded again</summary>
<br>

**Consumed by:** `useGetRunParamsQuery`, one call site: [`use-flow-graph-panel.ts:127`](../apps/workbench/src/components/workbench/flow-graph-panel/use-flow-graph-panel.ts#L127).

`value` (a `Record<string, string>`, param name → artifact hash) is never read key-by-key at the call site — it's passed wholesale into `paramsSeeded`, which spreads it wholesale into this panel's Redux state. Every actual per-name lookup elsewhere in the panel (`handleParamChange`, `missingRequiredParams`, etc.) reads that post-seed Redux copy, not the raw query result. `ok` is checked; `error` on failure is reduced to a boolean (`paramsError`) and never shown — `RunInputTab.tsx` displays a hardcoded `"Couldn't load this run's params."` instead of the response's own message, the same pattern as `GET /api/runs` above.

</details>

<details>
<summary><code>GET</code> <code><b>/api/runs/details</b></code> — the hook's own call sites never read <code>data</code> at all; the real consumer is downstream through Redux</summary>
<br>

**Consumed by:** `useGetAllRunEventsQuery`, two call sites — [`use-run-events-with-status.ts:21`](../apps/workbench/src/components/workbench/shared/events/use-run-events-with-status.ts#L21) and [`event-payload-panel/Content.tsx:18`](../apps/workbench/src/components/workbench/event-payload-panel/Content.tsx#L18) — both destructure only `isFetching`, never `data`.

##### The real path

The endpoint's own `onQueryStarted` (`runs-api.ts`) dispatches `eventsBatch({ events: data.events })` into `events-slice.ts` on success — the same action the live SSE middleware dispatches for streamed events, so REST-backfilled history and live events merge into one normalized store (deduped, capped at a 5000-event sliding window). Every real read of an event happens via a selector against that slice afterward: `makeSelectRunEvents()` (used by `use-run-events-with-status.ts` itself, for its actual `events` return value — via the selector, not the query) and `selectEventById` (`event-payload-panel/Content.tsx`, which then `JSON.stringify`s one whole event for a raw debug view).

##### Takeaway

Not a per-field usage question the way the other endpoints are — the endpoint's `events` array is fully consumed, just never by the code that calls the hook. Both call sites use `useGetAllRunEventsQuery` purely for its `isFetching` flag and its side-effecting dispatch; the actual data flows out through Redux selectors in files that don't call this hook at all.

</details>

---

## Sims

<details>
<summary><code>GET</code> <code><b>/api/sims</b></code> — <code>SimListItem[]</code> — 3 of 21 leaf fields used; <code>flow</code>/<code>flowVersion</code> fetched on every sim and entirely discarded</summary>
<br>

**Consumed by:** `useListAllSimsQuery`, one call site: [`SimList.tsx:21`](../apps/workbench/src/components/workbench/explorer/version/SimList.tsx#L21) (FlowExplorer tree), passing `sim` on through `onSelectSim`.

##### [`SimListItem`](../packages/types/src/db-sql/sim-record.ts) = `{ sim, flow, flowVersion }`

| Field                          | Used? | Where                                                                          |
| ------------------------------ | ----- | ------------------------------------------------------------------------------ |
| `sim.id`                       | yes   | key, `onSelectSim` arg                                                         |
| `sim.name`                     | yes   | row label                                                                      |
| `sim.createdAt`                | yes   | sort order                                                                     |
| `sim.description`              | no    | —                                                                              |
| `sim.flowId`                   | no    | —                                                                              |
| `sim.flowVersionId`            | no    | —                                                                              |
| `sim.forkSpecHash`             | no    | —                                                                              |
| `sim.updatedAt`                | no    | —                                                                              |
| `flow.*` (all 6 fields)        | no    | `SimList.tsx` destructures only `{ sim }` from each item, `flow` never touched |
| `flowVersion.*` (all 7 fields) | no    | same — never destructured                                                      |

##### Takeaway

`flow` and `flowVersion` are fetched in full on every sim in the list and thrown away at the point the list is mapped — the explorer resolves the flow/version it actually needs from separate calls instead. 18 of 21 leaf fields on the response are dead weight.

</details>

<details>
<summary><code>POST</code> <code><b>/api/sims</b></code> — success payload entirely discarded; the UI relies on tag-invalidation to refetch the list instead</summary>
<br>

**Consumed by:** `usePostSimsMutation`, one call site: [`SaveSimDialog.tsx:40`](../apps/workbench/src/components/workbench/flow-graph-panel/toolbar/SaveSimDialog.tsx#L40).

On success, none of the created `SimRecord`'s 8 fields are read — `SaveSimDialog.tsx` shows a toast built from its own local form state (not the response), closes the dialog, and calls `onSaved()`. The list refresh comes entirely from RTK Query tag invalidation (`postSims` declares `invalidatesTags: ["Sim"]`, `listAllSims` declares `providesTags: ["Sim"]`) — not from reading anything in this response. `error` is read on failure.

</details>

<details>
<summary><code>GET</code> <code><b>/api/sims/:simId</b></code> — <code>SimDefinition</code> — 3 call sites, each reading an almost disjoint subset</summary>
<br>

**Consumed by:** `useGetSimQuery`, three call sites:

- [`use-flow-graph-panel.ts:74`](../apps/workbench/src/components/workbench/flow-graph-panel/use-flow-graph-panel.ts#L74) — keyed on the panel's explicit `simId` prop
- [`use-flow-graph-panel.ts:101`](../apps/workbench/src/components/workbench/flow-graph-panel/use-flow-graph-panel.ts#L101) — keyed on the _current run's_ `simId`, resolved from `RunDetail` (see above), passed through to `SimTab.tsx`
- [`event-graph-panel/Content.tsx:75`](../apps/workbench/src/components/workbench/event-graph-panel/Content.tsx#L75) — same run-resolved pattern

##### [`SimDefinition`](../packages/types/src/db-sql/sim-record.ts) = `{ sim: SimRecord; spec: ForkSpec }`

| Field               | Used? | Where                                                        |
| ------------------- | ----- | ------------------------------------------------------------ |
| `sim.id`            | yes   | panel 2 (`SimTab.tsx`)                                       |
| `sim.name`          | yes   | panel 2 (`SimTab.tsx`); panel 3 (header label)               |
| `sim.description`   | yes   | panel 2 (`SimTab.tsx`)                                       |
| `sim.forkSpecHash`  | yes   | panel 1 (`requestRun`'s body)                                |
| `spec.parentRunId`  | yes   | panel 1 (seeding, reuse-plan gating); panel 2 (`SimTab.tsx`) |
| `spec.reuse`        | yes   | panel 1 only (the reuse-overlay's step-id list)              |
| `sim.flowId`        | no    | —                                                            |
| `sim.flowVersionId` | no    | —                                                            |
| `sim.createdAt`     | no    | —                                                            |
| `sim.updatedAt`     | no    | —                                                            |

##### Takeaway

Every field ends up used by _someone_, but no single call site needs more than a couple of them: panel 1 cares only about fork-spec mechanics (`forkSpecHash`, `spec.*`) and never touches `sim.name`/`.description`/`.id`; panel 2 cares only about display identity plus `spec.parentRunId`, never `spec.reuse`; panel 3 reads a single field (`sim.name`) and ignores `spec` entirely. `sim.flowId`, `.flowVersionId`, `.createdAt`, `.updatedAt` are never read by any of the three.

</details>
