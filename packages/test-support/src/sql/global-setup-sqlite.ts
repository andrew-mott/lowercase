import { setUpSqlite } from "./global-setup.js";

/**
 * Vitest `globalSetup` for a package whose integration suites are SQLite-only.
 *
 * Exists because the default setup provisions a Postgres template too, and a
 * package that never constructs a Postgres client would pay a `CREATE DATABASE`
 * and a `migrate deploy` subprocess for something nothing reads.
 */
export default setUpSqlite;
