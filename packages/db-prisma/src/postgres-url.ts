import { loadRepoEnv } from "./repo-env.js";

/**
 * The compose service, derived from the single variable that also moves the
 * compose binding itself. Deriving rather than hardcoding a port is what keeps
 * the binding, the Prisma CLI, and a running app in agreement when someone has
 * to move it -- a machine already running native Postgres, most likely. The
 * alternative has already been tried and cost: the port lived in two
 * independent variables that had to be kept equal by hand, and CI failed the
 * first time they disagreed.
 */
function composeUrl(database: string): string {
  const port = process.env["POSTGRES_HOST_PORT"] ?? "5432";
  return `postgresql://lcase:lcase@localhost:${port}/${database}`;
}

/**
 * The Postgres database a running app or the Prisma CLI uses.
 *
 * Deliberately not the same variable the contract suites read: those create and
 * drop databases beside the one named here, so they take `POSTGRES_TEST_URL`
 * instead. This one names the developer's own database.
 */
export function defaultPostgresUrl(): string {
  loadRepoEnv();
  return process.env["POSTGRES_DATABASE_URL"] ?? composeUrl("lcase");
}

/**
 * Required by `migrate diff --from-migrations`, which is how `check:migrations`
 * verifies the committed history still produces the current models. Prisma
 * creates and drops this database itself, so it must not name a real one. SQLite
 * needs no equivalent, being the only provider that can diff a migrations
 * directory offline.
 */
export function defaultPostgresShadowUrl(): string {
  loadRepoEnv();
  return (
    process.env["POSTGRES_SHADOW_DATABASE_URL"] ?? composeUrl("lcase_shadow")
  );
}
