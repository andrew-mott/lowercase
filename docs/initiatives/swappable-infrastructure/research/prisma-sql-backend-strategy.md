# Prisma SQL Backend Strategy: SQLite and PostgreSQL

Status: research and design recommendation, not an implementation plan

Date: 2026-09-08

This document applies to the repository's current Prisma ORM 7.8.0 setup. It
supports the upcoming work in the [SQL Adapter arc](../arcs/sql-adapter.md), the
[runtime-composition research](./runtime-composition-strategies.md), and
[ADR-0008](../../../adr/0008-runtime-profiles-and-shared-assembly.md).

It also corrects one preliminary assumption in the SQL arc: a Prisma driver
adapter selects how a generated client talks to its database, but it does not
change the database provider for which that client was generated. Supporting
SQLite and PostgreSQL at the same time is therefore not a one-client driver
swap.

## Executive recommendation

If SQLite and PostgreSQL are both intended to remain selectable deployment
backends, use:

- one provider-neutral set of domain ports;
- one authoritative set of common Prisma model declarations;
- two provider-specific Prisma schema targets;
- two generated Prisma clients with different output directories;
- two corresponding Prisma driver adapters;
- two migration histories; and
- one runtime branch that constructs only the selected client and injects the
  same resulting repository ports throughout the process.

Prisma 7 does not natively let one schema target two providers, nor does its
multi-file schema feature provide cross-provider model sharing. If one
authoritatively edited model source is important, a small repository-owned
derivation step should copy or render that source into the two complete schema
targets before Prisma commands run. That derivation is project tooling, not a
Prisma feature.

The existing repository implementations appear behaviorally portable: they use
ordinary Prisma queries, the current model set generates for PostgreSQL without
model changes, and production repository code contains no raw SQL. They are not,
however, TypeScript-compatible with a second generated client as currently
typed. Their generated-client dependency boundary must change before the
implementations can actually be reused. The cheapest narrower boundary has not
yet been proven and should be found with a focused compile spike.

The immediate design choice is:

| Intended outcome                             | Client and migration shape                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL permanently replaces SQLite       | Change the provider, generate one PostgreSQL client, create one fresh PostgreSQL history, and retire the SQLite path.                                                                                        |
| SQLite and PostgreSQL remain profile choices | Keep two schema targets, generated clients, Prisma driver adapters, and migration histories. Share domain repository implementations wherever the proven type seam permits. Runtime selects one per process. |

The initiative's stated config-selection goal and C16's planned `postgres`
branch imply the second row. The C15 prose that currently says PostgreSQL
replaces SQLite and that only one migration history will remain should be
reconciled before C15 is planned.

## Direct answers to the open questions

### Can Prisma 7 target two providers from one set of models?

Not as a native Prisma configuration.

A Prisma schema has one datasource, and its `provider` is a literal connector
choice such as `sqlite` or `postgresql`. A Prisma multi-file schema combines all
`.prisma` files below one configured directory into that one logical schema; it
does not provide imports, provider overlays, or two alternative datasource
blocks. Prisma's documented multiple-client workflow instead uses independent
schema roots, generator outputs, configurations, and commands.

Consequently:

- **Two complete schema roots are officially supported.** They may contain the
  same model declarations, but Prisma does not keep those declarations in sync.
- **A multi-file schema folder does not solve cross-provider reuse.** It is useful
  for splitting one provider's models by domain.
- **A derived second schema is a valid project technique, not an official Prisma
  feature.** Prisma sees the resulting files as two normal schema targets.
- **Symlinking common schema files into both roots is not a documented Prisma
  contract** and should not be the architectural foundation.

For this repository, a deterministic derivation step is reasonable because the
common model set is small and currently portable. It makes one-source parity a
property of the build rather than a convention people and AIs must remember.

Official references:

- [Prisma 7 datasource reference](https://docs.prisma.io/docs/orm/v7/prisma-schema/overview/data-sources)
- [Prisma 7 multi-file schema location](https://docs.prisma.io/docs/orm/v7/prisma-schema/overview/location#multi-file-prisma-schema)
- [Prisma's multiple-database/client guide](https://www.prisma.io/docs/guides/database/multiple-databases)

### Are the two generated clients structurally assignable in TypeScript?

No, not for this repository on Prisma 7.8.0.

A local compile probe generated a PostgreSQL client from the current ten-model
schema after changing only `datasource.provider` and the generator output. Client
generation succeeded, but strict TypeScript checks found:

- the complete SQLite and PostgreSQL `PrismaClient` types are not assignable in
  either direction;
- even a simple `Pick<SqlitePrismaClient, "flow" | "flowVersion">` rejects the
  PostgreSQL client;
- the generated model delegates carry their entire generic API, including an
  unused `groupBy` signature whose generated namespaces are incompatible;
- `$transaction` adds a real provider difference, including different isolation
  level and callback-client types; and
- all seven current Prisma repository/query adapter constructors reject the
  PostgreSQL client.

This is why one generated client's `PrismaClient` type must not be treated as a
portable SQL interface. A union of the two generated clients is also not useful:
calls against a union must satisfy both incompatible generic method signatures.

This does **not** imply seven independent repository rewrites. Much of the
failure is caused by dependencies that are wider than the implementations need:
`Pick<PrismaClient, "flow">` imports the complete generated `flow` delegate even
when the repository calls only a few operations.

The next step is a narrowing ladder, not a predetermined wrapper layer:

1. First compile-probe method-level delegate shapes such as
   `Pick<SqlitePrismaClient["flow"], "create" | "findUnique" | "findMany">`
   against the PostgreSQL delegate. Removing unused `groupBy` may be sufficient
   for non-transactional repositories, but this has not yet been tested.
2. If generated method signatures still conflict, define project-owned,
   repository-local capabilities containing only the operations and result
   shapes an implementation actually uses.
3. Bind each generated client to those capabilities in provider-specific
   assembly with small typed forwarding functions. Those bindings must remain
   mechanical: query selection, relations, ordering, mapping, and failure policy
   stay single-sourced in the repository implementation.
4. Treat `$transaction` separately. If it needs an explicit narrow runner, that
   runner must bind capabilities from Prisma's transaction-scoped `tx` on every
   invocation, conceptually `client.$transaction(tx => work(bindTx(tx)))`. It
   must not let work escape through root-client bindings.
5. Add compile-time construction checks for both provider bindings.

Conceptually:

```typescript
type FlowRepositoryDb = {
  findUnique(input: CommonFlowFindUniqueInput): Promise<CommonFlowRow | null>;
  create(input: CommonFlowCreateInput): Promise<CommonFlowRow>;
  // Only operations PrismaFlowRepository actually uses.
};

function bindSqliteFlowDb(client: SqlitePrismaClient): FlowRepositoryDb {
  return {
    findUnique: (input) => client.flow.findUnique(input),
    create: (input) => client.flow.create(input),
  };
}

function bindPostgresFlowDb(client: PostgresPrismaClient): FlowRepositoryDb {
  return {
    findUnique: (input) => client.flow.findUnique(input),
    create: (input) => client.flow.create(input),
  };
}
```

The exact input and row types above are intentionally omitted: their smallest
safe common shape is what the compile spike needs to discover. The example is
not a frozen interface. If transaction typing makes a shared repository class
disproportionately elaborate, the fallback is a thin provider-specific typed
shell around shared mapping and query-policy functions. Duplicating the domain
ports or copying whole repository implementations should be the last choice.

### How should two migration histories be operated and checked?

Each provider owns its own migration directory. The SQL dialects differ, and a
Prisma migration history contains a `migration_lock.toml` that records its
provider. One history cannot be applied to both databases.

With one config per provider, commands should select the whole target through
`--config`. From `packages/db-prisma`, the intended command family is:

```bash
pnpm exec prisma validate \
  --config prisma/sqlite/prisma.config.ts
pnpm exec prisma validate \
  --config prisma/postgresql/prisma.config.ts

pnpm exec prisma generate \
  --config prisma/sqlite/prisma.config.ts
pnpm exec prisma generate \
  --config prisma/postgresql/prisma.config.ts

pnpm exec prisma migrate dev \
  --config prisma/sqlite/prisma.config.ts \
  --name <logical-change-name>
pnpm exec prisma migrate dev \
  --config prisma/postgresql/prisma.config.ts \
  --name <logical-change-name>

pnpm exec prisma migrate deploy \
  --config prisma/sqlite/prisma.config.ts
pnpm exec prisma migrate deploy \
  --config prisma/postgresql/prisma.config.ts
```

The two `migrate dev` runs intentionally produce different SQL for the same
logical model change. Both generated migrations should be reviewed and tested.
Client generation should remain an explicit script rather than relying on a
migration command to do it as a side effect.

`prisma migrate diff --exit-code` cannot compare the SQLite target with the
PostgreSQL target. Prisma requires both diff inputs to use the same provider, so
that command fails instead of answering whether their model declarations match.
It also compares represented database structure, not exact Prisma source or
generated TypeScript APIs.

It remains useful inside each provider. For example:

```bash
pnpm exec prisma migrate diff \
  --config prisma/sqlite/prisma.config.ts \
  --from-migrations prisma/sqlite/migrations \
  --to-schema prisma/sqlite \
  --exit-code

pnpm exec prisma migrate diff \
  --config prisma/postgresql/prisma.config.ts \
  --from-migrations prisma/postgresql/migrations \
  --to-schema prisma/postgresql \
  --exit-code
```

For `--exit-code`, an empty diff exits `0`, a command error exits `1`, and a
non-empty diff exits `2`. Using `--from-migrations` or `--to-migrations` requires
a shadow database. Prisma may create one automatically; Prisma 7 config exposes
`datasource.shadowDatabaseUrl` when it cannot.

These checks answer different questions:

| Check                              | What it proves                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository derivation check        | Both provider schemas contain the current canonical model source.                                                                                                                                             |
| `prisma validate` twice            | Each complete provider schema is legal for its connector.                                                                                                                                                     |
| `prisma generate` twice            | Both generated clients can be produced.                                                                                                                                                                       |
| TypeScript provider-binding checks | Shared repository code can be assembled with each generated client.                                                                                                                                           |
| Provider-local `migrate diff`      | The represented database end state of that provider's history matches its target schema. This does not check unsupported/custom SQL, migration identity or checksums, exact Prisma source, or generated APIs. |
| Shared repository contract suite   | Both real databases satisfy the behavior required by the domain ports.                                                                                                                                        |

There is no single Prisma command that replaces all six checks. In particular,
cross-provider model parity must be guaranteed by the repository-owned
derivation/checking step, not advertised as a `migrate diff` feature.

Official references:

- [Prisma 7 migration commands](https://docs.prisma.io/docs/cli/v7/migrate)
- [Prisma 7 `migrate diff`](https://docs.prisma.io/docs/cli/migrate/diff)
- [Prisma migration histories](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/migration-histories)
- [Prisma shadow databases](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/shadow-database)
- [Prisma config reference](https://docs.prisma.io/docs/orm/reference/prisma-config-reference)

### Does provider selection happen at runtime, and do driver adapters change it?

Runtime can select between two already-generated clients. It cannot change the
provider of one generated client.

Prisma 7's driver adapters are the execution bridge to a JavaScript database
driver. They do not erase the generated client's connector choice. The client
embeds its active provider and provider-specific query compiler; initialization
checks that the adapter's provider matches it.

Therefore runtime must select a matching pair:

```typescript
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient as SqlitePrismaClient } from "./generated/sqlite/client.js";

const sqlite = new SqlitePrismaClient({
  adapter: new PrismaBetterSqlite3({ url: config.url }),
});
```

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as PostgresPrismaClient } from "./generated/postgresql/client.js";

const postgres = new PostgresPrismaClient({
  adapter: new PrismaPg({ connectionString: config.connectionString }),
});
```

Passing `PrismaPg` to the SQLite-generated client produces a
`PrismaClientInitializationError`. Changing a URL may select another SQLite
database, but a PostgreSQL URL or adapter cannot change the generated client's
provider. The generated client remains SQLite-specific.

Official references:

- [Prisma 7 database drivers](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers)
- [Prisma 7.8 provider/adapter compatibility check](https://github.com/prisma/orm/blob/7.8.0/packages/client/src/runtime/getPrismaClient.ts#L374-L398)

## Current repository findings

The current setup has:

- one [`schema.prisma`](../../../../packages/db-prisma/prisma/schema.prisma) with
  `provider = "sqlite"` and one generated output;
- one generated client whose runtime metadata records `activeProvider: "sqlite"`
  and loads SQLite query-compiler artifacts;
- one module-global client in
  [`client.ts`](../../../../packages/db-prisma/src/client.ts);
- a [`SqlConfig`](../../../../packages/runtime/src/config/sql.config.ts) whose only
  legal value is currently `{ kind: "sqlite" }`;
- direct imports of the global client in the local-system profile and its
  observability builder; and
- seven Prisma repository/query implementations whose domain-facing ports are
  provider-neutral but whose constructor dependencies import the one generated
  SQLite `PrismaClient` type.

The existing schema is a promising portability baseline:

- changing only the provider and output generated a PostgreSQL client
  successfully under Prisma 7.8.0;
- it contains no `@db.*` native-type annotations, PostgreSQL namespaces, scalar
  arrays, or unsupported fields;
- production repository code contains no `$queryRaw` or `$executeRaw`; and
- repository operations are ordinary CRUD, relation, nested-write, and
  transaction operations.

That predicts high behavior reuse, not automatic type compatibility. Database
semantics still require real contract tests, especially around transactions,
constraints, case/collation behavior, timestamps, ordering, and error mapping.

The twelve existing SQL-related tests are SQLite-specific: they construct
`PrismaBetterSqlite3` directly and manually apply the SQLite migration SQL. Their
behavior assertions should become shared contract suites while database setup
and teardown remain provider-specific.

## Recommended package shape

The following is a target shape, not a requirement to move everything before a
PostgreSQL proof can begin:

```text
packages/db-prisma/
  prisma/
    model-source/
      models.prisma                 # authoritative model + enum declarations
    sqlite/
      schema.prisma                 # SQLite datasource + generator
      models.generated.prisma       # derived common declarations
      migrations/
      prisma.config.ts
    postgresql/
      schema.prisma                 # PostgreSQL datasource + generator
      models.generated.prisma       # derived common declarations
      migrations/
      prisma.config.ts
  scripts/
    derive-provider-schemas.*
  src/
    generated/
      sqlite/
      postgresql/
    providers/
      create-sqlite-client.ts
      create-postgresql-client.ts
```

The two generated modules should not both be star-exported from today's package
root: their `PrismaClient`, `Prisma`, model, enum, and input names collide. Keep
them private to provider assembly or expose explicit provider subpaths such as
`@lcase/db-prisma/sqlite` and `@lcase/db-prisma/postgresql`. Provider-neutral
application code should import neither. The current one-path generated-client
`.gitignore` rule and the package's build/typecheck generation scripts must also
be expanded for both outputs.

Each provider's `schema.prisma` contains only its provider-specific blocks:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../../src/generated/sqlite"
}

datasource db {
  provider = "sqlite"
}
```

The PostgreSQL target uses its own output and `provider = "postgresql"`. Each
config points `schema` at its provider directory, `migrations.path` at that
directory's migrations, and `datasource.url` at the appropriate environment
variable. Prisma documents that config-relative paths resolve relative to the
config file.

For a config stored inside each provider directory, the essential shape is:

```typescript
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: ".",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: process.env["PROVIDER_DATABASE_URL"],
  },
});
```

The real files should use distinct SQLite and PostgreSQL variable names and the
repository's deliberate `.env` loading policy. If a config uses Prisma's
throwing `env()` helper to require its URL, remember that every Prisma command
loads the config; generation and validation will then require that variable even
though they do not need to open the database.

The derivation script copies or renders the authoritative model declarations
into both `models.generated.prisma` files before validate/generate/migrate. It
should have a check mode suitable for CI. Generated target-model files may be
committed and checked for staleness or ignored and always generated first; the
important invariant is that neither target is hand-edited independently.

If this additional script is judged too much for the first slice, two explicit
complete schema files are a supported interim shape. In that case, call the
duplication out honestly and add a repository-owned comparison check before
treating them as a durable one-source solution.

## Runtime ownership and lifecycle

Generating both clients does not mean opening both database connections. The
runtime profile should statically select one provider per process:

```typescript
type SqlConfig =
  | { kind: "sqlite"; url: string }
  | { kind: "postgres"; connectionString: string };
```

Provider-specific construction should return the same project-owned repository
ports and a managed database resource:

```text
SqlConfig
  -> select generated client + matching driver adapter
  -> bind narrow repository database capabilities
  -> construct shared repository implementations
  -> expose domain ports to services/components
```

One selected client instance should be shared by all repositories in that
process, including repositories used by observability. Provider selection,
connection checks, startup, and shutdown belong in runtime assembly. Components
and application services should continue to see only the existing domain ports.

The current module-global `prisma` export should therefore become explicit
provider construction. `buildObservability()` should receive the repositories
or ports it needs rather than importing that global independently. Database
migration remains a deployment operation, not runtime startup behavior.

This is deploy-time configuration, not hot swapping and not data migration.
Changing the selected backend does not transfer existing SQLite data into
PostgreSQL.

## Suggested division of the work

### C15: prove the PostgreSQL backend and reusable repository seam

1. Resolve and document whether SQLite remains supported. The rest below assumes
   it does.
2. Add provider-specific schema/config/output locations and the PostgreSQL driver
   dependencies without changing live runtime selection.
3. Establish either the canonical-model derivation step or an explicit interim
   two-schema policy.
4. Generate both clients and keep generation explicit in package build and
   typecheck scripts.
5. Compile-probe method-level delegate Picks, then introduce project-owned
   operation bindings only where the generated signatures still disagree. Treat
   the transaction boundary explicitly.
6. Compile the provider bindings for all seven repositories.
7. Create a fresh PostgreSQL migration history while retaining the SQLite
   history.
8. Extract shared repository behavior contracts and run them against real SQLite
   and PostgreSQL harnesses.

The most useful early checkpoint is smaller than the durable target: steps 2 and
4, followed by one representative non-transactional repository and one
transactional repository from steps 5 and 6. Prove both seams before generalizing
the pattern across all seven repositories or disturbing runtime construction.

### C16: make the local-system profile select SQL

1. Extend `SqlConfig` with the PostgreSQL branch and validate its required
   settings.
2. Replace the global SQLite singleton with provider-specific client/resource
   factories.
3. Construct only the selected provider and bind the shared repositories once.
4. Pass the same repository instances or ports to services and observability.
5. Add database connect, health/ping, and disconnect behavior to managed runtime
   lifecycle.
6. Verify both profile branches through the HTTP server and CLI composition
   paths.

The exact Change boundary can be adjusted during planning. The durable boundary
is conceptual: C15 proves both database implementations behind the existing
repository/query port contracts; C16 makes deployment configuration select
between those proven implementations.

## Avoid these shortcuts

- Do not pass `PrismaPg` to the current SQLite-generated client.
- Do not use one generated client type as the shared database port.
- Do not pass `SqlitePrismaClient | PostgresPrismaClient` through repository code.
- Do not cast the PostgreSQL client to the SQLite client merely because current
  queries happen to look alike.
- Do not duplicate domain ports by provider.
- Do not run SQLite migration SQL against PostgreSQL.
- Do not discard the SQLite migration history while SQLite remains a supported
  profile branch.
- Do not instantiate both clients when one configured backend is active.
- Do not combine the provider work with a Prisma 8 migration; that is a separate
  architecture and tooling change.

## Deferred decisions

- Whether derived provider schema files are committed or always ephemeral.
- The exact narrow capability and transaction-runner types for the shared
  repository implementations.
- Whether a future requirement justifies provider-specific native types. The
  initial target should stay within the SQLite/PostgreSQL common model subset.
- Data-copy tooling from SQLite to PostgreSQL.
- Production PostgreSQL pooling, credentials, TLS, backup, and operational
  policy.
- Whether SQLite remains supported after the swappability proof has served its
  purpose.

Those decisions do not block proving two generated clients and a reusable
repository behavior layer.
