/**
 * Compile-time proof that the Postgres client satisfies every repository seam.
 *
 * Nothing constructs a Postgres client yet, so without this file the claim that
 * these repositories are provider-portable would rest on a document rather than
 * on the build. The failure it exists to catch is quiet: someone reaches for
 * `groupBy` or `mode: "insensitive"` in a shared repository, the SQLite build
 * stays green because the seam is typed against SQLite, and the break only
 * surfaces whenever a Postgres client is finally wired up.
 *
 * Why this works at all: SQLite's generated input types are a strict subset of
 * Postgres's, and method parameters are contravariant, so a seam typed against
 * SQLite accepts either client while a seam typed against Postgres would accept
 * only Postgres. See
 * docs/initiatives/swappable-infrastructure/research/prisma-provider-type-seam-spike.md.
 *
 * This is not a test file -- vitest's `tests/{@literal **}/*.test.[jt]s` glob skips it and it
 * has no runtime behaviour to run. It is picked up by tsconfig.json, which
 * includes `tests`, and excluded by tsconfig.build.json, which includes only
 * `src`. It fails `pnpm typecheck`, naming the offending seam.
 */

import type { PrismaClient as PostgresClient } from "@lcase/db-prisma/postgres";

import type { PrismaArtifactRepositoryDb } from "../src/artifact-repository/prisma-artifact-repository.js";
import type { PrismaEvalResultRepositoryDb } from "../src/eval-result-repository/prisma-eval-result-repository.js";
import type { PrismaFlowRepositoryDb } from "../src/flow-repository/prisma-flow-repository.js";
import type { PrismaRunQueryDb } from "../src/run-query/prisma-run-query.js";
import type { PrismaRunRepositoryDb } from "../src/run-repository/prisma-run-repository.js";
import type { PrismaRunStepProjectionRepositoryDb } from "../src/run-step-projection-repository/prisma-run-step-projection-repository.js";
import type { PrismaSimRepositoryDb } from "../src/sim-repository/prisma-sim-repository.js";

/**
 * The constraint is the assertion: `Client extends Seam` fails to compile when
 * the client does not satisfy the seam.
 */
type Satisfies<Seam, Client extends Seam> = Client;

type _Artifact = Satisfies<PrismaArtifactRepositoryDb, PostgresClient>;
type _EvalResult = Satisfies<PrismaEvalResultRepositoryDb, PostgresClient>;
type _Flow = Satisfies<PrismaFlowRepositoryDb, PostgresClient>;
type _RunQuery = Satisfies<PrismaRunQueryDb, PostgresClient>;
type _Run = Satisfies<PrismaRunRepositoryDb, PostgresClient>;
type _RunStepProjection = Satisfies<
  PrismaRunStepProjectionRepositoryDb,
  PostgresClient
>;
type _Sim = Satisfies<PrismaSimRepositoryDb, PostgresClient>;
