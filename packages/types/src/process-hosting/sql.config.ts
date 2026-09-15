// SQLite is the lightweight install and stays the default; Postgres is the
// other live backend, not a replacement. Which one a process uses is decided
// when it is composed, and is not hot-swappable -- switching does not move
// data between them.
//
// `url` is optional on both because a default in code has one home, needs no
// copying, and cannot go stale, which is the same reasoning the test harness and
// the Prisma configs already follow. An app that wants its own database, or a
// deployment pointing at a managed server, supplies it.
export type SqliteSqlUserConfig = {
  kind: "sqlite";
  /** Defaults to `lcase-db/sqlite/dev.db` at the repo root. */
  url?: string;
};

export type PostgresSqlUserConfig = {
  kind: "postgres";
  /** Defaults to the docker-compose service on `POSTGRES_HOST_PORT`. */
  url?: string;
};

export type SqlUserConfig = SqliteSqlUserConfig | PostgresSqlUserConfig;
