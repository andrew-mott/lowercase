# UI Workspace Initiative — Arc: Naming the shell — Workbench, Dock, FlowExplorer (Changes C47–C48)

**Previous:** [Prune old pages](./prune-old-pages.md) (Changes C42–C46) · **Next:** [Remaining structure review](./remaining-structure.md) (Change C49)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Surfaced while scoping [`prune-old-pages.md`](./prune-old-pages.md)'s Change C46 (rehoming the flow-version cluster's shared survivors) — answering "where do these files actually belong" led directly into "what do we even call the thing that isn't the tree," which turned out to be a real, standing question rather than a small aside. Distinct narrative from that arc (which is about deleting dead code), so it gets its own file — even though the two Changes land some of the same destination folders and are executed close together, not as a strict two-phase sequence.

**The problem.** "Explorer" has meant two different things bundled into one name and one folder since Change C1 ("Explorer Mini Spike") — a name a first spike needed to have _a_ folder, never a deliberate one for what it grew into. `pages/Explorer.tsx` owns both the tree (`ExplorerTree.tsx` and its rows/lists) _and_ the entire `DockviewReact` host, mounted as one React Router page — so navigating to any other top-level route (`/evals`, `/system`) unmounts both together. That's backwards from the actual intent, which has been Postman-inspired from early on: the persistent app frame (nav + dockview) shouldn't unmount on left-nav clicks; only the tree's own _content_ should be able to change (e.g., a future Evals root swapping in alongside the Flows root) without tearing anything down.

**This arc only settles naming.** Building the actual "doesn't unmount" behavior is explicitly out of scope and stays under `Not yet scoped`'s "Left-side navigation itself, further out" — this arc just makes sure the names chosen now don't fight that direction later, per the user's own framing: "this Change does not seek to build that navigation structure... we don't have to create that future change of the tree right now because we don't have anything to change the tree with."

**Why two Changes, not one.** Originally scoped as a single Change C47 — split once it became clear it bundled a low-risk mechanical piece (renaming things, moving self-contained panel folders) with one genuinely complex, interdependent piece (`flow-graph-panel`'s internal split, which touches three panels' imports at once). Same reasoning as the Change C44/45 merge and the Change C45/46 split earlier in this arc: split when a Change contains a real, isolable decision or risk; merge when it doesn't.

## Change C47 - Rename Explorer -> Workbench/Dock/FlowExplorer (foundational renames + self-contained panels) - merged (PR #330)

### Discussion

**The naming, settled:**

- **Workbench** — `pages/Explorer.tsx` → `pages/Workbench.tsx`, decided — it already substantively _is_ one today (renders the tree and the dockview host together, wires up the dockview API context, routes panel content), only missing the future behavioral pieces tracked separately. Chosen over "Shell" (fine but generically weaker) and initially considered "Workspace" — rejected once its own future meaning became clear, below. **Correction (Change C49):** this section originally reasoned that the plan was to grow what `AppShell.tsx` means into Workbench, rather than invent a new top-level component — that's not what happened. `AppShell.tsx` stayed a plain nav-rail-plus-outlet component and was later renamed `RootLayout` (Change C49, `app/` folder consolidation, see `remaining-structure.md`); `Workbench` became a sibling route hosted by it, not a growth of it.
- **Dock** — the dockview/tab-management machinery specifically: tabs, tab-content routing, the empty-state watermark, the dockview React context, panel-routing types, layout persistence, the tabs Redux slice. A _portion_ of the Workbench, not a synonym for it. Chosen over "Workspace" after a real near-miss: the user's first instinct was `WorkspaceTab`/`WorkspaceTabContent`/`WorkspaceWatermark`, which would have collided with "Workspace"'s other, already-decided meaning below — caught and named explicitly before anything was renamed, not after.
- **FlowExplorer** — the tree, narrowed correctly. "Explorer" itself is the _correct_, idiomatic word for this pattern (VS Code's own official term for a browsable hierarchy you click through to open content elsewhere — the direct inspiration already cited) — "Tree" would only describe the widget shape, not its role. "Flows" resolves the only real ambiguity (explorer of _what_ — it's rooted at Flows specifically, not a generic file-explorer for runs/artifacts/anything else).
- **Workspace** — deliberately _not_ used as a code prefix anywhere in this rename. Reserved for a real future feature: a named, saved/predefined dockview layout, loadable into the Workbench — directly revives the "Workspaces" idea marked skipped as Change C8 (`INITIATIVE.md`'s "Skipped or superseded" section), which never went away, it just didn't have a slot until this conversation gave it one. Concrete example floated: a System page action that loads a specific Workspace of singleton panels into the Dock. Not built, not scheduled — just a reserved name, protected now specifically so a later feature doesn't have to fight already-shipped code for the word.

**Persistence/state-key risk, resolved as a non-issue.** Single-user local dev app, and the precedent from the last time a persistence-shape change happened was simply clearing the stored state in devtools rather than migrating it. Rename freely — `explorer-tabs-slice.ts` → `dock-tabs-slice.ts`, `explorer-persistence.ts` → `dock-persistence.ts`, whatever state/storage keys change along with them.

**Tree-specific, folder `components/explorer/` stays as-is (now correctly scoped to just this).** Originally scoped as a flat mechanical `Explorer`→`FlowExplorer` prefix swap across 7 files, with a deeper naming pass deferred to a hypothetical later Change. Once actually read end-to-end (all 7 files, not assumed from names), the deeper pass turned out to be small enough to just settle now rather than defer — the deferred-Change-49 idea is dropped entirely, not just postponed again.

**What the files actually do, read directly rather than assumed from folder names**: `ExplorerTree.tsx` renders a list of Flows inline (no separate FlowList — there's nothing else to disambiguate a top-level list from) and maps each into `ExplorerFlowRow.tsx`, an expandable Flow row that renders a Settings row inline plus `ExplorerVersionList.tsx` (the list of Versions under that Flow). Each Version becomes an `ExplorerVersionRow.tsx` — expandable, rendering Flow Graph/JSON Definition rows inline plus three expandable sections (Runs/Sims/Artifacts), each backed by its own list component (`ExplorerVersionRunList.tsx`/`ExplorerVersionSimList.tsx`/`ExplorerVersionArtifactList.tsx`) that renders its rows inline too — symmetric with the top level: whichever nesting level is the leaf never gets a separate Row file of its own.

**Resolved: a `version/` subfolder, with the `Version` prefix dropped inside it — same reasoning as `step-results/Content.tsx`.** The 5 Version-scoped files are a real, cohesive group — same size bar `toolbar/`/`step-details/`/`step-results/` were held to — and the folder itself now carries the scoping signal a filename prefix used to carry, so repeating it in the filename (`version/VersionRunList.tsx`) would be exactly the redundancy that pattern exists to avoid:

```
components/explorer/
  FlowExplorer.tsx      (was ExplorerTree.tsx)
  Row.tsx               (was ExplorerFlowRow.tsx)
  CreateFlowDialog.tsx
  version/
    List.tsx            (was ExplorerVersionList.tsx)
    Row.tsx             (was ExplorerVersionRow.tsx)
    RunList.tsx         (was ExplorerVersionRunList.tsx)
    SimList.tsx         (was ExplorerVersionSimList.tsx)
    ArtifactList.tsx    (was ExplorerVersionArtifactList.tsx)
```

**`ExplorerFlowRow.tsx` → `Row.tsx`, not `FlowExplorerFlowRow.tsx` — same redundancy fix, one level up.** The mechanical prefix swap would have doubled "Flow" (`FlowExplorer` + `FlowRow`). Dropped for the same reason as `version/`'s prefix: it already implies a top-level row once it's sitting directly under `components/explorer/`, and "Flow" was only ever there to say "this is the flow explorer's row" — a job the folder path already does. Two files end up named `Row.tsx` (this one, and `version/Row.tsx`) — consistent with the already-accepted `Content.tsx`-in-many-folders pattern, disambiguated by path, not name.

**`ExplorerVersionRunList.tsx`'s own comment — "scoped to one flow version's runs, a future wider list would be a different component" — still holds with the prefix dropped**, since `version/RunList.tsx`'s path now carries that same scoping signal the prefix used to. Carry the comment (or a shortened form of it) forward into `version/RunList.tsx` (and worth a matching one-liner in `SimList.tsx`/`ArtifactList.tsx` for the same reason) so the reasoning doesn't get lost in the rename.

**Singular, not plural — `FlowExplorer`, not `FlowsExplorer`.** Matches the established convention of every real "X Explorer" tool: File **Explorer** (Windows), Object **Explorer** (SSMS), Solution/Project **Explorer** (Visual Studio), Package **Explorer** (Eclipse) — the modifier is always singular, functioning attributively (naming the _category_ of thing browsed, not counting instances), the same way "a file explorer" isn't "a files explorer" even though it browses many files.

**Flagged, not built: `FlowExplorer` may end up one of several sibling explorers someday** — a Run Explorer or Artifact Explorer rooted somewhere other than Flows. Same treatment as the `Workspace` reservation above: named now so the current naming doesn't quietly foreclose it, nothing scoped or built toward it. `FlowExplorer`'s own internal `version/` subfolder (below) is unrelated to this — that's structure _within_ one explorer, not a sibling explorer. Updated once Change C48 folded `components/explorer/` into `components/workbench/explorer/` (see that Change's own discussion): a future sibling would most naturally land as its own `components/workbench/<x>-explorer/` folder, the same flat convention every `-panel/` folder already follows, rather than nested one level deeper inside this one.

**Dock-specific (6 files) move to a new `components/workbench/dock/` folder**, `Dock`-prefixed where they were `Explorer`-prefixed: `ExplorerTab.tsx`/`ExplorerTabContent.tsx`/`ExplorerWatermark.tsx` → `DockTab.tsx`/`DockTabContent.tsx`/`DockWatermark.tsx`; `explorer-dockview-context.ts` → `dock-context.ts`; `explorer-panels.ts` → `dock-panels.ts`; `explorer-dockview-theme.css` → `dock-theme.css`. Despite sounding tree-adjacent by name, these are dockview/tab machinery, not tree content — that's exactly why they get `Dock`-prefixed rather than `FlowExplorer`-prefixed.

**Correction: `explorer-persistence.ts`/`explorer-tabs-slice.ts` are renamed but not relocated.** Every other panel-specific slice (`artifact-panels-slice.ts`, `flow-graph-panels-slice.ts`, etc.) lives in `redux/slices/`, never colocated with its component folder — `explorer-tabs-slice.ts` already follows that convention today. Moving it into `components/workbench/dock/` (as an earlier pass at this doc had it) would introduce a one-off exception with no real justification beyond "Dock feels more like infra" — not worth breaking the established layering for. Renamed in place instead: `redux/explorer-persistence.ts` → `redux/dock-persistence.ts`, `redux/slices/explorer-tabs-slice.ts` → `redux/slices/dock-tabs-slice.ts`.

**Two outlier panel-content files** lose the stray `Explorer` prefix their sibling panels never had, moving to their own subfolders matching convention: `ExplorerFlowSettingsContent.tsx` → `flow-settings-panel/Content.tsx`; `ExplorerJsonDefinitionContent.tsx` → `json-definition-panel/Content.tsx`.

**Cross-cutting shared utilities → `components/workbench/shared/`** (a real folder, hard invariant: only things with verified, actual multiple consumers go in it, never "this seems generalish"): `CreateArtifactDialog.tsx` (already live in `components/explorer/`, opened from both a tree row and `flow-graph-panel/side-panel/ParamsTab.tsx`), `artifact-title.ts` (same cross-cutting shape). `CodeEditor.tsx`, `MainPanelTypes.ts`, and all of `components/fields/*` land in the same `components/workbench/shared/` folder but are moved as part of Change C46 instead, not this Change — per `prune-old-pages.md`'s mechanical boundary rule, they're loose under `components/` today (not inside `components/explorer/`), so they're Change C46's job even though the destination folder is one Change C47 also populates. Confirmed via grep — `CodeEditor.tsx` alone has 7 importers spanning nearly every panel kind.

**A fifth shared item, missed until Change C46 landed and this list got re-checked against the actual `components/explorer/` tree: `explorer-tab-icons.ts`** (+ its test file). Same shape as the others — its own file comment already says it's "shared by both the tree rows... and `getExplorerTabIcon`" — and its real importers span three domains: tree rows (`ExplorerVersionRow.tsx` and siblings), Dock (`ExplorerTab.tsx`), and flow-graph content outside `components/explorer/` entirely (`flow-graph-panel/RunToolbar.tsx`, `components/flow-graph-nodes/FlowStepNode.tsx`). Moves to `components/workbench/shared/tab-icons.ts`. Its one dynamic export, `getExplorerTabIcon`, is renamed to `getTabIcon` as part of the move — unlike Change C46's content-file renames (where the old export names stayed accurate regardless of file location), "Explorer" in this identifier becomes actively misleading once "Explorer" is narrowed to mean the tree specifically; the static icon constants (`FLOW_GRAPH_ICON` etc.) already don't reference "Explorer" and need no change. Its `OpenPanelRequest` type import (from `explorer-panels.ts` → `dock-panels.ts`) stays as an import from `dock/dock-panels.ts` — `shared/` depending on a `dock/` type is fine, the same direction `shared/flow-graph`'s own dependents already point.

**The four self-contained panel folders move wholesale, no internal restructuring** — checked directly (file counts: `artifact-panel/` 5 files/551 lines, `artifact-authoring-panel/` 2 files/394 lines, `event-graph-panel/` 5 files/458 lines, `event-payload-panel/` 1 file/37 lines), confirmed flat with no multi-file tab content anywhere (`MetadataTab.tsx`/`EventDetailsTab.tsx` are each fully self-contained) and no cross-panel sharing pattern (checked by grep — neither authoring/preview panel reaches into its sibling's internals, unlike `flow-graph-panel`'s situation). Nothing here needs the `step-details`/`step-results`-style subfolder treatment: `artifact-panel/`, `artifact-authoring-panel/`, `event-graph-panel/`, `event-payload-panel/` just move to `components/workbench/` as-is.

### What actually landed

Matched the settled plan exactly — 34 files moved/renamed via `git mv`, plus 4 associated test files renamed to match (`explorer-panels.test.ts` → `dock-panels.test.ts`, `explorer-persistence.test.ts` → `dock-persistence.test.ts`, `explorer-tabs-slice.test.ts` → `dock-tabs-slice.test.ts`, `explorer-tab-icons.test.ts` → `tab-icons.test.ts`). Two nesting collisions during the move (`git mv components/explorer/artifact-panel components/workbench/artifact-panel` landed _inside_ the folder Change C46 had already created there, same for `event-graph-panel`) were caught immediately and corrected by un-nesting before anything else proceeded.

**Unlike Change C46, export identifiers were renamed to match every renamed file** — `ExplorerTree`→`FlowExplorer`, `ExplorerFlowRow`→`Row`, `ExplorerVersionList`→`List`, `ExplorerVersionRow`→`Row`, `ExplorerVersionRunList`→`RunList`, `ExplorerVersionSimList`→`SimList`, `ExplorerVersionArtifactList`→`ArtifactList`, `ExplorerTab`→`DockTab`, `ExplorerTabContent`→`DockTabContent`, `ExplorerWatermark`→`DockWatermark`, `ExplorerFlowSettingsContent`/`ExplorerJsonDefinitionContent`→`Content` (both, matching the established `Content.tsx` convention, disambiguated at the import site the same way every other panel's `Content` already is: `import { Content as FlowSettingsPanelContent }`), and the page's own `Explorer()`→`Workbench()`. This is the opposite call from Change C46's content-file renames, deliberately: there, the old export names stayed accurate regardless of file location; here, "Explorer" in an identifier becomes actively misleading the moment "Explorer" is narrowed to mean the tree specifically, so the identifier itself was part of what needed fixing, not just the file path.

**Found and fixed during execution, beyond the file list above, all following that same "Explorer became misleading" logic**: `dock-panels.ts`'s `explorerPanelId()`/`EXPLORER_PANEL_COMPONENT` (+ its `"explorer-tab"` dockview registration string) → `dockPanelId()`/`DOCK_TAB_COMPONENT`/`"dock-tab"`; `dock-persistence.ts`'s `ExplorerStorage(s)`, `LoadedExplorerState`, `loadPersistedExplorerState`, `savePersistedExplorerState`, and its `"explorer-workspace:default"` storage key → `DockStorage(s)`, `LoadedDockState`, `loadPersistedDockState`, `savePersistedDockState`, `"dock-workspace:default"` (covered by this doc's own already-approved "rename freely" note on state/storage keys); `dock-context.ts`'s error message ("must be used within Explorer's..." → "...Workbench's..."); several stale code comments referencing old file/identifier names (`ExplorerTree.tsx`, `ExplorerJsonDefinitionContent.tsx`, `ExplorerTree's artifact list`) updated to match.

**One real, undocumented decision surfaced and resolved before executing**: the nav label "Explorer" and its `/explorer` route (`AppShell.tsx`, `App.tsx`) were never explicitly listed in this doc's scope, but point at exactly the same page this Change renames to `Workbench`. Flagged, confirmed, renamed to `/workbench`/"Workbench" — same non-issue reasoning already established for storage keys (single-user local dev app, nothing external depends on the URL).

Verification: repo-root `pnpm typecheck` (25/25 clean — one real break caught and fixed, `DockTabContent.tsx`'s panel-content imports were still relative paths assuming its old sibling-folder location and needed to become `@/`-absolute, split between `components/workbench/` and `components/explorer/` depending on which panel), `pnpm lint` (26/26 clean), `pnpm test` (all packages clean, web-app's 227 tests unchanged), a stray-string sweep for old identifiers/paths/`/explorer` route references (none found), dev server boots and both `/` and `/workbench` resolve 200.

## Change C48 - `flow-graph-panel` internal split + `shared/flow-graph/` kit + its two authoring panels - merged (PR #331)

### Discussion

The one genuinely complex, interdependent piece — isolated into its own Change specifically because it touches three panels' imports simultaneously (`flow-graph-panel`, `flow-authoring-panel`, `flow-authoring-preview-panel`) and deserves its own focused verification, not to ride along with Change C47's mechanical renames.

**The governing distinction, corrected mid-discussion: not "does this need a real run," it's "is this specific to how one panel composes itself, vs. a generic building block."** `flow-graph-panel` isn't a "run-mode" panel as a special category — it's just capable of running, same as it's capable of anything else its own composition needs. The right question for any given file is just whether other panels actually reach into it.

**`panels/` wrapper folder: rejected.** Considered nesting all panel-kind folders under `components/workbench/panels/` to visually separate them from `dock/` and the shared utilities. Dropped — it doesn't earn its place, since there's no other category of thing at that level to disambiguate from. The `-panel` suffix on each individual folder name already does that job once `panels/` isn't there to do it for them, so the suffix stays.

**`shared/flow-graph/`** — a domain-scoped kit, reused by _three_ panels (`flow-graph-panel`, `flow-authoring-panel`, `flow-authoring-preview-panel`), confirmed by grep: `Rail.tsx`, `SidePanel.tsx`, `GraphViewControls.tsx` (moved here after being found not toolbar-exclusive — `flow-authoring-preview-panel/Content.tsx` imports it directly too), and a `side-panel/` holding the three genuinely shared tabs — `ProblemsTab.tsx`/`ProblemsList.tsx` (content was `FlowProblemsList.tsx`), `ParametersTab.tsx`/`Parameters.tsx` (content was `FlowParameters.tsx`), `StepDetailsTab.tsx`/`step-details/` (content was `components/steps/*`). Checked and confirmed no other panel pair has this pattern (see Change C47) — `flow-graph` is genuinely the only domain-scoped kit today, not a guess dressed up as one.

**`flow-graph-panel/`'s own internals, once its shared pieces moved out:**

- **`toolbar/`** — earned a subfolder the same way `step-details`/`step-results` did: `RunToolbar.tsx` (213 lines) + `SimAuthoringBar.tsx` (41) + `SaveSimDialog.tsx` (119), all three rendered as siblings directly by `Content.tsx`.
- **`side-panel/`, the genuinely exclusive tabs**: `RunInputTab.tsx` (renamed from `ParamsTab.tsx` — not a stylistic call, a correction: the tab's actual UI label, in `Rail.tsx`, has always been "Run Input," not "Params"; the file name was simply stale) + `RunInputRow.tsx` (content, was `FlowVersionRunParamRow.tsx`, following the `FlowListItem`/`RunListItem` row-naming precedent already used elsewhere), `SettingsTab.tsx`, `SimTab.tsx`, `StepResultsTab.tsx` + `step-results/` (content, was `components/flow-version/StepResultsTab.tsx`'s whole subtree — `Content.tsx` replacing the old identically-named file to avoid a same-name collision with its own shell).

**General rule that emerged and generalizes beyond this one panel**: a tab's shell is always `side-panel/<Name>Tab.tsx`. Simple content (one component, nothing nested) stays a plain sibling file named after the tab minus "Tab" (`Parameters.tsx`, `ProblemsList.tsx`, `RunInputRow.tsx`). Content complex enough to have its own multi-file subtree earns a subfolder, same naming rule, with `Content.tsx` as its entry file (matching the `Content.tsx` convention already used at the panel level) — `step-details/`, `step-results/`. Subfolders are earned by real size, not applied as a default.

**Within a subfolder, drop only the prefix the folder already conveys — keep the suffix that names the component's role.** Same pattern `version/` already established in Change C47 (`List.tsx`/`Row.tsx`/`RunList.tsx` dropped `Version`, kept `List`/`Row`): `step-details/`'s five per-step-kind files drop the now-redundant `Step` prefix but keep `Details` — `BranchDetails.tsx`, `HttpJsonDetails.tsx`, `JoinDetails.tsx`, `McpDetails.tsx`, `ParallelDetails.tsx` (not bare `Branch.tsx`/`Join.tsx`/etc.). Two reasons, not just one: each of these files already imports a same-shaped type from `@lcase/types` (`StepBranch`, `StepHttpJson`, `StepJoin`, `StepMcp`, `StepParallel`) — keeping `Step` on the component too would collide with that type import in the same file, forcing exactly the import-site alias this rule exists to avoid; and separately, a bare name like `Join` reads ambiguously out of context (a database join? `Array.join`?) in a way `JoinDetails` doesn't. That second reason is specifically about `shared/` — `step-details/` lives under `shared/flow-graph/`, with an open-ended set of future importers, unlike `version/`'s narrow, closed, tree-only consumer set, which is why `version/` could afford to drop further than this. **Standing rule for future `shared/` additions**: default to keeping the role suffix: `shared/` code should read clearly out of context since anything might import it later; a domain-local folder like `version/` can lean on its own narrow, controlled context instead.

`flow-authoring-panel/` and `flow-authoring-preview-panel/` move here too (not in Change C47) precisely because they depend on `shared/flow-graph/` existing — both reach directly into it for `Rail`/`SidePanel`/`ProblemsTab`/`ParametersTab`(/`StepDetailsTab` for the preview panel), so they can't safely move independent of this Change's own work.

**Long-term uncertainty flagged, not acted on**: the user floated that `flow-authoring-panel` might eventually get absorbed entirely into `flow-graph-panel` (authoring becoming a mode of the main panel rather than a separate panel kind) — not decided, might not happen, but it's part of why this structure doesn't over-invest further in solidifying the authoring/graph boundary beyond what's already earned by real, current sharing.

**Added to this Change's scope: `components/explorer/` moves to `components/workbench/explorer/`.** Surfaced after Change C47 landed — `FlowExplorer` is something the Workbench composes (`pages/Workbench.tsx` renders it and the Dock together as its two halves), not a peer concept sitting beside the Workbench the way the top-level `components/` folder currently implies. Real precedent for nesting it this way: VS Code's own source nests its Explorer view under `workbench/` (`src/vs/workbench/contrib/files/browser/explorerView.ts`) — the same architecture this whole naming pass already borrows its vocabulary from. Folded into Change C48 specifically rather than given its own Change: Change C48 already empties `components/explorer/` down to just the tree files (moving `flow-authoring-panel/`/`flow-authoring-preview-panel/` out and splitting `flow-graph-panel/`), so it's already touching most of the surrounding import paths — a separate Change just for this one folder move would be pure overhead. Only the tree's own internal file names (`FlowExplorer.tsx`, `Row.tsx`, `version/`, `CreateFlowDialog.tsx`) are unaffected — this only moves the parent folder itself, `components/explorer/` → `components/workbench/explorer/`, updating every remaining importer.

### What actually landed

Matched the settled plan exactly — 27 files moved/renamed via `git mv` (18 pure moves, 9 move+rename), plus 6 files that only needed import-path fixes (`DockTabContent.tsx`, `step-details/Content.tsx`, `flow-graph-panels-slice.ts`, `pages/Workbench.tsx`, and one stale comment in `CodeEditorField.tsx`). One leftover empty directory (`components/explorer/flow-graph-panel/side-panel/`, from the earlier `git mv` moving its files out before the folder itself moved) was caught and removed before verification.

**Export identifiers renamed to match every renamed file**, same policy as Change C47: `ParamsTab`→`RunInputTab`, `StepBranchDetails`/`StepHttpJsonDetails`/`StepJoinDetails`/`StepMcpDetails`/`StepParallelDetails`→`BranchDetails`/`HttpJsonDetails`/`JoinDetails`/`McpDetails`/`ParallelDetails`. `step-details/Content.tsx`'s own export (`StepDetails`) was left as-is — it's the entry file, matching the `Content.tsx`-convention precedent already established for panel-level and tab-level entry files.

Verification: repo-root `pnpm typecheck` (25/25 clean — one real round of breaks caught and fixed, several relative imports in `flow-authoring-panel/`, `flow-authoring-preview-panel/`, and `flow-graph-panel/`'s own remaining files still pointed at old sibling locations like `../flow-graph-panel/Rail` and `./SidePanel`, now `@/`-absolute pointing at `shared/flow-graph/`), `pnpm lint` (26/26 clean), `pnpm test` (all packages clean, web-app's 227 tests unchanged), a stray-string sweep for `components/explorer/` and every renamed identifier (only the one stale comment found, fixed), dev server boots and both `/` and `/workbench` resolve 200.

This closes out the Workbench/Dock/FlowExplorer naming pass — Changes C46, C47, and 48 all merged/landed. Whatever's left, if anything, is Change C49's job (tentative, see `prune-old-pages.md`).

**Two more files caught during the user's own post-move review, folded into this Change before it closed**: `components/FlowGraph.tsx` (the actual `@xyflow/react`-backed graph renderer) was still sitting loose at the top of `components/`, never moved — used directly by `flow-graph-panel/Content.tsx` and `flow-authoring-preview-panel/Content.tsx` (2 of the 3 flow-graph domain panels, not `flow-authoring-panel`), the identical reuse shape as `Rail.tsx`/`SidePanel.tsx`/`GraphViewControls.tsx` already in `shared/flow-graph/`. Moved there too, name unchanged (`FlowGraph.tsx` isn't decomposable into a redundant-prefix-plus-role-suffix the way `version/`'s files were — it's one atomic name, same reasoning that left `step-details/Content.tsx`'s own `StepDetails` export alone). `components/flow-graph-nodes/` (`FlowStepNode.tsx`, `flow-step-accents.ts`) — `FlowGraph.tsx`'s only real dependency, plus a second consumer in `lib/flow-graph-layout.ts` — moved alongside it as `shared/flow-graph/nodes/`, dropping the now-redundant `flow-graph-` folder prefix (same pattern as `version/`/`step-details/`/`toolbar/`); the two files inside kept their own names, since neither is just repeating the domain prefix and `flow-step-accents.ts` specifically is read from well outside this domain (`lib/flow-graph-layout.ts`), where staying specific still matters. `lib/flow-graph-layout.ts` itself was checked and left in place — it's imported by two generic `hooks/` files, not just panel components, so `lib/` is correctly where it already was; noted in `docs/todo.md` as a flagged-not-scoped idea that `apps/web-app/src/lib/`'s own organization deserves a real look someday, without expanding this Change into that. Re-verified after the addition: repo-root typecheck/lint/test all clean (227 tests unchanged), dev server boots, both `/` and `/workbench` resolve 200.

**A third find, same review pass: `ThemeToggle.tsx` was the only file left loose directly under `components/`.** Single consumer (`pages/System.tsx`), 24 lines, purely a settings-page widget — doesn't qualify for `shared/`'s verified-multi-consumer invariant, and `pages/` has no existing per-page-subfolder convention to extend. Rather than invent one now (that's the next Change's job, see below), inlined directly into `System.tsx` and the file deleted — a separate file was unneeded indirection for a single caller, the same "no premature abstraction" default already applied elsewhere in this codebase. `components/` now holds zero loose top-level files, only domain folders. Re-verified again: typecheck/lint/test clean.

## Full settled tree (both Changes)

```
components/workbench/
  dock/                              (Change C47)
    DockTab.tsx
    DockTabContent.tsx
    DockWatermark.tsx
    dock-context.ts
    dock-panels.ts
    dock-theme.css

  shared/
    flow-graph/                      (Change C48)
      FlowGraph.tsx                    (Change C48 — was components/FlowGraph.tsx, found during post-move review)
      Rail.tsx
      SidePanel.tsx
      GraphViewControls.tsx
      nodes/                            (Change C48 — was components/flow-graph-nodes/, found during post-move review)
        FlowStepNode.tsx
        flow-step-accents.ts
      side-panel/
        ProblemsTab.tsx
        ProblemsList.tsx
        ParametersTab.tsx
        Parameters.tsx
        StepDetailsTab.tsx
        step-details/
          Content.tsx
          BranchDetails.tsx      (was StepBranchDetails.tsx)
          HttpJsonDetails.tsx    (was StepHttpJsonDetails.tsx)
          JoinDetails.tsx        (was StepJoinDetails.tsx)
          McpDetails.tsx         (was StepMcpDetails.tsx)
          ParallelDetails.tsx    (was StepParallelDetails.tsx)
    fields/                          (Change C46)
      InputField.tsx
      SwitchField.tsx
      SelectField.tsx
      CuratedParamsField.tsx
      IdentityField.tsx
      HeadersField.tsx
      CodeEditorField.tsx
      InputListField.tsx
      ExportsField.tsx
      EvalContextField.tsx
      EvalContextSourceFields.tsx
    CodeEditor.tsx                   (Change C46)
    MainPanelTypes.ts                (Change C46)
    CreateArtifactDialog.tsx         (Change C47)
    artifact-title.ts                (Change C47)
    tab-icons.ts                     (Change C47 — was explorer-tab-icons.ts, getExplorerTabIcon renamed getTabIcon)

  flow-graph-panel/                  (Change C48, except side-panel content noted below)
    Content.tsx
    use-flow-graph-panel.ts
    toolbar/
      RunToolbar.tsx
      SimAuthoringBar.tsx
      SaveSimDialog.tsx
    side-panel/
      RunInputTab.tsx
      RunInputRow.tsx           (Change C46 — lands early; exclusive content, not shared, so it doesn't belong in shared/flow-graph/. Folder created ahead of the panel's own shell move.)
      SettingsTab.tsx
      SimTab.tsx
      StepResultsTab.tsx
      step-results/                (Change C46 — same early-landing reasoning as RunInputRow.tsx above)
        Content.tsx
        StepOutputExportsPanel.tsx
        StepFieldResolutionPanel.tsx
        StepReferencesPanel.tsx
        FieldResolutionRow.tsx
        ReferenceRow.tsx
        ArtifactHashLoader.tsx

  flow-authoring-panel/              (Change C48)
  flow-authoring-preview-panel/      (Change C48)
  artifact-panel/                    (Change C47)
  artifact-authoring-panel/          (Change C47)
  event-graph-panel/                 (Change C47)
  event-payload-panel/               (Change C47)
  flow-settings-panel/               (Change C47)
    Content.tsx           (was ExplorerFlowSettingsContent.tsx)
  json-definition-panel/             (Change C47)
    Content.tsx           (was ExplorerJsonDefinitionContent.tsx)

  explorer/                          (Change C48 — moved from components/explorer/, tree-only, unchanged internally since Change C47)
    FlowExplorer.tsx                 (was ExplorerTree.tsx)
    Row.tsx                          (was ExplorerFlowRow.tsx)
    CreateFlowDialog.tsx
    version/
      List.tsx                        (was ExplorerVersionList.tsx)
      Row.tsx                         (was ExplorerVersionRow.tsx)
      RunList.tsx                     (was ExplorerVersionRunList.tsx)
      SimList.tsx                     (was ExplorerVersionSimList.tsx)
      ArtifactList.tsx                (was ExplorerVersionArtifactList.tsx)

pages/Workbench.tsx                 (Change C47 — was pages/Explorer.tsx)

redux/dock-persistence.ts           (Change C47 — was explorer-persistence.ts, renamed in place, not relocated)
redux/slices/dock-tabs-slice.ts     (Change C47 — was explorer-tabs-slice.ts, renamed in place, not relocated)
```

## Sequencing

**With Change C46**: some of Change C46's rescued survivors land inside folders Change C47/48 create (`components/workbench/shared/`, `components/workbench/shared/flow-graph/side-panel/`, etc.) before those Changes' own shell-file moves happen — see `prune-old-pages.md`'s Change C46 entry for the acknowledged interim state that creates. Not a strict phase boundary; all three Changes were always going to land close together.

**Change C47 before Change C48**: Change C48 depends on Change C47 having already created `components/workbench/` and `components/workbench/shared/` (the fully-generic pieces) — Change C48 only adds `shared/flow-graph/` on top of ground Change C47 already broke.

Change C47 merged (PR #330). Change C48 merged (PR #331) — full tree above matches what's actually on disk. Workbench/Dock/FlowExplorer naming pass complete.
