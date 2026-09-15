import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

let cached: { root: string | undefined } | undefined;

/**
 * Found by walking up for the workspace marker rather than by a counted number
 * of `..` segments. A fixed depth would be right from `dist/` and silently wrong
 * from `src/`, which matters because the Prisma config files import this before
 * anything is built.
 *
 * Returns undefined rather than throwing, because whether a missing checkout is
 * a problem depends entirely on what the caller wanted it for. Computed on
 * demand rather than at module load for the same reason: importing the Postgres
 * client reaches this module through `defaultPostgresUrl`, and a walk performed
 * at import time ran even for a process that supplies its own connection URL.
 */
function findRepoRoot(): string | undefined {
  if (cached !== undefined) return cached.root;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      cached = { root: dir };
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      cached = { root: undefined };
      return undefined;
    }
    dir = parent;
  }
}

/**
 * The repo root, for a caller that cannot do anything useful without one --
 * building a default path to a file inside the checkout, in practice. Throws,
 * because for those callers the absence really is unrecoverable.
 */
export function repoRoot(): string {
  const root = findRepoRoot();
  if (root === undefined) {
    throw new Error(
      "[db-prisma] could not locate the repo root: no pnpm-workspace.yaml above this module.",
    );
  }
  return root;
}

/**
 * Loads the repo-root `.env`, which is the only one anything here reads.
 *
 * Called by every default-URL function rather than at module load, so that both
 * providers honour the same file. A default that silently ignores `.env` on one
 * branch and honours it on the other is the exact shape of the two faults C17
 * recorded: the value looks set, something reads a stale default instead, and
 * the failure surfaces somewhere else entirely.
 *
 * Best effort on purpose. A deployed process has no checkout and therefore no
 * repo `.env` to read, and it got its configuration from the real environment
 * before this ran. Failing there would refuse to start a correctly configured
 * process over a development convenience that does not apply to it.
 */
export function loadRepoEnv(): void {
  const root = findRepoRoot();
  if (root === undefined) return;
  dotenv.config({ path: path.join(root, ".env"), quiet: true });
}
