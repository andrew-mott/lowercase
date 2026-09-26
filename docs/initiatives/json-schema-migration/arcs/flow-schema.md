# JSON Schema Migration — Arc A1: Flow schema (Changes C1–C7)

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

## Change C3 - Structural-step schemas and generated types - merged (PR #410)

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

## Change C4 - Shared capability-field schemas and generated types - merged (PR #411)

Establish the reusable, schema-owned fields that capability steps share, without changing which steps the runtime accepts.

### Discussion

**Intended boundary:**

- Author independently owned schemas and generated public types for the current capability common fields: `args` and `tool`, plus the `on` success/failure routing field.
- Keep generated output in `packages/types/src/generated/` with the existing `.gen.ts` naming and barrel. Replace duplicate hand-written declarations while retaining their useful public names and package-root imports.
- Design the schemas for real cross-schema composition by later capability roots. The composed step remains responsible for rejecting unknown fields; do not force a private `$defs` structure onto fields that `httpjson` and `mcp` both own.
- Keep the reusable field schemas open to sibling properties so later step roots can compose them with `allOf`. In draft 2020-12, the final composed root uses `unevaluatedProperties: false` to close the complete shape after its referenced fields have been evaluated; `additionalProperties: false` inside a reusable component would reject its siblings instead.
- Give the two schema roots stable filename `$id` values and the existing public type names, `StepCapCommonFields` and `StepOnField`. Their generated types replace only those declarations in `common-fields.ts`; the still-hand-written eval and export types remain there for C5.
- Verify the schemas directly with AJV and their generated public shapes. Leave the Zod parser, all accepted step types, and runtime job dispatch unchanged.
- Do not move `http`'s existing private definitions into these shared contracts merely for uniformity. Its vertical slice remains valid; alignment can be considered only where it makes a later composed flow schema clearer.

## Change C5 - HTTP JSON step schema and generated types - merged (PR #412)

Describe the full current `httpjson` flow contract in JSON Schema so it can participate in an eventual complete flow schema and AJV parser cutover, even while it remains a legacy capability.

### Discussion

**Intended boundary:**

- Author the `httpjson` step schema and generate its public TypeScript types, composing the reusable C4 capability fields through `$ref`.
- Compose those fields with `allOf` and close the final step shape with draft-2020-12 `unevaluatedProperties: false`; the C4 schemas remain open to their step-specific siblings.
- Preserve the current accepted shape exactly: URL, method, headers, shallow JSON body, exports, and the legacy export `evalContext` structures. The schema migration is a fidelity change, not an eval redesign.
- Keep `evalContext` owned by `httpjson`; do not add it to `http`. Its future replacement or removal belongs with the separate eval rework.
- Keep `httpjson`-specific reusable pieces, including export and eval-context variants, private to this schema through `$defs` unless implementation identifies a genuine second owner. Generate them under HTTP-JSON-specific names, then retain the useful existing `EvalContextSource` and `ExportDeclaration` package-root names as aliases. Delete the unconsumed `StepExportsField` helper rather than invent a schema solely to preserve it.
- Keep each generated schema file self-contained, including the generator's duplicate intermediate declarations for externally referenced schemas. The generated barrel explicitly exposes only HTTP JSON's intended public types, so those implementation details do not collide at the package root. Apply the same selective-barrel pattern to C7's composed flow output.
- Replace the duplicate hand-written `httpjson` step module with the generated `StepHttpJson` type, preserving its package-root import. Do not remove `httpjson` from the flow union, parser, worker/job protocol, or documentation in this Change.
- Verify the composed shape directly with AJV using the C4 schemas registered by `$id`, and verify generated type compatibility. Leave the Zod runtime parsing path in place until the complete composed flow schema is ready for its own cutover Change.

### What actually landed

No material contract or runtime-scope divergence. The implementation settled the generated-output boundary during the Change: instead of adding custom `$ref`-to-TypeScript-import generation, each schema's generated file remains self-contained and the generated barrel explicitly exposes only HTTP JSON's intended public types. That simpler decision is reflected in the Discussion. The existing Zod flow parser and legacy `httpjson` eval behavior are unchanged.

## Change C6 - MCP step schema and generated types - merged (PR #413)

Move the remaining capability-specific step into the schema pipeline so every
currently accepted step variant has an authored contract before flow-root
composition.

### Discussion

**Intended boundary:**

- Author `mcp.step.schema.json` with a stable filename `$id` and `StepMcp` title. Compose C4's `args`, `tool`, and `on` fields through `$ref`/`allOf`, then close the complete step with `unevaluatedProperties: false`.
- Preserve the current required `type`, `url`, `transport`, and `feature` fields, including their exact discriminator and enum values. The outer step is strict today. The nested Zod `feature` object currently accepts and strips unknown fields; keep its schema structurally open for compatibility, and treat that normalization difference as an AJV parser-cutover decision rather than silently tightening it here.
- Generate a self-contained `mcp.step.gen.ts`, then selectively expose only `StepMcp` from the generated barrel. This follows C5's generated-output boundary: the generator's duplicated declarations for shared referenced fields remain implementation details rather than package-root collisions. Remove the duplicate hand-written MCP step module and update the flow unions, capability map, and MCP job data to use the generated type while preserving the package-root `StepMcp` import. The Zod parser remains the runtime boundary.
- Align the existing `http` schema with C4's `StepOnField` at the same time, replacing only its private routing-field definition. Its root switches from `additionalProperties: false` to `unevaluatedProperties: false` so the referenced field and HTTP-owned fields are closed together. Do not compose C4's `args` and `tool`: `http` currently rejects them, so accepting them would expand its contract.
- Regenerate HTTP's self-contained output as part of that alignment. Switch its generated-barrel entry from `export *` to an explicit list of its intended public types; `HttpStepOn` has no production consumers and is superseded by `StepOnField`, while the useful HTTP step, body, multipart, and export names remain package-root exports.
- Register C4's `step-on-field` schema on the existing AJV instance before compiling `http`. This is required for its new `$ref`, but does not change which runtime parser validates MCP or alter HTTP's validation contract.
- Verify the MCP schema directly with AJV, including strict outer fields and permissive nested `feature` input, and verify the generated public type and HTTP compatibility. Do not redesign MCP transport, feature ownership, job dispatch, or capability behavior.

### What actually landed

No material contract or runtime-boundary divergence. Reusing C4's `on` schema
means AJV now reports an unknown HTTP root field through
`unevaluatedProperties` rather than `additionalProperties`; `schemaIssues`
treats both equivalently so the existing parser diagnostic remains stable.
`HttpStepOn` had no production consumers and is retired in favor of
`StepOnField`; the other useful HTTP public type names remain exposed.

## Change C7 - Composed flow schema and generated root types - merged (PR #414)

Compose the schema-owned flow pieces into the complete authored flow contract
and replace the remaining hand-written flow/step union types, without cutting
the runtime parser over yet.

### Discussion

**Intended boundary:**

- Author the draft-2020-12 `flow-definition.schema.json` with a stable filename `$id` and `FlowDefinition` title. Reference C2's foundation schemas and use a private `$defs` `oneOf` step union for `httpjson`, `mcp`, `http`, `branch`, `join`, and `parallel`; every variant carries its required `const` discriminator.
- Generate the public `FlowDefinition` and `StepDefinition` types from that composed contract. Replace the remaining hand-written root and union declarations, preserving the useful package-root names and imports.
- Make the generated `flow-definition.gen.ts` the sole committed TypeScript output for the flow schema graph. It is self-contained because the generator resolves `$ref`; selectively expose the existing useful foundation, step, and HTTP helper names from that one file. Retire the duplicate leaf `.gen.ts` files and preserve package-root imports; the hand-written root and union modules can be deleted because the package only supports package-root type imports, not deep implementation paths.
- Keep root structural ownership faithful to today's `FlowSchema`: required name, version, start, and steps; optional description, kind, params, and outputs; no unknown root fields. The root schema owns its final closure, while composed capability steps retain their own `unevaluatedProperties` closure.
- Exercise real schema composition in direct AJV tests by registering every referenced schema by `$id`. Cover one valid flow for each step variant plus root and step rejection cases, and verify the generated public types.
- Leave `FlowSchema` and `StepSchema` on the current Zod/AJV dispatch path. Replacing that parser boundary, aligning its diagnostics, and resolving any normalization differences are a later Change.

### What actually landed

No material contract or parser-boundary divergence. The generated-output
boundary was deliberately simplified before review: rather than retain one
generated file per schema, the composed flow root is now the sole committed
flow type output, while the small authored schemas and their direct AJV tests
remain. Its explicit barrel exports preserve the existing public flow names.
The generated root types also caused TypeScript declaration inference for the
still-exported Zod schemas to name a generated implementation path; explicit
`z.ZodType` annotations retain their intended public types without changing
runtime parsing. Internal type imports now reference the committed generated
root directly; package-root imports remain unchanged.
