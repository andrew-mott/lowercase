/**
 * Shared test infrastructure, importable across package boundaries.
 *
 * The rule that keeps this package from spreading: it supplies infrastructure
 * and never domain objects. A caller gets a live database and constructs its own
 * repositories against it, which is why nothing here imports `@lcase/adapters`,
 * `@lcase/ports`, or any service.
 */
export { createSqliteTestDb } from "./sql/sqlite-test-db.js";
export {
  createPostgresTestDb,
  postgresTestDatabaseUrl,
} from "./sql/postgres-test-db.js";
export { forEachSqlProvider, type SqlProvider } from "./sql/providers.js";
export { postgresTestUrl, POSTGRES_READY_ENV } from "./sql/postgres-admin.js";
export type { TestDb, TestSqlClient } from "./sql/test-sql-client.js";
