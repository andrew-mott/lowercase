# Flow Definition Schema Migration

**Status: Complete — Changes C1–C10 merged (PRs #408–#417).**

## Summary

Flow definitions are authored as JSON Schema, with committed generated TypeScript types and AJV validation at the runtime boundary. The same composed schema graph now powers Monaco's structural validation, hover text, and completion in the flow authoring editor.

## Design principles

- **JSON Schema is the authored source of truth.** Generated public TypeScript types are committed outputs, not a second hand-maintained contract; AJV validates the same schema at runtime.
- **Compose schemas deliberately.** Use draft 2020-12 and stable `$id` values. Independently owned contracts compose through `$ref`; private reusable pieces stay in the owning schema's `$defs`.
- **Make unions explicit.** Model variants with `oneOf` and a required `const` discriminator, so generated types, AJV, and editor tooling share one unambiguous branch selection rule.
- **Keep structural and semantic validation separate.** JSON Schema establishes shape and local constraints. Flow analysis remains responsible for cross-step references, reachability, and other semantic rules.
- **Migrate runtime boundaries deliberately.** A schema may coexist with a current parser while callers still need it; cut over once the contract and compatibility boundary are complete.
- **Author once for runtime and tooling.** The flow schema must be usable by AJV now and by Monaco validation/autocomplete later, without a tooling-specific parallel contract.

## Change index

| Change | Description                                         | Status           | Where |
| ------ | --------------------------------------------------- | ---------------- | ----- |
| C1     | Retire stale `inputs` and `pipe` flow fields        | merged (PR #408) | [A1]  |
| C2     | Flow-foundation schemas and generated types         | merged (PR #409) | [A1]  |
| C3     | Structural-step schemas and generated types         | merged (PR #410) | [A1]  |
| C4     | Shared capability-field schemas and generated types | merged (PR #411) | [A1]  |
| C5     | HTTP JSON step schema and generated types           | merged (PR #412) | [A1]  |
| C6     | MCP step schema and generated types                 | merged (PR #413) | [A1]  |
| C7     | Composed flow schema and generated root types       | merged (PR #414) | [A1]  |
| C8     | AJV flow-parser cutover                             | merged (PR #415) | [A2]  |
| C9     | Flow schema registry and editor readiness           | merged (PR #416) | [A2]  |
| C10    | Monaco flow authoring                               | merged (PR #417) | [A2]  |

## Not yet scoped

No further I7 work is planned. Flow-schema authoring annotations remain a
possible future enhancement, but are deliberately deferred until an observed
editor need justifies them. Event and Message contracts now have their own
future Initiative, [`event-contracts`](../event-contracts/INITIATIVE.md).

[A1]: ./arcs/flow-schema.md
[A2]: ./arcs/flow-adoption.md
