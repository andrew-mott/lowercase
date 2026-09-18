# UI Workspace Initiative — Arc: Artifacts in Explorer (Changes C21–C24)

**Previous:** [Panel icons and the main nav rail](./panel-icons-and-nav-rail.md) (Changes C19, C20) · **Next:** [Run Input params](./run-input-params.md) (Changes C25, C26)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Continues from [`panel-icons-and-nav-rail.md`](./panel-icons-and-nav-rail.md). One continuous story across four Changes: bringing Artifacts mode's already-built backend (see the separate, earlier [`artifacts-mode.md`](../artifacts-mode.md) satellite doc) into the Explorer/dockview tree — listing, viewing, a metadata rail, and creation. Continues in [`run-input-params.md`](./run-input-params.md).

## Change C21 - Artifacts — first piece: list per-version artifacts in the tree - merged (PR #304)

Adds an "Artifacts" node under each Version, sibling to Runs and Sims, expanding to list that version's user-made artifacts — matching the existing Runs/Sims list pattern already built (Change C14/15).

### Discussion

- **List-only for this first pass — no click-to-open behavior yet.** Runs/Sims clicking opens a Flow Graph panel; there's no equivalent panel kind for artifacts yet, and building one (an artifact viewer) is a larger, separate piece. Adding it now would mean building a whole new panel kind under time pressure for a first pass — deferred, not forgotten.
- **Query: `useListArtifactsQuery({ flowVersionId, curated: "true" })` only — no flow-wide "shared" artifacts included.** Verified this mirrors the old page's actual query exactly, and confirmed the server's `listArtifacts` filter is a flat Prisma `where` with AND-only semantics, so no single query could express "this version's own OR this flow's shared ones" today anyway. There's no way to create more than one version of a flow yet, so "shared across versions" has no real case to serve regardless. Revisit once multi-version authoring is real.
- **Row content: just the artifact's title** (`label`, generally — same fallback the old page used), matching the Sim row's single-line, name-forward pattern.
- **Icon**: `FileTextIcon` (already this app's established artifact icon), needing a fresh color not already claimed by another tree-icon kind. Type-specific icon choices are a named future refinement, not this pass. Surfaced after using Change C22's viewer: many artifacts have no filename/extension at all, so icons alone may not convey content type as well as showing the extension (or a short format label) directly as text — worth weighing both, not just swapping icon packs.

### What actually landed

The design above landed as planned: `ExplorerVersionArtifactList.tsx` (new, mirroring `ExplorerVersionSimList.tsx`'s structure but with no `selectedRowId`/`onSelect` props at all — rows are genuinely static, no `cursor-pointer`/hover treatment, honestly reflecting that nothing happens on click yet), `ARTIFACT_ICON`/`ARTIFACT_ICON_CLASS` (`FileTextIcon`, `text-orange-400`) added to `explorer-tab-icons.ts`, and a new Artifacts block in `ExplorerVersionRow.tsx` after the Sims block.

Two follow-up fixes found from using it:

- **Tree indentation pass**: after this landed, went through and made every level of the tree's nesting visually consistent — each collapsible "folder"'s children now indent by a uniform step (`px-2` → `pl-8` → `pl-14` → `pl-20`) so children read clearly as children, not siblings.
- **A real, pre-existing highlight bug found and fixed**: clicking the Runs/Sims/Artifacts group-header rows never updated `selectedRowId` at all (they only toggled their own local expand state) — so whichever Flow or Version row was last actually clicked stayed visually "selected" indefinitely. Root cause: each new row kind added over Changes C14/15/21 needed its own `isXSelected` check wired up, and these three group headers never got one. Fixed by threading one new generic `onSelectRow: (rowId: string) => void` callback down the existing tree chain, alongside the existing semantically-named `onSelectX` callbacks.

## Change C22 - Artifacts — view an artifact - merged (PR #305)

Closes Change C21's "list-only" gap: clicking an artifact row opens it in a new dockview panel kind, content rendered in a Monaco-based viewer — the same "stable identity → own panel kind" pattern `json-definition` already uses.

### Discussion

- **`OpenPanelRequest` gains a new `artifact` kind**: `{ kind: "artifact"; label: string; hash: string }`, keyed by hash (the artifact's real stable identity), mirroring `json-definition`'s shape.
- **No new content component needed — reuse `ArtifactContentPanel` as-is.** It already exists from the old mode: fetches via `useGetArtifactQuery({hash})`, handles loading/error, maps `format` to a Monaco language, and renders through the same `CodeEditor` wrapper `json-definition` already uses.
- **Binary (`format: "bytes"`) artifacts are explicitly skipped this Change, not given a fallback/download link.** The system doesn't support binary content end-to-end today — confirmed no HTTP route anywhere serves raw artifact bytes, even though `FsArtifactStore.getBytes()` exists at the storage layer. Rows for `bytes`-format artifacts stay inert; json/text/markdown rows become clickable.
- **Anticipated, not built here**: the artifact panel will eventually need its own Rail + side panel, with at least a metadata tab — named now so it's not lost, not scoped.

### What actually landed

Exactly as designed — `explorer-panels.ts`'s new `artifact` kind, `ArtifactContentPanel` reused unmodified via a new case in `ExplorerTabContent.tsx`, `ExplorerVersionArtifactList.tsx`'s rows now clickable (with highlight) for every format except `bytes`, and `onSelectArtifact` threaded down the tree the same way `onSelectRun`/`onSelectSim` already were. One small extraction along the way: the row's title-fallback logic (`titleFor`) moved out into its own `artifact-title.ts` file — required anyway since exporting a plain function alongside a component from the same file breaks this repo's `react-refresh/only-export-components` lint rule.

**Two follow-up loading-flash fixes found from actually using it:** `ArtifactContentPanel.tsx`'s own "Loading artifact..." text was flashing on every fast localhost fetch — debounced with the existing `useDelayedLoading` hook. That surfaced a second, unrelated flash: `@monaco-editor/react`'s `Editor` renders its own default "Loading..." while its bundle/worker initializes — a separate phase from any data fetch. Fixed at the `CodeEditor.tsx` level (benefits every `CodeEditor` usage) with a small `MonacoLoadingFallback` component passed as `Editor`'s `loading` prop.

## Change C23 - Artifacts — rail + metadata tab (view + edit) - merged (PR #306)

Extends the artifact panel from Change C22 with its own Rail + side panel, same shape as the Flow Graph panel's, with a metadata tab showing label, filename, contentType, size, format, hash, and associations. Originally planned as two Changes (view-only, then editing) — dropped that split after reading the old mode's actual `ArtifactMetadataPanel.tsx`, which doesn't cleanly separate the two. Reusing it wholesale ships viewing and editing together instead of staging a rebuild across two Changes just to delay something that isn't actually separable.

### Discussion

**A real design gap this surfaced**: the `artifact` panel kind carries no `versionId`, but the only endpoint returning real metadata needs one. Fix: add `versionId` to the `artifact` request variant as a query-scoping field only — `contentId()`'s dedupe key stays hash-only, so the same artifact still resolves to one panel regardless of which version's tree row it was opened from.

**Side panel state follows ADR-0004, not a one-off**: the metadata tab starts closed, and its active-tab state gets a real `artifact-panels-slice.ts`, keyed by panel id, exactly like `flow-graph-panels-slice.ts`/`event-graph-panels-slice.ts`. Per ADR-0004 every panel kind is meant to get this same keyed-Redux-slice + persistence shape, so this isn't scope creep, it's Change C23 being the third panel kind to actually do it.

### What actually landed

Exactly as designed, plus one scope addition settled during discussion — `bytes`-format artifact rows also became clickable, since the metadata tab gives them something real to show even without a content preview; `ArtifactContentPanel` already renders a graceful "Preview not supported" message for that format. `artifact-panels-slice.ts`'s `draft`/`isEditing` state is a new addition beyond the `sidePanelTab` field originally scoped — needed once it became clear reusing `flow-version-artifacts-slice.ts`'s singleton draft would let two open artifact panels stomp each other's in-progress edit. Verified end-to-end in the browser: viewing, editing/saving (including the tree's own artifact row label updating from the cache patch), and two panels' edit sessions staying independent when both are open at once.

## Change C24 - Artifacts — create an artifact - merged (PR #307)

Entry point: a "+" row in the tree's Artifacts list. Clicking it opens a dialog with two choices, mirroring the old mode's own two entry points but as a modal instead of an in-place page swap:

- **Upload a file** — stays entirely inside the dialog: a file picker plus Label/Share/Params fields, fillable once a file is picked. Small enough that a modal is plenty — no dockview panel needed.
- **Write/author a new artifact** — closes the dialog and opens a real dockview panel (a new `artifact-authoring` kind, distinct from Change C22/23's `artifact` kind since there's no hash yet). One authoring panel per version at a time: re-clicking "+" while one's already open for that version refocuses it rather than opening a second blank draft.

### Discussion

Both paths reuse `createArtifact`/`useCreateArtifactMutation` and the `listArtifacts` cache-patch pattern directly from `ArtifactUploadPanel.tsx`/`ArtifactAuthorTextPanel.tsx` unmodified — that logic has no coupling to the old singleton slice. On success, both close their own surface and open/focus the new artifact's Change C23 viewer/metadata panel at its new hash. MIME-type restrictions match what's actually supported today (json/text/markdown only, per the binary-support deferral already noted in Change C22).

### What actually landed

Exactly as designed, with several follow-up fixes found from actually using it: the authoring panel's fixed right column reworked once in the browser — Save/Cancel moved down into that column, and the editor's own flex column needed an explicit `min-w-0` (a flex item's default `min-width: auto` otherwise refuses to shrink below Monaco's intrinsic width). The upload dialog gained read-only Content Type/Size fields once a file's picked. The tree's artifact list now sorts by each artifact's resolved title (alphabetical) instead of creation time. Both creation paths gained matching error/success toasts. One real bug found and fixed: closing the upload dialog looked like two dialogs closing in sequence, because its internal step was being reset back to "choose" synchronously on close, while Radix's `DialogContent` was still mounted and fading out — fixed by resetting only when the dialog freshly opens instead.
