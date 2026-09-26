# JSON Schema Migration — Arc A2: Flow adoption (Changes C8–C9)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change index. This Arc adopts
the completed flow contract at runtime and later in authoring tools. It does
not reopen the authored flow shape without a concrete contract reason.

## Change C8 - AJV flow-parser cutover - in review

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

## Change C9 - Flow diagnostics and editor readiness - not started

Make the authored flow schema practical for authoring tools after the runtime
AJV boundary is established.

### Discussion

**Likely direction:**

- Refine schema-validation diagnostics for flow authors without changing the structural contract accidentally.
- Establish the schema-registration and URI boundary Monaco needs for validation and autocomplete, then integrate it when the workbench-facing scope is clear.
- Keep semantic flow analysis distinct from JSON Schema diagnostics; editor presentation of analysis results can follow its own integration design.

The implementation boundary remains deliberately open until C8 reveals the
runtime diagnostic contract and the frontend integration surface is inspected.
