// Verifies that each provider's committed migration history still produces the
// models in its schema. It covers SQLite only, which is the one provider Prisma
// can diff a migrations directory for offline; Postgres needs a shadow
// database, so checking it would need a running server.
//
// Run it with `pnpm -F @lcase/db-prisma run check:migrations`, and note the
// Postgres half is skipped rather than failed when no server is reachable, so
// the same command is usable on a machine with nothing running.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// The Prisma configs load this themselves, but that happens in the subprocess,
// after the URLs below have already been resolved and passed in. So it has to
// be loaded here too, or POSTGRES_HOST_PORT set in .env would move the compose
// binding and the test suites while leaving this check on the default port.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, "../../..", ".env") });

const POSTGRES_SHADOW_DB = "lcase_shadow";

/**
 * Which server to check against, and both URLs the Postgres config needs,
 * derived from one base so they cannot disagree.
 *
 * `prisma.postgres.config.ts` reads `POSTGRES_DATABASE_URL` and falls back to
 * the compose service, and its `shadowDatabaseUrl` falls back the same way.
 * Both are resolved here instead and passed explicitly, so that overriding the
 * port for the suites moves this check with them. Without it, anyone who set
 * `POSTGRES_HOST_PORT` because 5434 was taken would find the suites following
 * the override while this check kept talking to a port with nothing on it.
 */
function postgresUrls() {
  const port = process.env.POSTGRES_HOST_PORT ?? "5432";
  const base =
    process.env.POSTGRES_DATABASE_URL ??
    process.env.POSTGRES_TEST_URL ??
    `postgresql://lcase:lcase@localhost:${port}/lcase`;

  const shadow = new URL(base);
  shadow.pathname = `/${POSTGRES_SHADOW_DB}`;

  return {
    POSTGRES_DATABASE_URL: base,
    POSTGRES_SHADOW_DATABASE_URL: shadow.toString(),
  };
}

function run(args, { input, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn("prisma", args, {
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    if (input !== undefined) child.stdin.end(input);
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function diff(config, migrations, schema, env) {
  return run(
    [
      "migrate",
      "diff",
      "--config",
      config,
      "--from-migrations",
      migrations,
      "--to-schema",
      schema,
      "--exit-code",
    ],
    { env },
  );
}

const failures = [];

// SQLite runs offline.
{
  const { code, out } = await diff(
    "prisma.sqlite.config.ts",
    "prisma/sqlite/migrations",
    "prisma/sqlite/schema.prisma",
  );
  if (code === 0) console.log("sqlite: history matches schema");
  else failures.push(`sqlite:\n${out}`);
}

// Postgres needs a shadow database that already exists -- unlike `migrate dev`,
// `migrate diff` will not create one. Creating it doubles as the reachability
// probe, and is allowed to fail when it already exists, which is what makes the
// check re-runnable: the second run simply finds it there.
{
  const env = postgresUrls();
  const created = await run(
    ["db", "execute", "--config", "prisma.postgres.config.ts", "--stdin"],
    { input: `CREATE DATABASE ${POSTGRES_SHADOW_DB}`, env },
  );

  // Availability is probed rather than declared, matching how the integration
  // suites decide. Anything other than an unreachable server is a real failure.
  if (created.out.includes("P1001")) {
    console.log(
      `postgres: skipped, no server reachable at ${env.POSTGRES_DATABASE_URL}`,
    );
  } else {
    const { code, out } = await diff(
      "prisma.postgres.config.ts",
      "prisma/postgres/migrations",
      "prisma/postgres/schema.prisma",
      env,
    );
    if (code === 0) console.log("postgres: history matches schema");
    else failures.push(`postgres:\n${out}`);
  }
}

if (failures.length > 0) {
  console.error(
    `\nMigration history does not match the schema.\nRegenerate the affected provider's migration rather than editing the schema alone.\n\n${failures.join("\n")}`,
  );
  process.exit(1);
}
