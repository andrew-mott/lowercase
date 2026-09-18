# UI Workspace Initiative — Arc: Expand content into its own tab (Changes C27, C28)

**Previous:** [Run Input params](./run-input-params.md) (Changes C25, C26) · **Next:** [Flow graph visual rework](./flow-graph-visual-rework.md) (Changes C29–C34)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Continues from [`run-input-params.md`](./run-input-params.md). Two parts of the same effort: wiring up the `onOpenInMainPanel` stubs that have sat inert since Change C11/13, now that opening a new dockview panel from inside another panel's content is a proven pattern. Continues in [`flow-graph-visual-rework.md`](./flow-graph-visual-rework.md).

## Change C27 - Expand content into its own tab, part 1 — real artifacts - merged (PR #310)

Wires up the `onOpenInMainPanel` stubs for content that already has a CAS hash (`StepOutputExportsPanel`'s output/export, `FlowVersionRunParamRow`'s Preview button) by routing them into the existing `artifact` panel kind.

### Discussion

**Full inventory, traced directly from every current `onOpenInMainPanel` call site rather than assumed — this is what settled the split below.** Eight sources total, splitting cleanly into two families:

- **Real artifacts** (already have a CAS hash, fetched via `useLazyGetArtifactQuery`): `StepOutputExportsPanel` and `FlowVersionRunParamRow`'s Preview button. Two sources — this Change.
- **Inline values** (no hash, nothing to look up): `StepHttpJsonDetails`, `ExportsField`, `FieldResolutionRow`, `ReferenceRow`, `FlowVersionRunParamRow`'s Show-usages, and `EventDetails`. Six sources — split across Change C28 and explicitly deferred (the reference-resolution family, see below).

**Organizing principle: every existing panel kind here (flow-graph, artifact, json-definition) is keyed by something it can refetch — a hash, a versionId, a runId — never by carrying a content blob through dockview's own persisted params/layout state.** That's why the two real-artifact sources route into the existing `artifact` panel kind rather than a new kind.

**The `artifact` panel's metadata-lookup gap, and its fix.** `use-artifact-panel.ts`'s `item` lookup is scoped to `useListArtifactsQuery({flowVersionId: versionId, curated: "true"})` — so a real, existing artifact that's simply never been curated (any step's run output, e.g.) comes back `undefined`, even though `ArtifactContentPanel` resolves the same hash fine via `useGetArtifactQuery({hash})`, which doesn't depend on curation at all. Fix: `flowVersionId` and `curated` are independent, optional filters server-side, so dropping `curated: "true"` from this one query already returns every artifact for the version, curated or not.

**Routing mechanism for the two real-artifact previews.** New optional prop on the shared components alongside the existing `onOpenInMainPanel` — `onOpenArtifact?: (hash: string) => void` — preferred over the inline-text path when present. Old-mode's callers pass neither and keep today's inline-text behavior untouched.

**Explicitly not this Change:**

- The reference-resolution family (`FieldResolutionRow`, `ReferenceRow`, `FlowVersionRunParamRow`'s Show-usages) — genuinely deferred, not just sequenced later. This isn't really a "where does it open" question; it's "how should raw-vs-resolved step viewing work at all," now that `StepDetailsTab` and the params picker can coexist in the same panel. Needs its own discussion pass.
- Step body / exports listing and the event payload — moved to Change C28.

### What actually landed

The prop-threading/routing exactly as designed, plus one real gap found only once actually testing it in the browser — the planned fix turned out to be insufficient, root cause was one layer deeper.

`use-flow-graph-panel.ts` gained `handleOpenArtifact(hash, label)`, threaded through `Content.tsx` into `ParamsTab`/`StepResultsTab`'s dockview wrapper, down into `FlowVersionRunParamRow`'s Preview button and `StepOutputExportsPanel`'s output/export buttons via the new `onOpenArtifact` prop.

**The metadata-lookup fix as originally planned (drop `curated: "true"`, keep `flowVersionId`) did not work.** The real root cause was one layer deeper: a step's run output/export never gets a `flowVersionId` association _at all_ — confirmed directly in `packages/worker/src/worker.ts`, the worker calls `this.artifacts.putJson(output)` with no metadata argument, and `ArtifactIndexInput` deliberately excludes `flowId`/`flowVersionId`/`curated` entirely. So a `{flowVersionId: versionId}`-scoped query — curated or not — can never find these rows.

Considered and rejected: having the worker assign `flowVersionId` at write time instead. Confirmed genuinely bigger than a quick fix — job-payload changes across `packages/engine`/`packages/worker` plus switching the write path — and named directly by the user as a known-bad area already slated for its own future rework, not something to fix as a side effect of this Change.

**Actual fix: a `hash` filter on the existing `listArtifacts` endpoint/query, reused everywhere else this shape already existed, rather than a new route.** `ArtifactListFilter`/`GetArtifactsReq` gained an optional `hash`; `PrismaArtifactRepository.listArtifacts` uses it to take over row-selection entirely when present, ignoring `flowId`/`curated`/`flowVersionId` for that purpose. `use-artifact-panel.ts` now queries `useListArtifactsQuery({hash, flowVersionId: versionId})`. Verified against a real repository test mirroring the exact worker-produced shape plus three more covering the edges.

One real deployment gotcha, not a code bug: `@lcase/adapters` compiles to `dist/`, and `apps/http-server`'s dev script doesn't watch or rebuild other workspace packages — a long-running dev server needed a full restart, not just a rebuild, to pick up the fix.

A small follow-up fix: `MetadataTab.tsx`'s Label field hides entirely when `value === undefined`, meaning a label-less artifact's Label field was invisible until Edit was clicked. Fixed by defaulting the non-editing value to `""` instead.

Noted but explicitly parked: the artifact endpoint layer bothering the user long-term (`GET /artifacts/:hash` content-only vs. `GET /artifacts` metadata-only, never reconciled) — tracked in `docs/todo.md`'s `ArtifactIndex` naming-debt entry. A nice incidental side effect: since `updateArtifactMetadata` unconditionally sets `curated: true` on any save, labeling a run-produced artifact through this new Preview/Edit path already promotes it into the curated world — no separate "curate" action needed.

Verified: typecheck/lint/test clean across all 25 workspace packages, plus manual browser testing of both preview paths, including the uncurated case and a full dev-server restart.

## Change C28 - Expand content into its own tab, part 2 — navigate into the definition, event payload - merged (PR #311)

Step body / exports listing → navigate into the existing `json-definition` panel, not a new panel kind. Event payload → one genuinely new, minimal panel kind, since a raw event has no other "document" to navigate into.

### Discussion

**Step body / exports listing.** This content already lives in a real, already-fetched document (`flowDef`), so rather than opening an isolated content panel, clicking "open in main tab" on a step's body or exports opens (or focuses) that version's `json-definition` panel scrolled to the right spot. Mechanism: a new optional `revealPath?: string[]` field on the `json-definition` variant of `OpenPanelRequest`, consumed as a one-shot ref-guarded effect in `ExplorerJsonDefinitionContent.tsx` on refocus.

- **Repeat-click problem, settled — corrected once actually verified against `shallowEqual`'s real implementation.** Checked react-redux's actual `shallowEqual` source directly: it compares each top-level key by reference, not deep equality — so a freshly-constructed `revealPath` array literal (which every real call site produces) already defeats the dedup on its own. Kept `revealAt?: number` (`Date.now()`, fresh per click) anyway, since it makes the guarantee explicit and independent of the incidental fact that every current caller happens to construct a fresh array each time.
- **Path lookup**: new dependency, `jsonc-parser` (zero-dependency, MIT, the same library VS Code's own JSON tooling uses). `findNodeAtLocation(parseTree(text), path)` gives an exact offset/length for any path depth.
- **Reveal mechanism, undecided on purpose**: `revealRangeInCenter` plus `editor.setSelection(range)` rather than a `deltaDecorations` highlight overlay — cheap to swap later if selection reads as the wrong affordance.

**Event payload.** Keyed by `{runId, eventId}`, not `eventId` alone — revised during planning once it became clear the events slice is genuinely refetchable via REST (`useGetAllRunEventsQuery({runId})`), not just live-websocket-ephemeral; self-fetching on `runId` keeps the panel correct across a reload instead of showing "not found" forever.

**Explicitly not this Change either**: the reference-resolution family, same exclusion as Change C27 — deferred past both Changes pending its own design pass.

### What actually landed

Both mechanisms landed close to plan, with prop-threading following the exact same additive pattern as Change C27 throughout, plus one design correction made mid-implementation.

- **`CodeEditor.tsx` needed one small new capability it didn't have before**: an `onMount?: (editor) => void` prop, forwarded from its existing internal `handleMount`.
- **The reveal mechanism ended up needing two independent triggers in one effect, not one** — a real wrinkle, since Monaco's mount is async and can complete either before or after a reveal request already exists. `ExplorerJsonDefinitionContent.tsx` holds the mounted editor in `useState` (not a ref) specifically so the moment it becomes available is itself a dependency-array change.
- **A design correction, found and fixed during implementation, not before**: the original "repeat-click" reasoning assumed `shallowEqual` might treat two structurally-identical `revealPath` arrays as equal. Checked react-redux's actual source directly — it compares nested values by reference, not deep equality, so a freshly-constructed array already defeats the dedup on its own, `revealAt` or not. Kept `revealAt` anyway. Verified with two tests: one mirroring real usage, one deliberately sharing the _same_ `revealPath` array reference across both requests to isolate that `revealAt` alone is what keeps `updateParameters` firing.
- Added test coverage alongside the two new/changed `OpenPanelRequest` mechanics (`explorer-tab-icons.test.ts`, `explorer-panels.test.ts`).

Verified: typecheck/lint/206 vitest tests (4 new), plus manual browser testing of both the definition-navigation and event-payload paths.
