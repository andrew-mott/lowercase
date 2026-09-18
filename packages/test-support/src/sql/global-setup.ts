import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  POSTGRES_READY_ENV,
  POSTGRES_TEMPLATE_DB,
  WORKER_DB_PREFIX,
  maintenanceUrl,
  postgresTestUrl,
  withPostgresDatabase,
} from "./postgres-admin.js";

const run = promisify(execFile);

/**
 * The migrated SQLite file every suite copies. Lives in the OS temp directory
 * rather than the repo so nothing has to be gitignored, and its path is handed
 * to the workers through an environment variable.
 */
export const SQLITE_TEMPLATE_ENV = "LCASE_SQLITE_TEMPLATE";

const SQLITE_CONFIG = "prisma.sqlite.config.ts";
const POSTGRES_CONFIG = "prisma.postgres.config.ts";

/**
 * Applies a provider's migration history to `url`.
 *
 * Runs through pnpm's workspace filter rather than resolving db-prisma's
 * directory: the filter finds the package from anywhere in the workspace and
 * sets its directory as the working directory, which is what the relative
 * `--config` path needs. Locating the package from this module is the thing that
 * does not work, since `import.meta.resolve` is absent inside vitest's module
 * runner.
 */
async function deploy(config: string, url: string, urlVar: string) {
  await run(
    "pnpm",
    [
      "--filter",
      "@lcase/db-prisma",
      "exec",
      "prisma",
      "migrate",
      "deploy",
      "--config",
      config,
    ],
    { env: { ...process.env, [urlVar]: url } },
  );
}

async function setUpSqliteTemplate(): Promise<string> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "lcase-sqlite-template-"),
  );
  const file = path.join(dir, "template.sqlite");
  await deploy(SQLITE_CONFIG, `file:${file}`, "DATABASE_URL");
  process.env[SQLITE_TEMPLATE_ENV] = file;
  return dir;
}

/**
 * Migrates a template database once, so each worker can clone it with
 * `CREATE DATABASE ... TEMPLATE` instead of running the migration itself.
 * Cloning requires no session connected to the template, which is why the
 * deploy subprocess finishing is what makes this safe.
 */
async function setUpPostgresTemplate(url: string) {
  await withPostgresDatabase(maintenanceUrl(url), async (client) => {
    // Worker databases from an earlier run may still exist if it crashed. They
    // are dropped at the start rather than at teardown, so a run always begins
    // clean even after one that never got to clean up.
    //
    // `starts_with` rather than `LIKE`, because the prefix contains underscores
    // and `LIKE` reads those as single-character wildcards -- so the pattern
    // would also have matched, and dropped, an unrelated database whose name
    // merely resembled the prefix. This only ever touches names beginning
    // `lcase_test_w`; nothing else on the server is dropped, including the
    // database the connection URL names.
    const stale = await client.$queryRawUnsafe<{ datname: string }[]>(
      `SELECT datname FROM pg_database WHERE starts_with(datname, '${WORKER_DB_PREFIX}')`,
    );
    for (const { datname } of stale) {
      await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}"`);
    }
    await client.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${POSTGRES_TEMPLATE_DB}"`,
    );
    await client.$executeRawUnsafe(`CREATE DATABASE "${POSTGRES_TEMPLATE_DB}"`);
  });

  const templateUrl = new URL(url);
  templateUrl.pathname = `/${POSTGRES_TEMPLATE_DB}`;
  await deploy(
    POSTGRES_CONFIG,
    templateUrl.toString(),
    "POSTGRES_DATABASE_URL",
  );
}

type Teardown = () => Promise<void>;

/**
 * Whether nothing is listening at the address, as opposed to the server being
 * there and rejecting us.
 *
 * The distinction is the point: an unreachable server means "no Postgres here,
 * skip", while a rejection means something is genuinely wrong and the run should
 * fail. Prisma surfaces the driver's own errno for the first (`ECONNREFUSED`)
 * and its own `P2010` wrapper for the second, so the two are cleanly separable.
 */
function isUnreachable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === "string" &&
    ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"].includes(code)
  );
}

/**
 * Vitest `globalSetup` for a package whose integration suites use both
 * providers. Runs once per test run, in the main process, before any worker
 * starts -- which is the whole point: `prisma migrate deploy` is a subprocess,
 * and paying for it once beats paying for it in every file.
 *
 * A package whose suites are SQLite-only should use the `sql-global-setup/sqlite`
 * subpath instead, so it does not provision a Postgres template nothing reads.
 */
export default async function setup(): Promise<Teardown> {
  const teardown = await setUpSqlite();

  // Availability is probed, not declared. Reaching the server is the only thing
  // that enables the Postgres half, so a skip always means there is no server
  // rather than that someone forgot to set a variable on a machine where one is
  // running. Not having started the container is the expected path, so that one
  // reports and continues.
  const url = postgresTestUrl();
  try {
    await setUpPostgresTemplate(url);
    process.env[POSTGRES_READY_ENV] = "1";
  } catch (error) {
    // Anything that is not a connection failure -- wrong credentials, a missing
    // database, a broken migration -- is a real fault and must not masquerade as
    // an absent server. Swallowing those would silently drop every Postgres test
    // while the run still reported success, which is the failure this whole
    // probe exists to prevent.
    if (!isUnreachable(error)) throw error;
    console.warn(
      `Postgres suites skipped: nothing is listening at ${url}.\nStart it with \`docker compose up -d postgres\`, or set POSTGRES_HOST_PORT if it runs on another port.`,
    );
  }

  return teardown;
}

/**
 * The SQLite-only half, exported for packages that never touch Postgres. It
 * leaves `POSTGRES_READY_ENV` unset, so `forEachSqlProvider` would report the
 * Postgres branch as skipped if such a package ever used it.
 */
export async function setUpSqlite(): Promise<Teardown> {
  const dir = await setUpSqliteTemplate();
  return async () => {
    await fs.rm(dir, { recursive: true, force: true });
  };
}
