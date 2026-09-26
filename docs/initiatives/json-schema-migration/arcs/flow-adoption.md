# JSON Schema Migration — Arc A2: Flow adoption (Changes C8–C10)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change index. This Arc adopts
the completed flow contract at runtime and later in authoring tools. It does
not reopen the authored flow shape without a concrete contract reason.

## Change C8 - AJV flow-parser cutover - merged (PR #415)

Replace the remaining Zod-owned flow parsing boundary with AJV validation of
the composed flow schema, while retaining compatible caller-facing results.

### Discussion

**Intended boundary:**

- Register the composed flow schema and its referenced schemas by stable `$id`, then compile the runtime AJV validator from the flow root.
- Replace `FlowSchema` and `StepSchema` parsing in `parseFlow` and their direct application-service callers. Preserve the `parseFlow` result boundary; callers should receive a validated `FlowDefinition` or useful validation failure without depending on a Zod schema object.
- Keep Zod only for event-envelope schemas that contain a flow definition, using a small AJV-backed bridge there if it remains necessary. This is not event-schema migration and must not reintroduce a second authored flow contract.
- Remove Zod entirely from `@lcase/specs`: move the shallow JSON-value helper to the event package, where it becomes event-only once the retired `httpjson` Zod flow schema is removed, and move the eval-score payload validator to its sole consumer in observability. Shared TypeScript types remain in `@lcase/types`.
- Retain the existing parser error-string boundary and enough readable structural detail for current callers while adapting it for the root `oneOf` union and external `$ref` branches. This does not establish a user-facing diagnostics contract; broader authoring-oriented diagnostic design belongs to C9 or later work.
- Do not fold flow analysis into AJV. Cross-step references, reachability, and executability remain semantic checks after structural validation.

**Settled decision:**

MCP's nested `feature` object will be closed: only its declared `primitive` and
`name` fields are accepted. The prior Zod parser silently stripped unknown
fields, while AJV would otherwise preserve them even though the generated
TypeScript type does not represent them. MCP is not a supported extension
surface yet, so rejecting those fields makes the schema, runtime value, and
public type agree.

### What actually landed

- The composed flow schema graph now backs one shared AJV validator. `parseFlow`,
  its application-service callers, and a remaining direct CLI caller all use its
  result while retaining the established success/error-string boundary.
- The existing readable-error adapter was extended for externally referenced,
  composed `oneOf` branches. It selects the declared step kind before retaining
  errors, rather than exposing failures from every step variant. This remains a
  compatibility adapter, not the deferred authoring-diagnostics design.
- Event envelopes retain their Zod contract but delegate embedded flow-definition
  validation to that AJV validator. `@lcase/specs` is now Zod-free: its
  event-only shallow JSON helper moved to events, and the temporary eval-score
  payload validator moved to observability, its sole consumer.
- The audit found one direct CLI use of the retired Zod flow schema; it was
  included in this cutover so no alternate flow-validation path remains.

## Change C9 - Flow schema registry and editor readiness - in review

Expose the authored flow schema graph for browser tooling, without creating a
second flow contract or broadening the runtime validation boundary.

### Discussion

**Intended boundary:**

- Export one explicit, browser-safe collection of the complete authored flow
  schema documents from `@lcase/specs`. It must contain the original schema
  objects, not a flattened or Monaco-specific derivative, and must retain the
  current `$id`s exactly.
- Prove the collection has unique IDs and that the composed root resolves its
  `$ref` graph. Keep AJV as the runtime consumer during this Change.
- Establish the registration arrangement Monaco will later use: each document
  registers under its `$id`; a flow editor model is separately associated with
  the composed root schema.
- Do not introduce a new general diagnostics model or change `parseFlow`'s
  result boundary. Monaco's JSON language service can present JSON syntax and
  structural schema markers directly once it receives this graph.
- Keep semantic flow analysis distinct from JSON Schema diagnostics. Existing
  semantic problems remain in the workbench Problems panel for now.

**Deferred decision:**

The exact owned HTTPS schema namespace is intentionally open while the domain
choice is considered. Do not introduce a placeholder URL in C9; reconsider an
explicit `$id` migration before publishing schemas for third-party use.

### What actually landed

- `@lcase/specs` now exposes the complete authored flow-schema document set
  and its composed-root ID. The runtime AJV validator consumes this same set,
  so browser tooling and runtime validation cannot drift into separate schema
  import lists.
- The public collection is checked for unique IDs and for resolution of the
  composed root through its complete `$ref` graph. No Monaco configuration or
  new diagnostics boundary was added.
- The existing filename `$id`s remain unchanged while the owned HTTPS namespace
  decision is deferred; C9 does not introduce a provisional URL.

## Change C10 - Monaco flow authoring - not started

Use the authored flow schema graph in the editable flow-authoring editor for
structural validation and assistance.

### Discussion

**Likely direction:**

- Configure Monaco's global JSON-schema settings through one small workbench
  helper, so later JSON consumers extend a shared registration point instead
  of replacing one another's settings.
- Give the editable flow-authoring model an explicit virtual URI and associate
  only that model with the composed flow-root schema. Keep read-only flow JSON
  and unrelated JSON editors unaffected.
- Add a flow-specific editor wrapper rather than making the shared
  `CodeEditor` know about the flow contract. Extend the shared component only
  as needed to accept a model URI and compose a narrowly scoped pre-mount
  configuration callback.
- Deliver Monaco-provided inline structural markers, hover text, and
  completion. Verify root fields, discriminated step variants, shared fields
  such as `on`, and an error from a referenced schema.
- Replace the raw serialized schema-issue array in the authoring Problems tab
  with a concise pointer to the inline editor errors. Do not add semantic
  analysis markers or redesign diagnostics in this Change.

**Deferred direction:**

After the initial integration is observable, enrich the authored schemas with
descriptions, examples, defaults, enum help, or snippets only where Monaco
demonstrably makes them useful. This remains schema-authoring work, not an
editor-only parallel metadata layer.
