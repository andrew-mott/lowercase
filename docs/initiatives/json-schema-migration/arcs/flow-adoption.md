# JSON Schema Migration — Arc A2: Flow adoption (Changes C8–C9)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change index. This Arc adopts
the completed flow contract at runtime and later in authoring tools. It does
not reopen the authored flow shape without a concrete contract reason.

## Change C8 - AJV flow-parser cutover - not started

Replace the remaining Zod-owned flow parsing boundary with AJV validation of
the composed flow schema, while retaining compatible caller-facing results.

### Discussion

**Intended boundary:**

- Register the composed flow schema and its referenced schemas by stable `$id`, then compile the runtime AJV validator from the flow root.
- Replace `FlowSchema` and `StepSchema` parsing in `parseFlow` and their direct application-service callers. Preserve the `parseFlow` result boundary; callers should receive a validated `FlowDefinition` or useful validation failure without depending on a Zod schema object.
- Keep Zod only for event-envelope schemas that contain a flow definition, using a small AJV-backed bridge there if it remains necessary. This is not event-schema migration and must not reintroduce a second authored flow contract.
- Preserve useful structural diagnostics while adapting them for the root `oneOf` union and external `$ref` branches. Broader authoring-oriented diagnostic design belongs to C9.
- Do not fold flow analysis into AJV. Cross-step references, reachability, and executability remain semantic checks after structural validation.

**Decision before implementation:**

MCP's nested `feature` object is structurally open because the existing Zod
parser accepts then strips unknown fields, while its generated TypeScript type
currently names only `primitive` and `name`. AJV normally preserves accepted
input. Before C8 is planned, choose whether unknown feature fields are rejected
by closing the schema, accepted and represented by a widened public type, or
accepted then explicitly normalized away.

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
