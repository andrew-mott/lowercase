# UI Workspace Initiative — Arc: Panel icons and the main nav rail (Changes C19, C20)

**Previous:** [Event Graph](./event-graph.md) (Changes C16, C17) · **Next:** [Artifacts in Explorer](./artifacts-in-explorer.md) (Changes C21–C24)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Continues from [`event-graph.md`](./event-graph.md). Two small, unrelated pieces of visual identity work bundled together only because they landed back to back: distinguishing panel/tab kinds by icon, and replacing the app's outer left nav with a fixed-width rail. Continues in [`artifacts-in-explorer.md`](./artifacts-in-explorer.md).

## Change C19 - Panel/tab identity icons - merged (PR #302)

Ties each dockview panel/tab (and the tree row it came from) to the _kind_ of thing it actually is — a plain flow graph, a run, or a sim — with a small colored icon, rather than relying on tab-title text format alone. Cosmetic, but a real, already-felt pain point: today's titles distinguish these only by format (`"{version} Graph"` vs. `"{version} — {timestamp}"` vs. `"{version} — {sim.name}"`), so a run and a sim can look identical at a glance. This is Change C18's "general 'what am I looking at' signal" note, now scoped.

### Discussion

- **Icon reflects the entity kind a panel was opened as, fixed at open time — never the panel's current/live state.** A plain flow-graph panel keeps its flow-graph icon even after you run something from inside it; a run-opened panel keeps its run icon even if that run incidentally used a sim; a sim-opened panel keeps its sim icon. Simpler than tracking "what's currently applied" live, and matches the same fixed-at-creation identity model panel ids already use (`explorerPanelId()`).
- **Explicitly not showing an in-progress sim draft as its own marker** — not yet, at least.
- **Deliberately narrower than a full breadcrumb/status system.** The goal here is just tying a dockview panel concretely back to the tree item it represents. Fuller status signaling (a sim applied to a run, which run, etc.) stays a separate, later, more detailed idea.
- **Verified**: tree rows for Flow Graph/JSON Definition already have their own leaf-level icons (`NetworkIcon`/`CurlyBracesIcon`, `ExplorerVersionRow.tsx`), but individual run/sim rows have _no_ icon today — `HistoryIcon`/`BotIcon` currently sit only on the "Runs"/"Sims" _group-header_ rows. Decision: move those two icons down to each individual run/sim row (the actual leaf identity), and give the group headers a plain, undifferentiated folder icon instead — mirroring the convention from VS Code: containers get a generic folder glyph, only leaf items get a distinguishing icon.
- **Color, deliberately not tuned carefully — structure over polish for v1, adjustable later via a one-line `className` change per icon:** flow-graph (plain) = `text-blue-400`, json-definition = `text-yellow-400`, sim = `text-violet-400`, run = `text-rose-400`. Deliberately avoided colors already carrying a different meaning in this app: red/amber-600+ (destructive/warning), green (the Run button's own action color), cyan (problems-count/eval badges).
- **`OpenPanelRequest`'s `"flow-graph"` variant gets a real discriminated sub-field, not optional fields.** Verified via `ExplorerTabContent.tsx`: `kind` already means "which component renders this panel," and plain/run/sim all render the exact same `FlowGraphPanelContent` today — so splitting `kind` itself into three variants would conflate two different axes. Instead, `kind: "flow-graph"` stays a single variant, and its `runId?`/`simId?` optional fields become a proper nested union:
  ```ts
  | {
      kind: "flow-graph";
      label: string;
      versionId: string;
      openedAs:
        | { type: "plain" }
        | { type: "run"; runId: string }
        | { type: "sim"; simId: string };
    }
  ```
  Named `openedAs` (not `subject`/`entity`) specifically to name the _behavior_ — fixed at open time — not just the data shape.
- **No persistence version bump for this shape change.** This app has exactly one user (solo dev, alpha stage), so a manual `localStorage`/`sessionStorage` clear is an acceptable one-time fix if old panels render oddly after this ships.
- **Mechanism**: `dockview-core`'s `tabComponent` (parallel to the existing `components` content map, but for the tab itself), fed the same identity info already known at each of `ExplorerTree.tsx`'s three `openOrFocusPanel` call sites via `openedAs`.

### What actually landed

The design above landed as planned: `explorer-panels.ts`'s `openedAs` union, `explorer-tab-icons.ts` (icon+color constants plus `getExplorerTabIcon()`), `ExplorerTab.tsx` (wraps dockview's own `DockviewDefaultTab` with a colored icon prefix), tree-row icon relocation and coloring, and the Runs/Sims group headers becoming a plain open/closed `Folder`/`FolderOpen` glyph.

- **One real gap found only once wired up in the browser, not caught during planning**: registering `tabComponents={{ [EXPLORER_PANEL_COMPONENT]: ExplorerTab }}` on `DockviewReact` did nothing visible — dockview requires each individual panel to opt into a tab renderer via its own `tabComponent: string` field at `addPanel()` time, and `openOrFocusPanel()`'s `addPanel()` call never set one, so every panel kept using dockview's built-in default tab. Fixed by switching to `defaultTabComponent={ExplorerTab}` instead — the fallback used for any panel with no `tabComponent` set, which fits better anyway since every panel in this app is meant to use the same tab renderer.
- **Event Graph given an icon too, extending past the original scope.** Revisited after seeing every other tab colored and the Event Graph tab left plain. It mirrors its own toolbar button's icon (`ChartNoAxesGanttIcon`) with a new color (`text-teal-400`).
- **A visual-consistency pass across the whole tree, done after the initial implementation, at the user's request:**
  - Folder icons (open/closed) extended to every expandable row, not just the Runs/Sims headers — the top-level Flow row and the Version row both gained the same treatment.
  - The chevron-to-folder gap tightened to a dedicated `gap-0.5` wrapper around just that pair, applied everywhere the pairing occurs.
  - `py-1` → `py-0.5` applied uniformly across every row in the tree for a more compact overall density.

## Change C20 - Postman-style fixed-width main nav rail - merged (PR #303)

A side-track, unrelated to the Explorer work above — the app's outer, top-level left navigation (`layout/AppShell.tsx`), not the Explorer tree. Today it's built on shadcn's `Sidebar` primitive (`components/ui/sidebar.tsx`) with `collapsible="icon"`. In practice this means constantly resizing/toggling a panel that should just be fixed — the actual goal, Postman-style: a permanently fixed-width rail, a little-larger icon with a tiny label underneath each, that never expands.

### Discussion

- **Build a small dedicated rail component, not the shadcn `Sidebar` primitive.** That primitive's whole reason for existing — collapse/resize/mobile-sheet behavior — is exactly what's being removed; fighting it to _not_ do those things is more work than a fixed-width rail built from scratch.
- **Inactive items rendered muted** (dimmed, e.g. `text-muted-foreground`), active/current item full color — same active-detection logic already in `AppShell.tsx`, just restyled.
- **"Explorer" keeps its current label for now, deliberately not renamed to "Flows."** There's already a separate, older nav item literally labeled "Flows" (`/flows`, the pre-dockview page) — renaming "Explorer" now would put two rail items both saying "Flows" side by side. The rename only makes sense once that old page is actually retired.
- **Explicitly not addressing the future routing-pattern split.** The eventual vision is that most rail items stop navigating to a different page at all and instead just change what's shown in a tree/panel (Postman's own Collections/Environments/History switch) — but nothing concrete needs that yet.

### What actually landed

The design above landed as planned: `AppShell.tsx`'s `SidebarProvider`/`Sidebar`/`SidebarInset` structure replaced with a plain fixed-width (`w-16`) flex `<nav>`, each item a `<Link>` rendering a slightly-larger icon with its label always visible underneath, muted when inactive and full-color/background when active — same `isActive` computation as before, untouched.

`<TooltipProvider>` deliberately kept in `AppShell.tsx` even though the rail itself no longer uses tooltips — it's the only place that provider is mounted in the app, and both the Flow Graph and Event Graph panels' own `Rail.tsx` components rely on it as their `Tooltip`'s Radix context ancestor.

`components/ui/sidebar.tsx` deleted outright, along with `components/ui/sheet.tsx` and `hooks/use-mobile.ts` — both confirmed to have no consumer left anywhere once `sidebar.tsx`'s mobile-drawer behavior was gone. Icon size tuned down slightly from the plan's initial `size-6` to `size-4` once seen in the browser.
