import type { PortableSqlClient } from "@lcase/db-prisma";

/**
 * The client a suite gets from `createSqliteTestDb`/`createPostgresTestDb`.
 *
 * An alias rather than its own definition: this type started here, for the
 * contract suites, and moved to `@lcase/db-prisma` once a composed process
 * needed the same thing to hand its repositories. The name stays so the
 * suites read in test terms, and so the harness does not look like it owns a
 * rule the production composition also depends on.
 */
export type TestSqlClient = PortableSqlClient;

/**
 * A live test database. `reset` empties every table without dropping the
 * schema, so the client stays valid across tests; `dispose` closes the
 * connection and releases whatever the provider allocated for this suite.
 */
export type TestDb = {
  client: TestSqlClient;
  reset(): Promise<void>;
  dispose(): Promise<void>;
};
