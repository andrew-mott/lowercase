# Events + Specs: JSON Schema Migration

## Summary

Move `packages/events`' hand-rolled Zod event/data schemas, and `packages/specs`' flow-definition schema, from Zod to JSON Schema (validated with `ajv`) — already flagged as an open direction in `CLAUDE.md` (events) and `docs/todo.md` (the HTTP-request-validation-strategy item, which wants this decided once rather than per-surface).

Two real payoffs beyond the refactor itself: language-agnostic flow-definition specs, and JSON-Schema-driven Monaco autocomplete/validation for flow authoring (deferred from Change C38, see `arcs/flow-authoring.md` in the `ui-workspace` initiative).

Scaffolded now, not yet scoped in detail.
