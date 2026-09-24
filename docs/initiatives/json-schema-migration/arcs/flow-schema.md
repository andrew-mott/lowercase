# JSON Schema Migration — Arc A1: Flow schema (Changes C1–C3)

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

## Change C2 - Flow-foundation schemas and generated types - in review

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

## Change C3 - Structural-step schemas and generated types - not started

Move the bounded, non-capability step variants into the schema pipeline before the capability-specific contracts.

### Discussion

**Intended boundary:**

- Author schemas and generated public types for the `branch`, `join`, and `parallel` step shapes.
- Use the shared composition conventions proved by C2, including explicit discriminators where a union is introduced.
- Keep `httpjson`, `mcp`, and `http`, along with final flow-root/step-union composition, for later planning so this remains a reviewable structural-step Change.
