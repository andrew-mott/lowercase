# ADR-0001: Adopt Architecture Decision Records

Date: 2026-07-21
Status: Accepted

## Context

This project has been through many real design decisions — made through research, discussion, and rejected alternatives — that aren't captured anywhere durable once the moment passes. `docs/todo.md` and per-feature initiative docs (e.g. `docs/initiatives/ui-workspace/INITIATIVE.md`) already capture a lot of reasoning, but they're living documents: continuously rewritten as plans evolve, not point-in-time records of one specific decision. There's no artifact that answers "why is this built this way" for a settled, cross-cutting decision without digging through docs that have since moved on, or conversation history that isn't part of the repo at all.

## Decision

Adopt lightweight Architecture Decision Records (Nygard-style) for decisions that are significant, hard to reverse, cross-cutting, or reached only after genuine deliberation between real alternatives — the same bar already used informally for deciding what's worth writing into `docs/todo.md`.

- **Location**: `docs/adr/`.
- **Filename**: `NNNN-title-slug.md` — a 4-digit, zero-padded, sequential number followed by a kebab-case slug. Numbers are never reused, including for superseded decisions.
- **Index**: `docs/adr/README.md`, a hand-maintained list of every ADR by number, title, and status.
- **Template**, one file per decision:
  ```markdown
  # ADR-000N: <title>

  Date: YYYY-MM-DD
  Status: Proposed | Accepted | Superseded by ADR-000X | Deprecated

  ## Context

  ## Decision

  ## Consequences
  ```
- **Immutability**: once `Accepted`, an ADR's Context/Decision/Consequences don't get edited to reflect a later change of mind. A changed decision gets a _new_ ADR with the next number, and the old one's `Status` is updated to `Superseded by ADR-000X`. The only field ever updated in place on an existing ADR is `Status` itself (e.g. `Proposed` → `Accepted` once actually implemented).

## Consequences

- Small ongoing overhead: writing a short structured doc for each decision that clears the bar above.
- Preserves reasoning that would otherwise only live in conversation history or a contributor's memory — directly useful the next time a "why is this like this" question comes up.
- Does not replace `docs/todo.md` or initiative docs, which remain the right place for in-progress, evolving, or not-yet-decided design threads. An ADR only gets written once a decision is actually settled enough to be worth freezing.
- Retroactive ADRs for already-settled historical decisions are fine and expected, given this practice starts now rather than at the project's beginning — should say so explicitly in the doc when that's the case, rather than implying it was written at the time.
