# Events + Specs: JSON Schema Migration

## Summary

Make JSON Schema the durable authored contract for flow definitions and, later, event and Message shapes: TypeScript types are generated and committed from those schemas, AJV validates the runtime boundary, and the same flow schema can eventually drive Monaco validation and autocomplete. Flow definitions and event/Message schemas stay in this one longer Initiative because they share the contract pipeline and migration decisions, while their work remains divided into small, coherent Changes.

## Design principles

- **JSON Schema is the authored source of truth.** Generated public TypeScript types are committed outputs, not a second hand-maintained contract; AJV validates the same schema at runtime.
- **Compose schemas deliberately.** Use draft 2020-12 and stable `$id` values. Independently owned contracts compose through `$ref`; private reusable pieces stay in the owning schema's `$defs`.
- **Make unions explicit.** Model variants with `oneOf` and a required `const` discriminator, so generated types, AJV, and editor tooling share one unambiguous branch selection rule.
- **Keep structural and semantic validation separate.** JSON Schema establishes shape and local constraints. Flow analysis remains responsible for cross-step references, reachability, and other semantic rules.
- **Migrate runtime boundaries incrementally.** A schema may coexist with the current Zod-facing parser while callers still need it; a Change does not rewrite the parser merely because it introduces a schema.
- **Author once for runtime and tooling.** The flow schema must be usable by AJV now and by Monaco validation/autocomplete later, without a tooling-specific parallel contract.
- **Keep an intentional, revisable runway.** Pre-number and discuss enough small Changes, grouped by Arc, to make the likely next path clear. Reorder, renumber, split, combine, or skip planned work when understanding changes; do not turn the index into a speculative whole-migration inventory.

## Change index

| Change | Description                                         | Status           | Where |
| ------ | --------------------------------------------------- | ---------------- | ----- |
| C1     | Retire stale `inputs` and `pipe` flow fields        | merged (PR #408) | [A1]  |
| C2     | Flow-foundation schemas and generated types         | merged (PR #409) | [A1]  |
| C3     | Structural-step schemas and generated types         | merged (PR #410) | [A1]  |
| C4     | Shared capability-field schemas and generated types | merged (PR #411) | [A1]  |
| C5     | HTTP JSON step schema and generated types           | in review        | [A1]  |
| C6     | MCP step schema and generated types                 | not started      | [A1]  |
| C7     | Composed flow schema and generated root types       | not started      | [A1]  |

## Next up

- C5 — HTTP JSON step schema and generated types.

## Not yet scoped

- **AJV flow-parser cutover.** Replace the remaining Zod-facing flow parsing path only after the schema and generated public types are complete and its compatibility boundary is understood.
- **Monaco integration.** Use the authored flow schema for editor diagnostics, validation, and autocomplete.
- **Message taxonomy.** Settle the enduring Message/event vocabulary and ownership boundaries before encoding it into a shared schema composition.
- **Event and Message schema migration.** Move the existing event/data contracts and their registry wiring to JSON Schema and AJV in coherent slices.
- **Diagnostics.** Establish useful, consistent schema-validation errors for runtime callers and authoring tools.
- **Legacy `httpjson` eval context.** Preserve `httpjson`'s current `evalContext` support during this flow work. Do not add it to `http`; remove it from `httpjson` only when its eval-design replacement is ready.
- **Final cleanup.** Retire superseded Zod definitions, bridges, and hand-written types only after their JSON Schema replacements are fully adopted.

[A1]: ./arcs/flow-schema.md
