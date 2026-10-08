# Event Contracts

## Summary

Move the existing event/data contract layer from paired Zod schemas and
hand-maintained TypeScript maps to authored JSON Schema, committed generated
types, and AJV validation. This Initiative concerns durable contract ownership
and validation; it does not itself refactor component architecture or decide
the future message taxonomy.

Scaffolded now, work not started.

## Not yet scoped

- **Contract boundaries.** Let the engine, worker, and other component work
  settle which event and Message families are stable enough to encode.
- **Schema and type structure.** Decide how generated envelope types preserve
  useful public names and helpers while retiring duplicate hand-maintained
  maps.
- **Runtime adoption.** Replace Zod validation and registry wiring with AJV in
  coherent event-family slices, without forcing unrelated component refactors.
- **Shared contracts.** Compose event documents with independently owned
  contracts such as the completed flow-definition schema, rather than copying
  those shapes.
