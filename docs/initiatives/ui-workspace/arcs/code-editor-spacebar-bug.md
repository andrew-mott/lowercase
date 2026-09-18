# UI Workspace Initiative — Arc: CodeEditor (Monaco) spacebar bug (Change C39)

**Previous:** [Flow authoring](./flow-authoring.md) (Change C38) · **Next:** [WebSocket → SSE for live events](./websocket-to-sse.md) (Change C40)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Continues from [`flow-authoring.md`](./flow-authoring.md) (Change C38) — a standalone infrastructure fix, not a continuation of that arc's own feature narrative, surfaced while testing it.

## Change C39 - Fix CodeEditor (Monaco)'s spacebar input bug - merged (PR #322)

`CodeEditor.tsx` (the shared Monaco wrapper used by both the flow-authoring and artifact-authoring editors, plus several read-only viewers) sometimes stops accepting spacebar input entirely. Real-priority, not a polish item — this blocks typing at all in an editor a user is actively relying on, not a narrow edge case. Re-sequenced ahead of its original slot in `Next up` specifically for that reason.

### Discussion

Everything below carries forward from Change C38's own testing (2026-08-19), not re-derived — see `docs/todo.md` for the same trace.

**Reported symptom, precise**: typing a space _immediately_ after a letter lands; pausing before pressing space causes it to silently do nothing. Not even the browser-native double-space-period substitution — that only shows up as a side effect of the user re-pressing space while already stuck, not an independent cause. Once it starts happening in a given editor instance, it can persist across many further keystrokes, not a one-off dropped character.

**One real theory investigated and ruled out, not just untried.** `CodeEditor` binds Monaco's `value` prop straight to the caller's own store (Redux for both editors, debounced ~250ms). `@monaco-editor/react`'s internal effect force-replaces the whole model's content whenever the `value` prop differs from `editor.getValue()` — so a debounced echo of the editor's _own_ recent typing could in theory arrive as a new `value` prop _after_ a newer keystroke Monaco had already applied locally, and get silently reverted by that resync. A real, buildable fix for exactly this race (gate adopting an external `value` change on the editor not currently having focus, via Monaco's `onDidFocusEditorText`/`onDidBlurEditorText`) was implemented and tested live against the actual symptom — **it did not fix it**, so this specific mechanism is ruled out, not just unconfirmed. Reverted rather than left in as unproven complexity in a widely-shared component.

**Not investigated yet — real next steps, not more guessing:**

- Whether it reproduces in a plain `<input>` elsewhere on the same page while stuck (distinguishes "Monaco-specific" from "dead everywhere on the page").
- Whether it reproduces in a fresh incognito/private window (rules out a browser extension intercepting spacebar — some do this for page-scroll shortcuts even inside focused editors).
- Whether it's tied to Monaco's own composition/IME-state handling getting stuck (a known flaky area upstream in some community reports) or something specific to this app's Monaco config/version — needs live debugging (breakpoints/event-listener inspection in devtools), not static code reading.
- Whether a hard reload clears it reliably (a stuck client-side state would suggest a different mechanism than a genuine per-keystroke bug).

Not scoped further yet — needs its own real investigation pass, likely requiring live interactive debugging rather than reasoning from code alone.

### What actually landed

The four untried steps above got answered by live testing, and the answers pointed somewhere new: a plain `<input>` elsewhere on the page stayed fine while Monaco was stuck (Monaco-specific, not dead-page-wide); it reproduced in a fresh incognito window (rules out a browser extension); a hard reload did not clear it (rules out simple stuck client-side state). Alongside those, a real reproducible trigger emerged, narrower and more useful than anything guessed before: opening a Flow Graph panel (plain or run) — not focusing it, just having one mounted anywhere in the dockview layout — was enough to break spacebar in Monaco; closing that panel fixed it immediately; reopening one broke it again immediately. Focus never mattered, only whether a `<FlowGraph>` instance was mounted.

That pointed straight at `@xyflow/react` (the Flow Graph panel's underlying library), confirmed by reading its source directly rather than guessed: `<ReactFlow>`'s `panActivationKeyCode` prop defaults to `'Space'`, and `FlowRendererComponent` tracks it via `useKeyPress(panActivationKeyCode, { target: win })` — `win` being `window` itself, so the listener is live on the whole page for as long as any `ReactFlow` instance is mounted, matching the focus-independent reproduction exactly. `useKeyPress` does have a guard meant to exclude typing in a real input (`isInputDOMNode`, checking `event.composedPath()[0]` against `INPUT`/`SELECT`/`TEXTAREA`/`contenteditable`, which should cover Monaco's real hidden `<textarea>`) — but empirically that guard wasn't holding up. Rather than chase exactly why inside a third-party library's internals, the fast, low-risk test was to just disable the feature: `panActivationKeyCode={null}` added to the single `<ReactFlow>` call in `FlowGraph.tsx`, which fully skips registering the listener (`useKeyPress` no-ops when `keyCode === null`). Confirmed live: no longer reproducible by opening Flow Graph panels.

Accepted as a real fix, not just a workaround, because the feature it removes wasn't doing anything for us: `panOnDrag` already defaults to `true` in xyflow, so click-drag already pans the canvas — `panActivationKeyCode`'s only actual effect was flipping scroll-wheel behavior from zoom to pan while held, a minor nicety nothing in this app was built around or documented anywhere. Trading it away for a working editor is a clean win regardless of why `isInputDOMNode` didn't catch Monaco's textarea in practice.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm vitest run` (286 tests, unchanged) all clean, plus the live reproduction test above.
