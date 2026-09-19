# Voice Pipeline — Arc A1: The http step (Changes C1–C1)

**Next:** [Content types](./content-types.md) (Changes C2)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. This arc makes the `http` step a real flow step, starting with its definition: the schema pipeline it pilots, parsing and flow analysis.

## Change C1 - Schema pipeline and the http step definition - merged (#393)

A flow containing an `http` step parses, validates and analyzes. The step's shape is written once, as JSON Schema, and its TypeScript type is generated from that schema. Nothing executes the step yet, so a run of such a flow is refused rather than started.

### Discussion

- **Where the pieces live.** The schema source is a JSON file in `packages/specs`, the package that already owns the flow-definition schema. The generated `StepHttp` type lands in `packages/types`, where every consumer already imports step types from. A generator script writes it, so neither package imports the other in the wrong direction.
- **The generated type is committed.** It is readable in review, and turbo does not need a codegen step for `packages/types` to depend on. A check regenerates it and fails on any difference, so the committed file cannot drift from its schema.
- **The step's shape.** `type`, `url`, `method`, `headers`, `body`, `exports` and `on`. `body` is one of the three kinds in the Initiative's design principles (`json`, `artifact`, `multipart`). `pipe`, `tool` and `args`, which `httpjson` shares with other capability steps, are left out until something reads them for `http`.
- **Shared shapes are restated, and checked.** `on` and `ExportDeclaration` exist in Zod today, so the http schema restates them in JSON Schema until the migration. A type-level test asserts the generated types are assignable to the existing `StepOnField` and `ExportDeclaration`, so the two copies cannot quietly diverge.
- **The Zod bridge dispatches before validating.** `StepSchema` is a Zod discriminated union, which reads each member's `type` literal from its shape when the schema is built. An AJV-backed member has no shape, and Zod throws on it (tried). So `StepSchema` becomes a function over each step: an `http` step goes to AJV, whose errors are added as Zod issues, and anything else goes to the existing union unchanged. `FlowSchema` and `parseFlow` keep their shape, and an `http` step reports only AJV's errors.

  Rejected: `z.union([existingUnion, httpBridge])`. A union reports every branch's failure, so one typo in an `http` step would also produce the other branch's "expected httpjson | mcp | …" error.

- **Flow analysis learns the step.** It gets dependency edges like the other capability steps, its exports are parsed, and `validateExportRefPath` applies to it. Refs inside `body.artifact` and multipart parts are already found, because reference parsing walks every key. What those refs resolve to is later work.
- **`RunService` refuses a run of a flow containing an `http` or `mcp` step,** before any run is created, so the caller learns immediately. Neither step type has a working executor: `http` does not yet, and `mcp` lost its when `packages/tools` was deleted, which today leaves its runs hanging (`docs/todo.md`). The guard lifts for `http` once the engine dispatches it.

**Not in C1:** `http` in `CapMap`/`CapIdSchema` (it arrives with the command and terminal Messages), content types beyond three, and the rule for exports on a response whose type is unknown until run time.

### What actually landed

Matches the discussion, with these deltas and additions.

- **Generated types are type aliases.** `json-schema-to-typescript` declares every named object as an `interface`, with no option to change it, and an interface is not assignable to `Record<string, unknown>` the way a type alias is. The generator rewrites each `export interface Name {…}` into `export type Name = {…};` after formatting, and fails on any interface shape it does not recognise (such as `extends`) rather than guessing. The one place that had already tripped on an interface, `bindReference` in `json-ref-binder`, now takes `object`, which is all it ever used.
- **Draft 2020-12, with one shared AJV instance.** The schema uses `$defs` and validates with `Ajv2020`, from `packages/specs/src/ajv/ajv.ts`, so a later schema can `$ref` another by `$id`. 2020-12 was chosen for the command Messages: an envelope plus an extension, still strict, needs `$ref` beside other keywords and `unevaluatedProperties`, neither of which draft-07 has.
- **Readable errors are shared, not per schema.** `schemaIssues(validate)` turns any compiled validator's errors into one issue per real problem: named unknown and missing fields, listed allowed values, and a `oneOf` reduced to either the alternative the value names or one "must be one of" line. A new schema needs no formatting code of its own.
- **Where the files are.** The schema is `packages/specs/src/schemas/http.step.schema.json`. Generated files go in `packages/types/src/generated/`, named `*.gen.ts`, beside a hand-written `index.ts`. `HttpExportDeclaration` leaves out `evalContext`, which only eval flows use.
- **The generator is TypeScript, run directly by Node 24,** split into `scripts/type-generation.ts` (tested) and the `scripts/generate-types.ts` command. It refuses a schema with no `title`, since the title names the type. Its tests found that an object with no properties is emitted on one line, which the rewrite now handles.
- **Generation runs and caches through turbo.** A `gen` task in `packages/specs` writes into `packages/types`, and every `types` task depends on `@lcase/specs#gen`, so an edited schema is regenerated by the next build, typecheck, lint or test. The task is cached with inputs (the schemas, the scripts, the root `.prettierrc`) and outputs (`$TURBO_ROOT$/packages/types/src/generated/*.gen.ts`). Turbo restores a cached output into another package, which was verified by deleting the file and getting it back on a cache hit. `gen:check` runs in CI before anything regenerates. `pnpm gen` runs it from the root.
- **`stepExports(step)`** in `flow-analysis` is the one place that knows which step types declare exports (`httpjson`, `http`), used by export parsing and `validateExportRefPath`. The engine's own `httpjson`-only check in `value-refs.ts` is untouched until the engine dispatches `http`.
- **The guard** is `STEP_TYPES_WITHOUT_EXECUTOR` in `RunService`, and it names every refused step. Forking an existing run through `SimService` does not pass through `requestRun`; that can only reach an old `mcp` run, which `docs/todo.md` now records.
- **Around the edges.** The workbench gives `http` nodes an accent color (no side-panel details yet), and AJV now ships in the workbench bundle, since it calls `parseFlow`. `examples/transcribe.flow.json` shows all three body kinds; its `audio` param is `text/plain` until content types widen.
