import type { PrismaClient } from "@lcase/db-prisma/postgres";
import {
  POSTGRES_TEMPLATE_DB,
  WORKER_DB_PREFIX,
  maintenanceUrl,
  postgresClient,
  postgresTestUrl,
  withPostgresDatabase,
  workerDatabaseUrl,
} from "./postgres-admin.js";
import type { TestDb, TestSqlClient } from "./test-sql-client.js";

/**
 * One database per vitest worker, cloned from the template global setup
 * migrated. Isolation comes from the database name in the connection URL, which
 * every driver understands -- unlike a shared search path, which would depend on
 * how the driver adapter handles connection parameters.
 */
function workerDatabaseName(): string {
  return `${WORKER_DB_PREFIX}${process.env["VITEST_WORKER_ID"] ?? "0"}`;
}

/**
 * The connection URL for this worker's database, for a suite that needs to hand
 * a URL to the code under test rather than use a client this package built --
 * a process profile selecting its own SQL backend from configuration, say.
 *
 * Naming a database is not creating one. This returns the same database
 * `createPostgresTestDb()` provisions, so call that first when the schema has to
 * be there.
 */
export function postgresTestDatabaseUrl(): string {
  return workerDatabaseUrl(postgresTestUrl(), workerDatabaseName());
}

/**
 * Created on demand rather than in global setup, which cannot know how many
 * workers vitest will start. Existence is checked rather than assumed because
 * vitest isolates modules per test file, so this runs again for every file that
 * lands on the same worker.
 */
async function ensureWorkerDatabase(url: string, name: string) {
  await withPostgresDatabase(maintenanceUrl(url), async (client) => {
    const existing = await client.$queryRawUnsafe<{ datname: string }[]>(
      `SELECT datname FROM pg_database WHERE datname = '${name}'`,
    );
    if (existing.length > 0) return;
    await client.$executeRawUnsafe(
      `CREATE DATABASE "${name}" TEMPLATE "${POSTGRES_TEMPLATE_DB}"`,
    );
  });
}

async function tableNames(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`,
  );
  return rows.map((row) => row.tablename);
}

export async function createPostgresTestDb(): Promise<TestDb> {
  const url = postgresTestUrl();
  const name = workerDatabaseName();
  await ensureWorkerDatabase(url, name);

  const client = postgresClient(workerDatabaseUrl(url, name));

  // The assignment is the parity check: the Postgres client satisfies a type
  // written against the SQLite one, or this does not compile.
  const testClient: TestSqlClient = client;

  const tables = await tableNames(client);
  const truncate = `TRUNCATE TABLE ${tables
    .map((table) => `"${table}"`)
    .join(", ")} RESTART IDENTITY CASCADE`;

  return {
    client: testClient,
    async reset() {
      // CASCADE handles foreign-key ordering, so the table list can come
      // straight from the catalog instead of a hand-maintained sequence that
      // would silently miss a new model.
      if (tables.length > 0) await client.$executeRawUnsafe(truncate);
    },
    async dispose() {
      // The database itself stays: the next file on this worker reuses it, and
      // global setup drops leftovers at the start of the next run.
      await client.$disconnect();
    },
  };
}
