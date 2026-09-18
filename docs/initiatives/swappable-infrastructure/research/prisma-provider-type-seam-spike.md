# Prisma Provider Type Seam: Spike Result

Status: spike result, measured rather than reasoned

Date: 2026-09-08

Companion to [`prisma-sql-backend-strategy.md`](./prisma-sql-backend-strategy.md),
which established that two providers require two generated clients and that
those clients are not assignable at whole-client or model-level `Pick`. It left
one question open and named it as the thing to settle before committing to
Prisma: how narrow does the shared type seam have to become before both
generated clients satisfy it, and is the result usable.

This spike answers that. Everything below was compiled, not inferred. All spike
artifacts were removed afterward; nothing here is checked in.

## Result

**A method-level `Pick` is sufficient, and direction is the whole trick.** Type
the repository seam against the **SQLite** client and the PostgreSQL client
satisfies it unchanged. The reverse fails almost everywhere, which is why the
strategy document's whole-client probe read as a wall.

The narrowing ladder terminates at its first rung. No project-owned capability
types, no provider binding functions, no forwarding layer, and no cast.

## Method

Two clients were generated from the same ten-model schema, differing only in
`datasource.provider` and the generator `output` path. Generation needs no live
database. Against them:

1. **371 assignability probes**, one per (model, method, direction), covering
   all seventeen generated delegate methods across all ten models, plus nine
   client-level methods, plus whole-client and model-level `Pick` controls.
   Each probe was a single line; TypeScript's error line numbers were mapped
   back to probe names.
2. **The real repository code.** All seven `...Db` aliases in
   `packages/adapters/src` were narrowed in place from model-level to
   method-level `Pick`, the package was typechecked against SQLite, and then a
   probe constructed each repository with the PostgreSQL client.

## The matrix

| Direction                            | Delegate methods passing    |
| ------------------------------------ | --------------------------- |
| PostgreSQL delegate into SQLite seam | **15 of 17, all 10 models** |
| SQLite delegate into PostgreSQL seam | 2 of 17                     |

Passing in the usable direction: `findUnique`, `findUniqueOrThrow`,
`findFirst`, `findFirstOrThrow`, `findMany`, `create`, `createMany`,
`createManyAndReturn`, `update`, `updateMany`, `updateManyAndReturn`, `upsert`,
`delete`, `deleteMany`, `count`.

Failing: `aggregate` and `groupBy`.

Client-level methods passing both directions: `$queryRaw`, `$queryRawUnsafe`,
`$executeRaw`, `$executeRawUnsafe`, `$connect`, `$disconnect`. Failing: `$on`,
`$extends` (one direction), `$transaction` (both).

Controls behaved as the strategy document predicted: whole client fails both
directions, and `Pick<SqliteClient, "flow">` rejects the PostgreSQL client.

## Why the asymmetry

PostgreSQL's generated input types are a strict **superset** of SQLite's.
`StringFilter` on PostgreSQL carries `mode?: QueryMode` and
`ListStringFieldRefInput` variants that SQLite's does not have at all;
`QueryMode` does not exist in the SQLite client. Method parameters are
contravariant, so a PostgreSQL delegate accepts everything a SQLite-typed seam
can pass it, and not the other way around.

This is a real subset relationship, confirmed by reading both generated
`commonInputTypes.ts` files. It is not a TypeScript recursion-depth artifact,
which was the competing hypothesis given how deep the whole-client error chain
recurses through the relation graph.

`aggregate` and `groupBy` are the two that do not fit this explanation, since
they fail in both directions rather than only one. The root cause was not
chased; what matters for planning is that they are unavailable in a shared
seam regardless of which client it is typed from.

## Against the real repository code

- **Narrowing the seven aliases is non-breaking.** `packages/adapters`
  typechecks clean with method-level seams, tests included. No repository body
  required an edit.
- **Four of seven repositories accept the PostgreSQL client unmodified**:
  flow, sim, eval-result, run-query.
- **The three failures are exactly and only `$transaction`**: artifact, run,
  run-step-projection. Nothing else in any of them fails.
- **Removing `$transaction` from those three seams makes all three pass**,
  verified directly rather than assumed.

### Why `$transaction` is the single holdout

Its callback overload hands the caller a full client
(`fn: (prisma: Omit<PrismaClient, ...>) => Promise<R>`), which reintroduces the
entire whole-client incompatibility through double contravariance. The
isolation-level difference appears in the error too — SQLite's
`TransactionIsolationLevel` offers only `"Serializable"` where PostgreSQL has
the full set — but the client-in-callback is the structural cause.

A Prisma nested write never surfaces a client, so it sidesteps this entirely.
`PrismaArtifactRepository.writeArtifact` already does exactly that, deliberately
and with a comment explaining why nested writes are Prisma's documented default
for atomically writing a parent plus related rows. Three `$transaction` call
sites remain, all structurally identical to that case: `run` with `runParam`,
`run-step-projection` with `runStepExport`, and a second method in the artifact
repository itself with `artifactParamCuration`. Converting them is
both the fix for the type seam and work worth doing on its own terms, and it
does not give up atomicity: Prisma wraps a nested write in its own implicit
transaction.

### Non-finding worth recording

**Enums and `DateTime` do not diverge.** Every model scored identically, 15 of
17, including all three enum-carrying models (`Artifact.format`, `Run.status`,
`Flow.kind`). SQLite emulates enums as `TEXT` while PostgreSQL generates native
`CREATE TYPE`, so this was the axis most likely to break, and it does not. The
same holds for `DateTime` despite `DATETIME` versus `TIMESTAMP(3)`.

## What the seam constrains you to

The shared repository code is limited to the SQLite-compatible subset of the
Prisma API, enforced by the compiler. Concretely unavailable in shared code:

- `aggregate` and `groupBy`
- `mode: "insensitive"` case-insensitive filtering
- `$transaction`'s callback form
- field-reference list inputs

Everything else in the CRUD and query surface is available. The constraint binds
only where code is shared; a deliberately provider-specific path could take one
client directly and use its full API, at the cost of no longer being shared.

`$queryRaw` passes in both directions and is an escape hatch for an aggregate
query whose SQL happens to be valid on both dialects. It is unlovely, but it
keeps the seam intact and puts the query shape at the call site.

## Verdict, and the tripwire

Prisma stays. Not because it won on merit across the board, but because the cost
of the remaining work is two mechanical changes — widening seven type aliases,
and converting two `$transaction` blocks to a nested-write pattern the codebase
already uses — against a full SQL-layer rewrite for any alternative.

**The tripwire is `groupBy`.** Nothing uses it or `aggregate` today, but they are
ordinary SQL, not exotic features, and closing them off in shared code is a real
long-term constraint rather than a curiosity. The moment eval or observability
work wants aggregate statistics over runs, or the workbench wants
case-insensitive search, this decision reopens on its own merits rather than as
a reaction to a compile error.

## Recorded position on the long term

The stated preference is to move off Prisma eventually rather than to stay
indefinitely, with `groupBy`'s absence as the specific reason. Two things make
that a deferrable decision rather than an urgent one.

**The ports boundary makes it reversible.** Every Prisma repository already
implements a port in `packages/ports` — `RunRepositoryPort`,
`FlowRepositoryPort`, and siblings — so replacing the implementation later never
reaches `app-services` or any component. A migration can proceed one repository
at a time behind unchanged ports.

**The natural moment is the schema refactor, not now.** The current schema is
already expected to need rework; doing a query-layer migration at the same time
means paying the rewrite once rather than twice.

Two costs of such a move should be recorded now while they are clear, so they
are not rediscovered as surprises:

- **The compile-time guarantee is lost.** Prisma's seam refuses to compile a
  query SQLite cannot run. A single provider-agnostic query-builder type
  (Kysely's `Kysely<DB>`, MikroORM's `EntityManager`) will accept a
  PostgreSQL-only expression and fail when it executes, possibly only on the
  SQLite deployment. Moving the lowest-common-denominator ceiling from compile
  time to runtime is a genuine regression for a two-backend setup where the
  lightweight backend is the one most installs use. This is the strongest single
  argument for the current arrangement.
- **Hand-written migrations are not acceptable.** Schema-driven migration
  generation is a load-bearing Prisma feature here. Any replacement has to
  provide a real equivalent, and evaluating that tooling — including the
  possibility of contributing to it — is a prerequisite for the move rather
  than a detail to sort out afterward.

`prisma-kysely` is the bridge if that path is taken: keep `schema.prisma` and
`prisma migrate` as the schema and migration source of truth, generate the
`DB` interface from it, and move queries over incrementally. That keeps the
migration story intact and reduces the decision to the query layer alone.

## What this spike does not prove

Types compiling is not queries behaving. Nothing here exercises a real
PostgreSQL database. Shared repository behavior contracts run against both real
backends remain a requirement of Change C15, unchanged by this result —
especially around transaction semantics, constraint and cascade behavior,
collation and case sensitivity, timestamp precision, ordering of unordered
queries, and error mapping.
