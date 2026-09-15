import path from "node:path";
import { loadRepoEnv, repoRoot } from "./repo-env.js";

/**
 * Resolves a `file:` URL the way the repo-root `.env` means it: relative to the
 * directory that file lives in.
 *
 * Worth being explicit about, because a bare relative `file:` URL is otherwise
 * ambiguous across the two things that read this variable. The Prisma CLI
 * resolves it against the schema directory, while better-sqlite3 resolves it
 * against the process working directory, so the same string names two different
 * files depending on who read it. Anchoring on the `.env` directory gives one
 * answer, and it is the answer a developer writing that file expects.
 *
 * An absolute path is returned untouched, which is what a deployment that sets
 * the variable for real would supply.
 */
function resolveFileUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const target = url.slice("file:".length);
  if (path.isAbsolute(target)) return url;
  return `file:${path.resolve(repoRoot, target)}`;
}

/**
 * Where the SQLite database lives when nothing says otherwise.
 *
 * A default in code rather than a value everyone has to copy into an env file:
 * it has one home, needs no copying, and cannot go stale. `prisma.sqlite.config.ts`
 * calls this same function, so the CLI and a running app agree from any working
 * directory -- which is the property that matters, since `pnpm dev` runs from an
 * app directory while `pnpm db:migrate` runs from the repo root.
 *
 * Anchored at the repo root deliberately, unlike the artifact store and the
 * replay log, which resolve against the working directory and so land under
 * whichever app you started. Moving the database to match them would point a
 * server at an empty new file rather than the one it has been writing to.
 *
 * An app that wants its own database passes a URL through `SqlUserConfig` instead of
 * relying on this.
 */
export function defaultSqliteUrl(): string {
  loadRepoEnv();
  const configured = process.env["DATABASE_URL"];
  if (configured) return resolveFileUrl(configured);
  return `file:${path.join(repoRoot, "lcase-db/sqlite/dev.db")}`;
}
