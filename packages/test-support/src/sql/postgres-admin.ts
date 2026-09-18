import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@lcase/db-prisma/postgres";

export const POSTGRES_TEMPLATE_DB = "lcase_test_template";
export const WORKER_DB_PREFIX = "lcase_test_w";

/**
 * Set by global setup once it has actually reached the server, and read by the
 * workers to decide whether the Postgres half of each suite runs. Availability
 * is probed rather than declared: an unset variable used to mean "skip", which
 * silently skipped Postgres on a machine where it was running perfectly well.
 */
export const POSTGRES_READY_ENV = "LCASE_POSTGRES_READY";

/**
 * The Postgres server the suites run against.
 *
 * Defaults to the docker-compose service on the standard Postgres port, the
 * same way `prisma.postgres.config.ts` does, so nothing has to be set for the
 * normal case and CI sets nothing either. A machine already running native
 * Postgres sets `POSTGRES_HOST_PORT`, which moves the compose binding and this
 * default together -- one knob rather than two that must be kept in agreement.
 * `POSTGRES_TEST_URL` overrides the whole URL, for a different host entirely.
 * Both have to stay listed in `turbo.json`'s `test:integration` `env` array or
 * Turborepo strips them and the override silently does nothing.
 *
 * Deliberately not `POSTGRES_DATABASE_URL`: that one names the developer's own
 * database, and these suites create and drop databases beside the one named
 * here.
 */
export function postgresTestUrl(): string {
  const port = process.env["POSTGRES_HOST_PORT"] ?? "5432";
  return (
    process.env["POSTGRES_TEST_URL"] ??
    `postgresql://lcase:lcase@localhost:${port}/lcase`
  );
}

/**
 * `CREATE DATABASE` cannot run inside the database being created, so
 * administrative statements connect to the server's default database instead.
 */
export function maintenanceUrl(url: string): string {
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  return maintenance.toString();
}

export function workerDatabaseUrl(url: string, database: string): string {
  const target = new URL(url);
  target.pathname = `/${database}`;
  return target.toString();
}

export function postgresClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Opens a client, runs `body`, and always disconnects. */
export async function withPostgresDatabase<T>(
  connectionString: string,
  body: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const client = postgresClient(connectionString);
  try {
    return await body(client);
  } finally {
    await client.$disconnect();
  }
}
