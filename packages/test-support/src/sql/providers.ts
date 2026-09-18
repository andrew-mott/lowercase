import { describe } from "vitest";
import { createPostgresTestDb } from "./postgres-test-db.js";
import { createSqliteTestDb } from "./sqlite-test-db.js";
import { POSTGRES_READY_ENV } from "./postgres-admin.js";
import type { TestDb } from "./test-sql-client.js";

export type SqlProvider = "sqlite" | "postgres";

type Provider = {
  name: SqlProvider;
  create: () => Promise<TestDb>;
  available: () => boolean;
};

const PROVIDERS: Provider[] = [
  // SQLite needs no server, so it is never skipped.
  { name: "sqlite", create: createSqliteTestDb, available: () => true },
  {
    name: "postgres",
    create: createPostgresTestDb,
    // set by global setup, and only after it actually reached the server
    available: () => process.env[POSTGRES_READY_ENV] === "1",
  },
];

/**
 * Runs one suite body against every SQL provider, in its own `describe` block.
 *
 * An unavailable provider gets `describe.skip` rather than being left out, so an
 * absent server shows up in the reporter as a named block of skipped tests
 * instead of a suite that quietly never ran. That distinction is the whole
 * reason this exists rather than each suite writing its own `skipIf`.
 */
export function forEachSqlProvider(
  body: (createDb: () => Promise<TestDb>, provider: SqlProvider) => void,
): void {
  for (const provider of PROVIDERS) {
    const block = provider.available() ? describe : describe.skip;
    block(provider.name, () => body(provider.create, provider.name));
  }
}
