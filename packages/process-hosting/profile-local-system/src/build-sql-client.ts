import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PortableSqlClient } from "@lcase/db-prisma";
import {
  PrismaClient as SqliteClient,
  defaultSqliteUrl,
} from "@lcase/db-prisma/sqlite";
import {
  PrismaClient as PostgresClient,
  defaultPostgresUrl,
} from "@lcase/db-prisma/postgres";
import type { SqlUserConfig } from "@lcase/types";
import type { LifecycleHooks } from "@lcase/assembly";

export type BuiltSqlClient = {
  client: PortableSqlClient;
  hooks: LifecycleHooks<PortableSqlClient>;
};

// The one real per-provider choice this profile makes -- isolated into its own
// function so the branch is directly unit-testable without pulling in the rest
// of the profile's wiring, matching buildArtifactStore and buildMessageRouter.
export function buildSqlClient(config: SqlUserConfig): BuiltSqlClient {
  // No cast on either branch. `PortableSqlClient` is a strict narrowing of the
  // SQLite client, so these two assignments are what prove both providers are
  // usable here -- a failure is a real incompatibility, not a nuisance, and
  // there is no separate assertion to keep in sync.
  const client: PortableSqlClient =
    config.kind === "sqlite"
      ? new SqliteClient({
          adapter: new PrismaBetterSqlite3({
            url: config.url ?? defaultSqliteUrl(),
          }),
        })
      : new PostgresClient({
          adapter: new PrismaPg({
            connectionString: config.url ?? defaultPostgresUrl(),
          }),
        });

  return {
    client,
    hooks: {
      // A query, not just `$connect()`. Under a driver adapter `$connect()`
      // resolves without reaching the server -- measured, not assumed: pointed
      // at a dead port it returns cleanly and `runtime.start()` reports `ok`,
      // which is the same "reports success while the infrastructure is absent"
      // failure this initiative has now hit three times. One round trip is what
      // makes an unreachable database fail at startup, where it rolls back,
      // instead of inside whichever request happens to be first.
      start: async (c) => {
        await c.$connect();
        await c.$queryRawUnsafe("SELECT 1");
      },
      stop: (c) => c.$disconnect(),
      health: async (c) => {
        try {
          await c.$queryRawUnsafe("SELECT 1");
          return { status: "healthy" as const };
        } catch (error) {
          return {
            status: "unhealthy" as const,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
  };
}
