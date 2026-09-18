# UI Workspace Initiative — Arc: Flow graph visual rework (Changes C29–C34)

**Previous:** [Expand content into its own tab](./expand-content.md) (Changes C27, C28) · **Next:** [Replay](./replay.md) (Changes C35, C37)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Continues from [`expand-content.md`](./expand-content.md). One continuous arc, elevated ahead of the end-of-August demo window: swapping to a real dagre layout, consolidating the toolbar and fixing `fitView`, building custom node types, extending them to every step type, and giving branch steps their own details view plus a side-panel visual polish pass. Continues in [`replay.md`](./replay.md).

## Change C29 - Flow graph — swap to a real layout library (dagre), two layouts - merged (PR #312)

Step (1) of the graph-rework sub-sequence — the first concrete Change carved out of it.

### Discussion

- **Scope decision, discussed directly, refined once traced precisely — two genuinely different old-mode tiers, not one.** `graphLayout()` is called from 6 places today, splitting into two groups with different risk profiles:
  - **Group 1 — the oldest UI tier, predates this month's dockview revision entirely**: `FlowEditPanel`/`pages/FlowsEdit.tsx`, `RunnerFlowView`/`pages/Runner.tsx`, `RunDetailsFlowViewer`/`pages/RunDetails.tsx`, `SimsFlowView`/`pages/sims/CreateSim.tsx`+`ViewSim.tsx` — each has its own fully inline `<ReactFlow>` rendering and calls `analyzeFlow`/`toposort`/`graphLayout` directly, never touching `FlowGraph.tsx` at all. Automatically unaffected by this Change, since `graphLayout()` itself stays untouched.
  - **Group 2 — the `FlowVersionModeNav` per-version pages (View/Edit/Run/Run History/Sims)**: render `<FlowGraph layout={flowAnalysis?.layout ?? null} .../>`, taking `flowAnalysis` as a fully opaque prop — genuinely the same hook and the same `FlowGraph.tsx` component new-mode's Explorer panel uses. Swapping `useFlowAnalysis`'s internals is a safe, in-place shared upgrade, not a fork — both old-mode's per-version graph views and new-mode's Explorer panel get dagre layout for free.
  - **Accepted, deliberate consequence**: old-mode's per-version pages have no toolbar to host a TB/LR toggle, so they'll just render at a fixed default orientation with no user control.
  - **`useFlowAnalysis` gains an optional second `direction` param, defaulting to `"TB"`** — old-mode's existing single-arg call sites need zero changes.
- **Layouts wanted**: exactly two — vertical top-to-bottom and horizontal left-to-right, both center-aligned, switchable via toolbar buttons. `dagre`'s `rankdir: "TB"`/`"LR"` gives both from one config flag. Not a real flow editor yet — no arbitrary node dragging/persistence.
- **Toggle state, new-mode**: a new panel-keyed field on `flow-graph-panels-slice.ts`, persisted per ADR-0004 like every other per-panel preference.
- **Library choice re-confirmed via discussion, not just defaulted to.** Weighed against `elkjs` (more powerful, but async/worker-based, much bigger config surface) and `d3-hierarchy` (disqualified outright — it's a tree layout, and this app's flow defs have `join`/branch-merge steps with multiple parents, not a tree). **Use `@dagrejs/dagre`, not the plain `dagre` package** — the original is long unmaintained; the fork is what react-flow's own examples reference today.
  - **Two known dagre+React-Flow gotchas to build around from the start**: (1) dagre needs explicit `{width, height}` set per node before layout, or positions come out degenerate/overlapping; (2) dagre's output `{x, y}` is each node's _center_, while React Flow's `position` is top-left.
- **Explicitly not this Change**: folding React Flow's `<Controls>` into the toolbar, the `fitView` bug fix, custom nodes, branch-step details — Change C30/31/32 below.

### What actually landed

Two real fixes found only once tested in the browser, neither anticipated in planning, both root-caused precisely rather than patched around.

The design above landed as planned: new `apps/web-app/src/lib/flow-graph-layout.ts` (`computeDagreLayout`, `@dagrejs/dagre`), `useFlowAnalysis`'s new optional `direction` param, `FlowGraph.tsx`'s node loop consuming a position map instead of the old row/col grid, `layoutDirection` on `flow-graph-panels-slice.ts`, and two toggle buttons in `RunToolbar.tsx`.

- **Overlapping edges and labels for a branch step's case + mandatory default routing to the same target** — a real, pre-existing bug independent of dagre, not something this Change introduced. Checked directly against `@xyflow/system`'s actual bezier-path math: React Flow's default edge type draws its curve purely from node positions with no awareness that a second edge shares the same endpoints, and varying `pathOptions.curvature` has zero effect here specifically. Fixed at the source instead of the render layer: `FlowGraph.tsx` now groups a node's out-edges by target before building React Flow edges, combining same-target edges into one with a joined label (`"x / default"`). Real handle-based separation is deferred to Change C31.
- **The LR layout initially looked wrong/unreadable.** Root cause: React Flow's default node renders its connection handles at a fixed `sourcePosition`/`targetPosition`, regardless of how dagre actually arranged the nodes. Fixed without needing a custom node at all — `computeDagreLayout` attaches direction-appropriate `sourcePosition`/`targetPosition` to each entry in the same position map it already returns.
- **Found, not fixed here**: even with handles correctly repositioned, LR still visually sprawls, because today's fixed 200×50 node box is wide-and-short. Logged as a concrete requirement for Change C31, including the user's accepted fallback: drop to shipping one layout if making both look good via custom nodes turns into a real time sink.

Verified: typecheck/lint/vitest clean (214 tests, 6 new) across all 25 workspace packages, plus manual browser testing of both layout directions, reload persistence, a branch step's merged-edge label, and confirming old-mode's per-version pages pick up dagre automatically with no visible breakage.

## Change C30 - Flow graph — one toolbar, fix fitView - merged (PR #313)

Step (2): fold React Flow's built-in `<Controls>` into the same custom toolbar as Change C29's layout-switch buttons, one surface instead of two. Deliberately sequenced after Change C29, in case the still-parked `fitView` manual-re-click bug turns out to be caused by the current custom layout code.

### Discussion

**Confirmed while testing Change C29: the old manual-re-click bug does look fixed** — likely a side effect of the dagre swap rather than something separately fixed.

**A second, real, previously-undescribed fitView bug found and root-caused precisely while testing Change C29 — this Change now also covers fixing it.** Symptom: a panel revisited after a browser reload sometimes renders pinned to the viewport's top-left origin, affecting _exactly_ whichever tabs were **not** the active tab in their dockview group at the moment of reload.

- **Root cause, traced through actual library source, not assumed**: `dockview-react` creates exactly one persistent React portal per panel at panel-creation time — but `fromJSON()`'s bulk restore-on-reload has to recreate every panel's view immediately, including background tabs, and a background tab's content element is never appended into the visible DOM at all, so it mounts genuinely disconnected from the document. `@xyflow/react`'s `useResizeHandler` gates its own dimension measurement on `checkVisibility()`, which returns `false` for anything disconnected — so `fitView`'s one-shot mount effect has nothing to compute against.
- **First fix considered, then improved on during discussion**: drive `fitView` imperatively via `api.isVisible`/`onDidVisibilityChange`. Correctly fixes the bug, but `isVisible` toggles on _every_ ordinary tab switch, not just reload — re-fitting on each one would discard a manually-panned/zoomed view every time you switch back.
- **Fix actually settled on: persist the real viewport per panel, don't call `fitView` opportunistically at all.** New panel-keyed field: `viewport: {x, y, zoom} | null`. A panel with a persisted viewport gets `defaultViewport={viewport}` and no `fitView` prop (mutually exclusive per React Flow's own docs); a genuinely first-ever open still gets `fitView`. `onMoveEnd` persists on every real pan/zoom settle — `fitView()`'s own implementation ends by calling the same `setViewport(...)` a manual pan/zoom goes through, so the first open's own fit result flows through the same path and seeds the persisted viewport automatically.
- **Why this is better than the visibility-driven fix**: it also fixes a second thing the visibility-driven fix wouldn't have — even the working case (the active tab at reload) used to re-fit from scratch every time rather than restoring the user's actual prior pan/zoom.

**Toolbar consolidation, scope settled through discussion — narrower than "port `<Controls>` over as-is."** `<Controls>`'s buttons are trivial wrappers over `useReactFlow()`'s `zoomIn()`/`zoomOut()`/`fitView()`. Since `RunToolbar` already renders inside `<ReactFlow>`'s own context tree, it can call these hooks directly. Two more control ideas were considered and explicitly shelved: a select-vs-pan interaction-mode toggle (nothing to select for yet), and a lock button (React Flow's own "lock" concept doesn't map cleanly once nodes are already non-draggable/non-connectable). **Settled toolbar scope**: just Zoom In, Zoom Out, Fit View, folded into `RunToolbar` — one row, no separate `<Controls>` widget.

**A small, related gap closed alongside this**: `FlowGraph.tsx` didn't explicitly set `nodesDraggable`/`nodesConnectable`, so React Flow's defaults (`true`) were technically in effect even though nothing in this app supports either today. This Change sets both `false` explicitly.

### What actually landed

The design above landed as planned, plus two small follow-ups decided during review. `flow-graph-panels-slice.ts` gained `viewport`/`viewportChanged`; `FlowGraph.tsx` branches between `defaultViewport` and `fitView`, wires `onMoveEnd` unconditionally, sets `nodesDraggable={false}`/`nodesConnectable={false}`, and renders `<Controls />` only when no `toolbar` was supplied — old-mode's two call sites are fully unaffected. `RunToolbar.tsx` gained Zoom In/Zoom Out/Fit View buttons.

- **Considered during review, decided against**: hiding the Simulate button outright for plain-opened panels. Caught before implementing: Change C18's whole design already lets a _plain_ panel author a sim once it has a real run loaded. Fixed the actual rough edge instead — `SimTab.tsx`'s no-run placeholder text now spells out both real paths.
- A vertical separator was added to the toolbar using the existing shadcn `Separator`.

Verified: typecheck/lint/vitest clean (217 tests, 3 new) across all 25 workspace packages, plus manual browser testing of viewport persistence across both ordinary tab-switching and a real reload, the new zoom/fit-view buttons, node drag/connect now genuinely disabled, and old-mode's `<Controls>` widget confirmed unchanged.

## Change C31 - Flow graph — custom node types - merged (PR #314)

Step (3): the named home for showing run-reuse vs. authoring-draft-reuse distinctly and any other per-node status, elevated ahead of the end-of-August demo window.

### Discussion

**A real requirement surfaced while testing Change C29's LR layout, not just a nice-to-have**: today's plain default node is a fixed, wide/short box — reads fine stacked vertically (TB), but in LR the box's width becomes the dimension consuming space along the flow's own axis. No clean fix without custom nodes. **Accepted fallback, decided in advance**: if making both layouts look genuinely good via custom nodes turns into a real time sink, drop back to shipping just one layout (very likely TB) rather than losing time chasing two.

**Ground rules and sequencing:**

- **Exactly 5 step types to design for**: `httpjson`, `mcp`, `branch`, `join`, `parallel`. `nodeTypes` isn't used anywhere in this codebase today — fully greenfield.
- **Start with exactly one step type — `httpjson`** — the only one that does real work today and used in every flow. `mcp` is functionally semi-dead per the user, so a custom node visual for it may just not get built at all.
- **New directory: `components/flow-graph-nodes/`** — mirrors the existing `components/steps/` convention for the node-box side instead of the side-panel-details side.

**v1 scope, settled through discussion — deliberately narrow, explicitly a test of two specific things, not a finished node design:**

- **Read-only, no inline editing.** Making node fields genuinely editable on the canvas would be starting real Edit-mode work by a side door, not a visual pass.
- **No field/body content shown at all, and no collapse/expand** — both explicitly deferred.
- **A colored header bar indicating step type.**
- **Per-output-edge cardinality, confirmed directly against the actual step schemas**: `httpjson`/`mcp` — 0, 1, or 2 out-edges; `branch` — N+1, unbounded; `parallel` — N, unbounded; `join` — exactly 1.
- **In-edges stay a single shared target handle regardless of how many things point at it.**
- **Out-edges: render one real handle per edge actually declared/wired for that specific step instance** — not a fixed maximal slot set, since an unwired-but-possible connection point has no payload in a genuinely read-only viewer.
- **Sizing stays simple**: out-edge count is data already known before anything renders, so the node-size estimate can stay a plain formula — no two-pass measure-then-layout machinery needed for v1.
- **v1's actual purpose**: test whether the colored-header-bar treatment reads well, and whether genuinely-separate per-output edges look/feel right structurally.
- **A real, deliberately unresolved tension to watch for empirically**: separate handles will likely look good for low out-edge counts but could get visually cramped for a high-cardinality branch/parallel step. The real answer may end up being a hybrid, worth judging once both examples exist side by side.

Not yet through Plan Mode — this is the settled v1 design, discussed and root-caused before any implementation plan.

### What actually landed

Well past the original v1 plan. Core scope: `FlowStepNode.tsx` is httpjson's real custom node, registered via `nodeTypes`; `flow-step-accents.ts` holds the step-type accent lookup plus every shared color/style helper. `outEdges[node]` is now rendered as one real `<Handle>` per wired edge instead of Change C29's merge-by-target workaround. `flow-graph-layout.ts`'s `sizeForNode()` grows a node's width (TB) or height (LR) by real handle count, not a guess.

Two real, unplanned bugs found and fixed: (1) React Flow caches each handle's measured DOM bounds and doesn't auto-refresh just because a handle's position changed via props — fixed with `useUpdateNodeInternals()`. (2) A join's inbound edges were rendering red — `getGateColor`/`edgeLabel` treated any non-`"onSuccess"` gate as failure. Fixed by keying off `edge.type === "control"` first.

The visual design arc, mostly settled through direct iteration: TB's out-edge labels tried a 90° rotation, then 45°, before landing on flat/unrotated text with wider spacing. LR's out-edges anchor top-down from a fixed offset. `HTTPJSON_NODE_WIDTH` shrank twice (200 → 120 → 100). Status moved from a node-level border into a corner badge once it became clear a colored border competes visually with the gate-colored edges leaving it. Reuse got the mirrored treatment (bottom-left badge). Selection is its own box-shadow ring.

Explicitly not done in this Change: every step type except httpjson; animating the taken edge; the never-run-step edge-fade gap; and reuse state not surfacing in the graph for sim-run panels specifically.

## Change C32 - Flow graph — custom nodes for mcp + join - merged (PR #315)

Continuation of Change C31's custom-node work. Next up since it's cheap and mechanical (reordered ahead of branch/parallel and branch-step-details, per the user).

### Discussion

- **mcp fits Change C31's existing pattern exactly, confirmed by reading the code** — `StepMcp` is `StepCapCommonFields & StepOnField`, and `addCapEdges` handles `StepMcp | StepHttpJson` through the identical branch, producing the same 0-2-edge `type: "control"` shape.
- **join's outbound edge turned out not to be gate/color-neutral, corrected by reading `addJoinEdges`.** join's single `next` edge is built as a real `{ type: "control", gate: "onSuccess" }` edge, identical in shape to an httpjson success edge. Render it exactly as such — green, labeled "success."
- **A related engine gap, found while tracing the above, explicitly not being fixed in this Change**: a failed join step never actually emits `step.failed` — traced to two real bugs in `step-started.planner.ts`/`plan-join-edge.reducer.ts`. Per the user, deliberately left alone: part of a larger, separate planned rework of control-flow step lifecycle events.
- **Accent colors, decided**: mcp gets a lime/green tone (`bg-lime-800`); join gets a dark amber/orange (`bg-amber-800`).
- **Branch and parallel are deliberately excluded from this Change** — see Change C33, their own real design question.

### What actually landed

Small, mostly as-scoped, with one addition found during review. Two new entries in `FLOW_STEP_ACCENTS`: `mcp` and `join`. The only real code fix needed: `flow-graph-layout.ts`'s `sizeForNode()` special-cased `stepType !== "httpjson"` by name — fixed by keying that check off `getFlowStepAccent(stepType)` instead, so the accent map is now the single source of truth. Also renamed `"flowStepHttpJson"` → `"flowStep"` and `HTTPJSON_NODE_WIDTH` → `CUSTOM_NODE_WIDTH`.

One addition beyond scope: join's _inbound_ edges rendered with no color at all once the Change C31 miscoloring bug was fixed. `getGateColor()` now returns a new `JOIN_EDGE_COLOR` for `edge.type === "join"`, tied to the same Tailwind token behind join's own header strip.

Also discussed while reviewing, deliberately not built here: animating a run's taken edges (marching-ants style) — recorded in full under Change C31's open follow-ups.

## Change C33 - Flow graph — branch/parallel node handling - merged (PR #316)

Branch/parallel's unbounded out-edge cardinality — a real design question but not treated as urgent or severe. User's grounded read: linear handle spacing produces a tall (LR) or wide (TB) node as edge count grows, but that reads fine in practice until genuinely extreme counts (50-100+ edges, not the 5-10 a typical branch might realistically have).

### Discussion

**Settled fallback strategy, not yet built, for whenever a step's real edge count crosses some threshold**: collapse back to a single shared handle point and rely on edge labels to carry the distinction. Exact threshold not picked.

- **The cardinality fallback is deliberately deferred, not built in this Change** — ship the straightforward "one real handle per wired edge" version first.
- **A real bug found while scoping: `edgeLabel()` returns the literal `edge.type` string for any non-control edge** — fine for join, but wrong for branch, where every case handle would show the same word instead of the real case value. Fixed as part of making branch usable at all.
- **Branch gets a real "taken vs. untaken" treatment in this Change** — confirmed the data already exists end-to-end: `resolve-branch-value.effect.ts` sets `matchedCase`, already flowing through `step.completed` events into `StepRunInfo.matchedCase`.
- **Parallel gets a different, simpler treatment, derived from the target step's status, not the parallel step's own.** `use-step-run-info.ts`'s `StepStatus` never surfaces a "planned" state, so "has this parallel branch actually kicked off" is just `stepRunInfo[edge.endStepId]?.status !== "initialized"` — a small signature change, since today's `getEdgeStyle` only ever looks at the edge's source step's status.
- **Accent colors, decided**: branch → `bg-stone-700` (Tailwind has no true "brown"); parallel → `bg-pink-800`.

**A real, pre-existing dagre issue surfaced during manual testing, not new to this Change.** A pure fan-out from one node was rendering with unnecessary edge-to-handle crossings. Traced to dagre's own `order()` function: `initOrder()`'s DFS already produces a 0-crossing layout on a from-scratch layout, but dagre then runs up to 4 more crossing-reduction sweeps regardless and keeps whichever _later_ tied-score layout comes out last, not the first/best-matching one.

**Fix applied, accepted based on real usage**: `dagre.layout(g, { disableOptimalOrderHeuristic: true })`. Known trade-off: this is a global toggle, not scoped to fan-outs specifically. Tested against a deliberately tangled 11-step synthetic fixture (`examples/layout-stress-test.flow.json`, using all five step types) rather than the user's real (too-small) flows — still looks good.

### What actually landed

Went well past the original branch/parallel scope, into a real redesign of the edge visual language plus two more engine-gap discoveries. Core scope shipped as planned: `branch`/`parallel` accent entries (landing on `bg-blue-800`/`bg-pink-800`), `edgeHandleId()` fixing a real gate-collision bug (branch/parallel edges all share `gate: "always"`), and `edgeLabel()` fixed to show real case values.

**The edge-color model was redesigned mid-Change, from "match the destination node's color" to "communicate the kind of condition."** parallel and join's inbound edges are structurally the same thing (unconditional, always taken once reached), so they now share one neutral color (`UNCONDITIONAL_EDGE_COLOR`) instead of each getting a bespoke per-type one.

**Taken/untaken redesigned twice more after the initial bold/fade treatment shipped.** Settled on dash pattern + width as the sole taken/untaken channel, opacity dropped entirely. `isEdgeTaken()` was rewritten to cover all four `EdgeType`s explicitly, which surfaced a real, subtle bug: join's inbound edges were falling through to control-only generic handling and could never render as taken.

**A second, deeper engine gap found while wiring up the animation feature.** A join's own status essentially never reaches the UI at all, success included — worse than Change C32's finding. Full trace in `docs/todo.md`, not fixed here. **Interim UI workaround, explicitly provisional**: `isEdgeTaken()` special-cases a join's outbound `control` edge to read whether `next` has started instead of the join's own status.

**Animation added as the last piece**: `isEdgeAnimating()` layers a "still in flight" sub-state on top of "taken" — animates via React Flow's native `animated` edge flag while the relevant downstream step is `"running"`, settles to a static dash once resolved, never animates a historical/finished run.

## Change C34 - Flow graph — branch step details + side-panel field visual polish - merged (PR #317)

Step (4)'s original scope: a gap named early but never actually built — branch steps have no dedicated details view. Reordered after Change C32/33 since the mcp+join and branch/parallel node work were judged more pressing.

### Discussion

**Expanded, deliberately bundled into the same Change rather than split out** — the user's own framing: since this work already touches the flow graph's side panel, fold in adjacent side-panel polish that's been waiting.

- **Step Results tab audit for control-flow steps.** `StepResultsTab.tsx` is fully generic across step types, clearly built with capability steps in mind. Scope is explicitly an audit, not a redesign: "make changes where it makes sense, otherwise don't."
- **Side-panel field layout — labels above inputs, not beside.** `InputField.tsx` hard-codes `Field orientation="horizontal"` with a fixed `w-20` label column. The `Field` primitive already has a built-in `orientation="vertical"` variant — switching an existing variant, not inventing a new layout.
- **A real, specific redundant-label bug**: `ParametersTab.tsx` hardcodes `label="Parameters"` into `FlowParameters`, double-rendering the same word the side panel's own tab chrome already shows as the header.
- **Run Input (`ParamsTab.tsx`) needs a real color treatment for viewing a historical run, and none currently exists.**
- **`CodeEditorField`/`ExportsField` both need real layout fixes, not just the orientation flip.**
- **Idea, not yet designed: carry the flow graph node's own accent color into `StepDetailsTab`** — confirmed cheap to wire, but explicitly needs a real "how should this actually render" discussion before implementing.

**Process decision: no formal Plan Mode pass for this Change.** The mechanical items above are precisely scoped through this discussion already; the genuinely exploratory pieces get iterated live once real screens are in front of them.

### What actually landed

Largely as scoped, plus one addition found while closing out the branch/mcp gap together, and one originally-scoped item that didn't actually get resolved.

`StepBranchDetails.tsx` (new) mirrors `StepJoinDetails`/`StepParallelDetails`. While wiring it into `StepDetails.tsx`'s switch, noticed `mcp` was the only other step type still falling through to "no details view for step type" — built `StepMcpDetails.tsx` too, not originally scoped but small. With all 5 step types now handled, removed `StepDetails.tsx`'s `default` case entirely — a 6th step type added later without a matching details view now fails to compile instead of silently rendering a generic placeholder.

Field layout mechanical batch: `InputField`/`HeadersField`/`InputListField` flipped from horizontal to vertical orientation, converging through live iteration on a shared visual language. Not every field got the vertical flip — `SwitchField`/`CuratedParamsField`/`FlowParameters` stayed horizontal, a real per-field call. `CodeEditorField` got its own real layout, not just the orientation flip. `CodeEditor.tsx` gained optional `fontSize`/`lineHeight`/`folding`/`lineNumbersMinChars` props. One real typecheck break surfaced and fixed: `lineNumbersMinChars` was declared required instead of optional.

The redundant "Parameters" label bug: fixed functionally, not structurally — the call site itself wasn't cleaned up, left alone deliberately since `FlowVersionDetailsPanel.tsx` (old-mode) still passes a different, meaningful `label="Params"` into the same shared component.

`ExportsField`'s duplicate export-`type` display — flagged during scoping, but not actually fixed here; only the surrounding visual polish landed. Left as a known, real gap.

Historical-run color treatment for Run Input: landed — `FlowVersionRunParamRow.tsx`'s `readOnly` branch now renders in `text-amber-200`.

Two real, unscoped bugs found and fixed: an `AccordionItem` divider rendering stark white in dark mode (fixed with an explicit `border-border` class, a shared primitive fix affecting every accordion in the app); and a `Select`'s focus ring clipping in the artifact metadata panel, root-caused to a nested `overflow-y-auto` div silently becoming `overflow-x: auto` too — resolved when the user removed that nested scroll container directly.

The Step Results "Fields"/"Refs" sub-tabs' maximize/open-in-main-panel buttons were removed — both routed through the same no-op every other "open in main panel" button already stubs out.

The branch step-results status line's `matchedCase` handling had a real, found-by-tracing-the-code bug: plain JS truthiness meant `null` (a resolved match against the _default_ edge) and `undefined` (nothing resolved yet) rendered identically. Fixed to check for `undefined` explicitly.

**Explicitly not this Change**: the accent-color-carryover idea — the one item flagged from the start as needing a real design discussion first; that discussion never happened, so nothing built. `ExportsField`'s duplicate type display. Making the branch case/default result more visually prominent — discussed, genuinely left undecided.
