# JSON Schema Migration — Arc A1: Flow schema (Changes C1–C5)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change index. This Arc establishes the flow contract in reviewable layers rather than attempting every flow shape in one Change. These Changes keep the current runtime parsing architecture in place; C1 only removes obsolete accepted fields.

## Change C1 - Retire stale `inputs` and `pipe` flow fields - merged (PR #408)

Reduce the contract before authoring it in JSON Schema: `params` remains the sole declared flow-input field, and the obsolete streaming-pipe shape goes away entirely.

### Discussion

**Settled scope:**

- Remove `inputs` from `FlowDefinition`; it is old, absent from runtime validation, and has no flow consumers. `params` remains the supported declaration. Remove the empty `inputs` field from the two engine `FlowDefinition` fixtures; do not touch unrelated run-Message or multipart-request fields named `inputs`.
- Remove `pipe` from accepted Zod capability-step input and its type scaffolding. Update the workbench parser fixtures that currently rely on `pipe: {}`, and remove the old streaming demo rather than preserve a now-invalid example.
- Remove the unconsumed `PipeData` event type/export and the entirely commented-out engine `pipe-resolver` stub/export; both are remnants of the same abandoned flow-pipe design.
- Remove the unconsumed generic stream ports, registry, in-memory adapter, and their tests rather than preserving or archiving the abandoned implementation. A future streaming design starts fresh from its actual needs.
- Do not author flow JSON Schema or alter parser architecture here.
- Preserve `httpjson` export `evalContext` exactly as it is. It is legacy eval-slice behavior, is not a model for `http`, and will be removed only with its eventual eval replacement.

### What actually landed

- `FlowDefinition.inputs` and the two empty engine-fixture fields are gone. The unrelated `inputs` fields on run Messages and multipart requests are untouched.
- Zod no longer accepts a capability step's `pipe` field. The workbench parser fixtures now exercise the same valid flows without it, and the obsolete desktop streaming demo is deleted.
- The old pipe-only types and stubs are deleted: the commented flow `PipeFields`, shared-event `PipeData`, and commented engine `pipe-resolver`, with their barrel exports removed.
- The unconsumed generic streaming implementation is deleted with the abandoned pipe design: both ports, the registry, in-memory adapter/core/views, and their tests. Nothing was archived; future streaming work starts from its real requirements.
- `httpjson` export `evalContext` is unchanged and `http` still does not gain it.
- Verification: `pnpm --filter @lcase/specs test --run` (26 tests), `@lcase/engine` (110), `@lcase/adapters` (38), and `@lcase/workbench` (227) all pass; full-repository `pnpm typecheck` and `pnpm lint` each pass all 31 tasks.

## Change C2 - Flow-foundation schemas and generated types - merged (PR #409)

Establish the schema-owned pieces of a flow that do not depend on the whole step union.

### Discussion

**Intended boundary:**

This Change proves the authored-schema-to-generated-type path with the three
flow-level contracts that have no dependency on the complete step union:
`FlowKind`, `FlowParamDefinition`, and `FlowOutputDefinition`.

**Settled shape:**

- Author one draft-2020-12 schema for each contract in
  `packages/specs/src/schemas/`: `flow-kind.schema.json`,
  `flow-param-definition.schema.json`, and
  `flow-output-definition.schema.json`. Each has a stable `$id` matching its
  schema filename and a `title` matching the generated TypeScript type name.
- Keep generated output visibly separate in `packages/types/src/generated/`,
  with the existing `.gen.ts` suffix. Add the three files to that directory's
  generated barrel; `@lcase/types` already exports that barrel, so the useful
  public type names and package-root import paths stay unchanged.
- Remove the three duplicate hand-written declarations from
  `flow-definition.ts`. Its still-hand-written `FlowDefinition` type imports
  the generated foundation types and continues to own the incomplete root
  shape until a later Change can compose the full step union.
- Match today's structural contract precisely: `FlowKind` is `business` or
  `eval`; a param has a non-empty string `type` and optional literal `true`
  `optional`; an output has a string `payload`; the two object contracts reject
  unknown fields. `ContentType` and the broader content-type taxonomy remain
  outside this Change.
- Do not introduce an artificial partial flow-root schema merely to exercise
  `$ref`. Later composed schemas use `$ref` for these independently owned
  contracts; private reusable pieces belong in their owner's `$defs`.
- Verify the schema contracts directly and assert the generated public types'
  intended shapes. Run generation and its freshness check. Leave the current
  Zod `FlowSchema`, parser behavior, AJV runtime wiring, and all step schemas
  unchanged.

### What actually landed

No material scope divergence. The optional param field is asserted as its own
generated type property because the type-test helper does not compare optional
object properties precisely; the direct schema test covers the complete strict
object contract.

## Change C3 - Structural-step schemas and generated types - in review

Move the bounded, non-capability step variants into the schema pipeline before the capability-specific contracts.

### Discussion

**Intended boundary:**

- Author one standalone schema and generated public type for each of `branch`, `join`, and `parallel`. Give each root a stable `$id` matching its filename and a title matching its existing public type name.
- Preserve the exact current Zod contracts: strict objects; required `type` `const` discriminators; required branch `value`, `cases`, and `default`; required join `steps` and `next`; and required parallel `steps`. Do not invent non-empty constraints for strings, arrays, or the branch case map.
- These roots do not need artificial `$ref`, `$defs`, or `oneOf` composition. The real schema step union waits until every accepted variant is schema-owned; this Change still establishes its explicit discriminators.
- Generate types in `packages/types/src/generated/` through the existing generated barrel. Delete the duplicate private hand-written structural-step modules and update `StepDefinition` to use the generated types, preserving their public names and `@lcase/types` imports.
- Point the existing structural Zod schemas at the generated public types, including replacing the join schema's direct `types/dist` import. Keep their validation behavior and the Zod flow parser unchanged.
- Verify each schema directly with AJV and assert the generated public types' intended shapes. Keep `httpjson`, `mcp`, and `http`, along with final flow-root/step-union composition, for later planning so this remains a reviewable structural-step Change.

### What actually landed

No material scope divergence. Each structural step has a standalone strict schema and committed generated type, while the existing Zod schemas continue to validate the parser boundary. The generated barrel now supplies the public structural-step names; the duplicate private modules are deleted, and the join schema uses the normal package-root import.

## Change C4 - Shared capability-field schemas and generated types - not started

Establish the reusable, schema-owned fields that capability steps share, without changing which steps the runtime accepts.

### Discussion

**Intended boundary:**

- Author independently owned schemas and generated public types for the current capability common fields: `args` and `tool`, plus the `on` success/failure routing field.
- Keep generated output in `packages/types/src/generated/` with the existing `.gen.ts` naming and barrel. Replace duplicate hand-written declarations while retaining their useful public names and package-root imports.
- Design the schemas for real cross-schema composition by later capability roots. The composed step remains responsible for rejecting unknown fields; do not force a private `$defs` structure onto fields that `httpjson` and `mcp` both own.
- Verify the schemas directly with AJV and their generated public shapes. Leave the Zod parser, all accepted step types, and runtime job dispatch unchanged.
- Do not move `http`'s existing private definitions into these shared contracts merely for uniformity. Its vertical slice remains valid; alignment can be considered only where it makes a later composed flow schema clearer.

## Change C5 - HTTP JSON step schema and generated types - not started

Describe the full current `httpjson` flow contract in JSON Schema so it can participate in an eventual complete flow schema and AJV parser cutover, even while it remains a legacy capability.

### Discussion

**Intended boundary:**

- Author the `httpjson` step schema and generate its public TypeScript types, composing the reusable C4 capability fields through `$ref`.
- Preserve the current accepted shape exactly: URL, method, headers, shallow JSON body, exports, and the legacy export `evalContext` structures. The schema migration is a fidelity change, not an eval redesign.
- Keep `evalContext` owned by `httpjson`; do not add it to `http`. Its future replacement or removal belongs with the separate eval rework.
- Keep `httpjson`-specific reusable pieces, including export and eval-context variants, private to this schema through `$defs` unless implementation identifies a genuine second owner. C5 may add the small supporting schemas or generated types genuinely required to make that contract complete; it is not limited artificially to one schema file.
- Replace duplicate hand-written `httpjson` type declarations with the generated public types where that preserves existing names and package-root imports. Do not remove `httpjson` from the flow union, parser, worker/job protocol, or documentation in this Change.
- Verify structural behavior directly with AJV and generated type compatibility. Leave the Zod runtime parsing path in place until the complete composed flow schema is ready for its own cutover Change.
