# Voice Pipeline — Arc A5: The engine dispatches http (Change C7)

**Previous:** [The worker's http executor](./worker-http-executor.md) (Changes C4–C6) · **Next:** [Binary uploads](./binary-uploads.md) (Change C8)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. This arc makes the engine plan and dispatch an `http` step, the last piece needed for a run containing one to execute end to end. The worker side is complete after A4: it receives `job.http.submitted`, executes it, and publishes the terminal. Nothing on the engine side sends that Message yet.

**Not in this arc:** retiring `httpjson`, or unifying its step type or events with `http`'s. Referencing a whole step output (`{{steps.X.output}}`), flow outputs, the artifact read path, and result retrieval for callers — all still under the Initiative's "Not yet scoped."

## Change C7 - Engine planning and dispatch for http - merged (#399)

### Discussion

Traced the engine's `httpjson` path end to end to see what `http` needs.

- **The terminal side is already done.** `job.catalog.ts` declares `job.http.completed`/`failed` on the terminal topic, `Engine.handleJobTerminal`'s signature accepts them, and `bind-subscriptions.ts` binds it generically. `handleJobFinished` dispatches only on `.endsWith(".completed"/".failed")`, never on capability, so nothing here changes. C5 already made this widening.
- **The planning and dispatch side is not built.** `stepPlannedPlanner` only branches on `stepType === "httpjson"`. `http` needs a new effect type mirroring `PublishJobHttpJsonSubmittedFx`, a handler mirroring `publish-job-httpjson-submitted.effect.ts` that publishes `job.http.submitted`, registry wiring, and a planner branch building the job data from `StepHttp`. `JobHttpData` is already `Omit<StepHttp, "type" | "on" | "exports">`, so the fields line up directly (`url`, `method`, `headers`, `body`, plus `refs` and `exportRefs`). There is no `args`, which is mcp-specific.
- **`EffectHandlerDeps.jobCommands` is typed to `MessagePublisher<"job.httpjson.submitted">` only.** It has to widen to admit `job.http.submitted`.
- **Ref analysis for `http` is mostly already done.** `flow-analysis` handles `http` steps in ref extraction and export declarations. `makeStepRefs` itself is step-type-agnostic.
- **One real gap in that plumbing: `getExportType` (`references/value-refs.ts`) returns `undefined` for any source step that is not `httpjson`.** A downstream ref to `steps.<http step>.exports.X` loses its declared content type. It then falls back to `application/json` in both `JobRunner.#resolveOneRef` and `resolve-branch-value.effect.ts`, so a `text/plain` export from an `http` step would be loaded under the wrong type. Nothing hits it today because no `http` step can run. It surfaces the first time one is chained into another step or a branch, so it belongs in this Change rather than later.
- **Settled: fix it by widening the hardcoded check to `http`, not by routing through flow-analysis's `stepExports`.** `stepExports` is the one place flow-analysis decides which step types declare exports, so using it would remove the engine's duplicate of that rule. That duplicate stays for now. `makeStepRefs` and its helpers exist to map engine runtime state onto what the worker needs to resolve a reference, while flow-analysis is the static side, and how those two should share this knowledge belongs to the later engine refactor rather than to this Change. Precomputing `exportType` during analysis was also considered and is deferred to the same refactor. The fix needs a test: an `http` step's `text/plain` export surfacing as `exportType` on a downstream ref, which fails before the fix.
- **`RunService`'s `STEP_TYPES_WITHOUT_EXECUTOR` gate has to drop `"http"`.** Today it refuses any flow containing an `http` step before a run exists. Its comment already names this Change's work as the reason it is there.
- **The job Messages' names are settled, not open.** C3 built `job.http.submitted`, `job.http.completed` and `job.http.failed`, so the Initiative's two "Open decisions" bullets about the command's name and generic terminals were stale and are cleared with this Change.

### What actually landed

Matches the discussion, with no deviations from the plan.

- **`jobCommands` widened.** The publisher type is now `MessagePublisher<"job.httpjson.submitted" | "job.http.submitted">` in the ports `EngineDeps`, the engine's `EffectHandlerDeps`, and both `build-engine.ts` files. Both process profiles already get their publisher from `router.publisher(jobCommandTopic)`, which covers both command types, so they needed no edits.
- **New effect.** `PublishJobHttpSubmittedFx` and `publish-job-http-submitted.effect.ts`, registered in `effect.registry.ts`. It is a deliberate sibling of the httpjson publisher rather than a shared function, since `httpjson` may be retired as a step type later and a shared abstraction built now could become dead weight to unwind.
- **Planner branch.** `stepPlannedPlanner` has an `http` branch that builds refs and export refs as the httpjson branch does, sets `capid` and `toolid` to `"http"`, and publishes one effect carrying `url`, the optional `method`, `headers` and `body` (passed through untouched, whichever of the three kinds), `refs`, and `exportRefs` only when the step declares exports.
- **`getExportType` widened** to read declared export types from `http` source steps as well as `httpjson`, as settled above.
- **`RunService` gate opened.** `STEP_TYPES_WITHOUT_EXECUTOR` now holds only `mcp`.
- **Tests.** Engine tests grew from 97 to 110: a new planner test file for `http` (one effect, scope, each body kind, omitted optional fields, `exportRefs` only when declared, refs with a param's hash and type), a new effect test adapted from the httpjson one, and a `value-refs` case for an `http` step's `text/plain` export. In app-services, the "refuses an http step" test became "accepts an http step" (which needs a declared `audio/wav` param and a stored artifact of that type, because param validation checks the artifact's content type), and the other refusal cases now use `mcp` steps only.
- **Deliberately not done.** No end-to-end test through a real worker: nothing exercises an `http` run through the whole path yet, and the run-result read path does not exist, so a run's binary output cannot be fetched through the API. Observability was not changed; it keys on a run id rather than the job type.
