# Runtime & Storage Consolidation

## Summary

Unify `packages/runtime`'s two incomplete wiring paths (`createServices()` and `createRuntime()`/`WorkflowRuntime`, per `CLAUDE.md`) into one config-driven system, trim `packages/types`/`packages/ports`, and simplify the Prisma schema/services/API layer, which still carries some leftover mess from its transition off filesystem-index storage.

Scaffolded now, not yet scoped in detail — may split further once actually underway.
