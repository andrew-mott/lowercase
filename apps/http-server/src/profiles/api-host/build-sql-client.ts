import { PrismaPg } from "@prisma/adapter-pg";
import type { PortableSqlClient } from "@lcase/db-prisma";
import {
  PrismaClient as PostgresClient,
  defaultPostgresUrl,
} from "@lcase/db-prisma/postgres";
import type { LifecycleHooks } from "@lcase/assembly";
import type { PostgresSqlUserConfig } from "@lcase/types";

export type BuiltSqlClient = {
  client: PortableSqlClient;
  hooks: LifecycleHooks<PortableSqlClient>;
};

export function buildSqlClient(config: PostgresSqlUserConfig): BuiltSqlClient {
  // Annotated rather than inferred: `PortableSqlClient` is a strict narrowing of
  // the SQLite client, so this assignment is what proves the Postgres client is
  // usable through it. A failure here is a real incompatibility.
  const client: PortableSqlClient = new PostgresClient({
    adapter: new PrismaPg({
      connectionString: config.url ?? defaultPostgresUrl(),
    }),
  });

  return {
    client,
    hooks: {
      // A query, not just `$connect()`. Under a driver adapter `$connect()`
      // resolves without reaching the server -- pointed at a dead port it
      // returns cleanly and `runtime.start()` reports `ok`. One round trip is
      // what makes an unreachable database fail at startup, where it rolls back,
      // instead of inside whichever job happens to be first.
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
