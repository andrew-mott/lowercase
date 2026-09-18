# v0.1.0-alpha.12 - Eval / Measurement Vertical Slice

GitHub Milestone: https://github.com/lcaseio/lowercase/milestone/9

## Summary

This initiative proves the engine's intended experimentation loop end-to-end for the first time: run a flow, judge its output, store the score, and compare results — treating measurement as a first-class part of the system rather than something inferred after the fact from logs.

Background research that fed into this scope: [eval-research.md](./eval-research.md).

## Scope

- One evaluator type: a rubric-based LLM-as-judge producing a structured, multi-metric score (overall + named dimensions + rationale), not a single number.
- Eval logic implemented as an ordinary flow — no new engine primitives. The engine stays unaware "evals" exist as a category; orchestration (service/app logic, not engine internals) resolves the subject run's relevant export and hands it to the eval flow as a normal run param.
- A `kind` distinction on flows (business vs. eval) so eval flows are categorized and can be surfaced separately in the UI without cluttering the main runs view.
- An `EvalResult` storage shape: fixed, indexed columns for what every consumer needs (target run, evaluator identity, overall score, pass/fail, timestamps), plus a flexible JSON payload for the dimension breakdown and rationale — validated at the application layer, not pinned by the SQL schema. Individual dimensions can be promoted to real columns later if query patterns justify it.
- A lightweight "experiment" grouping so a set of intentionally-related runs (prompt variants, param sweeps) and their eval results correlate as one unit of work — human-authored name/description, with what actually varied between runs computed at display time rather than stored.
- A minimal comparison UI: a table of eval results plus a bar chart (reusing the existing echarts integration) showing scores across the runs in one experiment.

## Deliberately out of scope

Tracked as real follow-on work, not forgotten:

- **Pairwise/comparative judging** — the fork/sim system makes this cheap later, but it needs its own result shape and prompt design. Schema note: pairwise results need a second nullable target (e.g. `comparedToRunId`) rather than forcing a single-target row to represent a comparison.
- **Trace/process evaluation** of a run's execution path — a distinct, more differentiated follow-on. Mostly deterministic assertions against event history/run projections (branch resolution, step ordering, retry counts, artifact existence), configured per-flow via small declarative specs rather than bespoke code per flow. The qualitative slice of this ("was this retry actually justified") is really an LLM-judge variant fed trace context instead of final output, not a new mechanism.
- **Reference-based metrics** (BLEU/ROUGE, golden datasets) — gated behind a future decision on whether golden datasets are worth building at all. Not worth adopting a library for until that decision is made.
- **A general-purpose relational browser** across flows/runs/artifacts/evals (folder-style drill-down) — this initiative's comparison needs are a narrow slice of that larger idea.
- **Bulk/batch experiment orchestration** — this proves the single-run loop first; running N variants automatically comes after.
- **DuckDB / Parquet analytical storage** — SQLite + JSON column is sufficient at v1 volume. DuckDB can attach to the same SQLite file or read Parquet exports later as a downstream analytical layer without migrating the system of record now. Revisit only if a specific dimension's aggregate queries become a real bottleneck (mitigation before that: SQLite expression indexes / generated columns on a hot JSON path).

## Key design decisions (from planning discussion)

- **Cross-run data resolution stays out of the engine.** An eval flow needs data from the subject run it's judging. Resolved by the orchestrator (service layer) before the eval run starts, passed in as ordinary params — not a new `Ref` scope or engine effect. Keeps the engine's mental model intact: it runs flows given inputs, full stop, regardless of where those inputs originated.
- **Storage envelope is a hybrid, not fully generic (EAV) or fully wide.** Fixed columns for what's always queried (`overall`, `passed`, target/evaluator identity); one JSON payload for the evolving dimension breakdown, validated in application code (zod/ajv) the same way step exports already are. Promote a dimension to a real column later only once usage shows it's worth indexing.
- **"Eval version" is free.** Since eval logic is itself a flow, rubric/prompt changes are just new `FlowVersion`s of the eval flow — no parallel versioning system needed.
- **Experiment/unit-of-work grouping is a correlation key, not a dimension pin.** A nullable `experimentId` FK on `Run` (covering both subject and eval runs), denormalized onto `EvalResult` for query convenience. It doesn't fix "one flow version, one eval version" — a single experiment can span multiple flow versions being compared against each other. This is also what keeps JSON-column aggregate queries cheap in practice: real queries scope to one experiment's rows first, never the whole table.
- **What varied between runs in an experiment is computed, not stored** (diff params/flowVersion/mocks across rows sharing an `experimentId`), matching the same "derive don't duplicate" instinct used elsewhere (e.g. not storing which flow versions belong to an experiment).
- **Rubric quality is expected to need iteration**, the same way the weather flow's classification prompt did — the storage/loop design is solid, but the actual dimension set and wording for the judge prompt is a product of experimentation, not something to nail in this planning pass.

## Open questions for implementation planning

Not blocking initiative scope, but flagged for when this gets broken into Changes:

- Exact mechanism for inserting `EvalResult` rows into SQL — likely a new sink alongside `SqlRunProjectionSink`, tapping the bus the same way. Unclear yet whether any event payloads (`run.completed`/`failed`/`denied`) need new fields to make this cheap to consume.
- Chart/table implementation specifics in the web app (echarts config, which comparison views ship first).
- Whether `RunQueryPort` already exposes "get a named export's value for a completed run" or needs a small addition.
- How this decomposes into Changes — unknown yet, likely more than one given the surface area (schema/migration, first eval flow + judge prompt, orchestration service, UI panel).
