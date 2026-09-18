# UI Workspace Initiative — Arc: Sim/reuse badge on actually-reused steps (Change C41)

**Previous:** [WebSocket → SSE for live events](./websocket-to-sse.md) (Change C40) · **Next:** [Prune old pages](./prune-old-pages.md) (Changes C42–C46)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Continues from [`flow-graph-visual-rework.md`](./flow-graph-visual-rework.md) (Changes C29–C34) — the reused badge itself was built there; this is a wiring gap in what feeds it, not a continuation of that arc's own narrative.

## Change C41 - Show the sim/reuse badge on runs that actually reused steps, not just a sim's own parent run - merged (PR #324)

Runs produced by actually executing a simulation don't show the reused-step badge on steps that were genuinely reused during that run — only the sim's own parent run (the one it was authored from) shows it, reflecting the sim's declared plan rather than any run's real outcome.

### Discussion

**The badge component itself is not the gap — confirmed by reading it directly.** `FlowStepNode.tsx` already renders a real, dedicated "Reused badge" (a colored icon in the node's bottom-left corner, replacing an older inline `"↺ "` label-prefix design) whenever its `reused` prop is true. This works correctly whenever it's fed a true value — the gap is entirely in what decides that value, not in the visual itself.

**Root cause, traced precisely in `use-flow-graph-panel.ts`:**

```ts
const reuse =
  simDefinition && runId === simDefinition.spec.parentRunId
    ? simDefinition.spec.reuse
    : null;
const reusedStepIds = reuse ?? authoringReusedStepIds;
```

`reusedStepIds` — the prop `FlowGraph` actually uses to decide which nodes get the badge — is only ever sourced from `simDefinition.spec.reuse`, the sim's _declared_ plan, and only when the run currently being viewed is literally that sim's `parentRunId`. Viewing a run that was produced by _executing_ the sim (a different run entirely) leaves `reuse` as `null`, nothing falls back to it, and the badge never renders — even though that run has its own real, execution-time reuse outcomes.

**Correction, caught during further discussion, not assumed the first time: the data isn't just "available" in principle, it's already being read correctly by a different consumer.** `StepResultsTab.tsx` already derives its own reuse indicator this way:

```ts
const effectiveIsReused =
  isReused ?? (info?.sourceRunId !== undefined ? true : undefined);
```

`info.sourceRunId` is already captured in `deriveStepRunInfo`'s existing loop (`sourceRunId: "sourceRunId" in data ? data.sourceRunId : undefined`) and is only ever present on a `step.reused` event's data. So checking `sourceRunId !== undefined` is already a live, correct, working way to detect "this step was actually reused in this run" — proven by the side panel's own Reuse switch already using it. No new field on `StepRunInfo` is needed at all; the original plan to add one was based on an incomplete read of `use-step-run-info.ts` alone, before checking how the side panel already consumes it.

**Fix, now smaller than first scoped — one function, one file:** in `use-flow-graph-panel.ts`, derive `reusedStepIds` with a fallback sourced from `stepRunInfo` (already computed there) for the general case, mirroring `StepResultsTab.tsx`'s own `sourceRunId !== undefined` check, rather than exclusively from `simDefinition.spec.reuse` gated to the parent run. The plan-based signal (what a sim _intends_ to reuse, shown on its own parent run before anything's re-executed) and the outcome-based one (what a specific run _actually_ reused) are genuinely different things worth keeping distinct, not collapsed into one — this adds the missing fallback, reusing an existing proven pattern, rather than inventing a new one.

**Precedence order matters and there's already an established, correct answer for it — confirmed via `isReusedForStep`, the same helper that computes `StepResultsTab`'s `isReused` prop:**

```ts
function isReusedForStep(stepId, isControlFlowStep, simDraft, reuse) {
  if (isControlFlowStep || !stepId) return;
  if (simDraft) return simDraft.reuse.includes(stepId);
  if (reuse) return reuse.includes(stepId);
  return;
}
```

Draft-in-progress beats a saved sim's declared plan, and only when _neither_ applies does `StepResultsTab` fall through to the event-sourced `sourceRunId` check — event-sourcing is specifically the fallback of last resort, not an equal alternative. `reusedStepIds` for the graph badge should match that exact order: `authoringReusedStepIds ?? reuse ?? outcomeReusedStepIds` (draft, then saved plan, then event-sourced outcome) — not `reuse ?? authoringReusedStepIds ?? …`, which was the order first floated in discussion before checking `isReusedForStep` directly. In practice `simDraft` and `reuse` are already close to mutually exclusive (drafting a new sim and viewing an existing one's parent run are treated as separate modes elsewhere in this same hook), so the two orderings would rarely visibly differ — but matching the proven precedence exactly, rather than relying on that mutual exclusivity to paper over a different order, is the correct target.

**Supersedes part of an existing `docs/todo.md` note, not a fresh idea.** That note ("A step actually reused during a real run... should eventually get its own distinct graph-node symbol... explicitly tied to the not-yet-built custom node types work") predates `flow-graph-visual-rework.md`'s custom node types (Changes C29–C34) — the "distinct symbol" it asked for already exists (the badge itself). What's left of that note is exactly this Change: wiring real per-run reuse outcomes into it. To be removed from `docs/todo.md` once this lands, same as Change C39's spacebar-bug note was retired once its own arc existed.

**One more mechanic, caught by reading `use-flow-graph-panel.ts` and `use-flow-graph-replay.ts` directly rather than assumed: the new fallback needs to be replay-compatible, which constrains where it's computed.** The hook computes two versions of step-run info — a raw `stepRunInfo` (folded from the full event list) and `effectiveStepRunInfo` (from `useFlowGraphReplay`), which during an active replay is swapped for a version folded only from events up to the current replay position. Only `effectiveStepRunInfo` is exposed to callers (aliased back to `stepRunInfo` in the hook's return object), and `StepResultsTab` already consumes that aliased value — so its existing `sourceRunId !== undefined` check is already implicitly replay-aware: a step whose `step.reused` event hasn't been "reached" yet by replay correctly shows as not-yet-reused. For the new `outcomeReusedStepIds` fallback to behave the same way — consistent with everything else the graph already does during replay — it must derive from `effectiveStepRunInfo`, not the raw `stepRunInfo` computed earlier in the hook. **Correction made while writing the implementation plan, not assumed:** this doesn't actually require moving `reusedStepIds`'s computation anywhere — `useFlowGraphReplay` (and its `effectiveStepRunInfo` return value) is already called earlier in the hook than the `reuse`/`authoringReusedStepIds`/`reusedStepIds` block, so `effectiveStepRunInfo` is already in scope there. The only real change is adding the new derivation itself.

### What actually landed

Exactly the fix scoped above, in `use-flow-graph-panel.ts` alone: an `outcomeReusedStepIds` memo derived from `effectiveStepRunInfo` (`sourceRunId !== undefined` per step), and `reusedStepIds` changed from `reuse ?? authoringReusedStepIds` to `authoringReusedStepIds ?? reuse ?? outcomeReusedStepIds`. No other file touched — `FlowStepNode.tsx`'s badge and `StepResultsTab.tsx`'s side-panel switch were both already correct, as expected going in.

Turned out to be a genuinely small fix — the investigation (three rounds of correction: dropping an unneeded new `StepRunInfo` field, fixing the fallback precedence order, and confirming replay-consistency via `effectiveStepRunInfo`) was most of the real work here, not the code change itself. `pnpm typecheck`/`pnpm lint` passed clean; live-verified in browser against all four cases from the plan (executed-sim run showing the badge, sim's own parent run unchanged, live authoring toggle unchanged, and replay showing the badge appear in sync with replay reaching each step's `step.reused` event) — all confirmed working.
