/**
 * The provider-neutral seam. `SqlClient` is concretely the SQLite client type,
 * and that asymmetry is the design: SQLite's generated input types are a strict
 * subset of Postgres's, and method parameters are contravariant, so a seam
 * typed against SQLite is satisfied by either client while the reverse is not.
 * Typing repositories against this is what keeps shared code inside the subset
 * both providers support, enforced at compile time.
 *
 * See docs/initiatives/swappable-infrastructure/research/prisma-provider-type-seam-spike.md.
 *
 * Code that needs a concrete client -- to construct one, or to name a provider
 * deliberately -- imports `@lcase/db-prisma/sqlite` or `@lcase/db-prisma/postgres`.
 */
export type { PrismaClient as SqlClient } from "./generated/sqlite/client.js";

/**
 * The provider-neutral client. Where `SqlClient` is what a repository narrows to
 * state what it needs, this is what composition hands it -- one value satisfying
 * every repository seam at once, and the type a constructed client is assigned
 * to in order to prove it is portable.
 */
export type { PortableSqlClient } from "./portable-client.js";
