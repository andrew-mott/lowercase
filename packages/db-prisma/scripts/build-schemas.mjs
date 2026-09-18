// Derives the Postgres schema from the authored SQLite one.
//
// A Prisma schema names exactly one datasource provider, and multi-file schemas
// merge rather than overlay, so there is no Prisma-native way to share models
// across providers. This script is that missing piece: the models are authored
// once, in a file that is itself a valid schema (so `prisma validate` and the
// editor extension work on it), and everything below the sentinel is copied
// verbatim under a Postgres header.
//
// The output is a build artifact, not a source file -- it is gitignored and
// rebuilt before every Prisma command, so it cannot drift from the authored
// schema and needs no separate drift check.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SENTINEL = "// ---- shared models ----";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath = path.join(packageRoot, "prisma/sqlite/schema.prisma");
const targetPath = path.join(packageRoot, "prisma/postgres/schema.prisma");

const POSTGRES_HEADER = `// GENERATED FILE -- do not edit.
// Derived from prisma/sqlite/schema.prisma by scripts/build-schemas.mjs.
// Edit the models there; this file is rewritten on every build.

generator client {
  provider = "prisma-client"
  output   = "../../src/generated/postgres"
}

datasource db {
  provider = "postgresql"
}

`;

const source = await fs.readFile(sourcePath, "utf8");
const sentinelIndex = source.indexOf(SENTINEL);

if (sentinelIndex === -1) {
  throw new Error(
    `Cannot derive the Postgres schema: ${path.relative(packageRoot, sourcePath)} ` +
      `has no "${SENTINEL}" line marking where the shared models begin.`,
  );
}

const models = source.slice(sentinelIndex);

await fs.mkdir(path.dirname(targetPath), { recursive: true });
await fs.writeFile(targetPath, POSTGRES_HEADER + models, "utf8");
