import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@lcase/db-prisma/sqlite";
import { SQLITE_TEMPLATE_ENV } from "./global-setup.js";
import type { TestDb, TestSqlClient } from "./test-sql-client.js";

async function tableNames(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'`,
  );
  return rows.map((row) => row.name);
}

/**
 * A SQLite database for one suite: a copy of the template file global setup
 * migrated, so no migration runs here.
 */
export async function createSqliteTestDb(): Promise<TestDb> {
  const template = process.env[SQLITE_TEMPLATE_ENV];
  if (!template) {
    throw new Error(
      `${SQLITE_TEMPLATE_ENV} is not set. The suite is missing @lcase/test-support's globalSetup -- check that it runs under vitest.integration.config.ts.`,
    );
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lcase-sqlite-test-"));
  const file = path.join(dir, "test.sqlite");
  await fs.copyFile(template, file);

  const client = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${file}` }),
  });

  // Read once: the schema does not change for the life of the suite.
  const tables = await tableNames(client);

  // No cast: `TestSqlClient` is a strict narrowing of the SQLite client, so a
  // failure to assign here is a real incompatibility rather than a nuisance.
  const testClient: TestSqlClient = client;

  return {
    client: testClient,
    async reset() {
      // SQLite has no TRUNCATE, and deleting in dependency order would be a
      // hand-maintained ordering waiting to go stale, so enforcement is lifted
      // for the duration instead.
      await client.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
      for (const table of tables) {
        await client.$executeRawUnsafe(`DELETE FROM "${table}"`);
      }
      await client.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    },
    async dispose() {
      await client.$disconnect();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
