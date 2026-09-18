import type { PrismaClient as SqliteClient } from "./generated/sqlite/client.js";

/**
 * `Pick` of method names rather than `Omit` of the two known-unportable ones
 * (`aggregate`, `groupBy`), which reads like it would state the rule better but
 * does not compile. A delegate also carries a `types.operations` metadata
 * property describing every argument shape, and those sit in covariant positions
 * that recurse into provider-specific `WhereInput` types -- so contravariance
 * does not rescue them. `Omit` keeps that property; picking method names drops
 * it. Every method below is in the spike's verified-portable set.
 */
type PortableDelegate<T> = Pick<
  T,
  Extract<
    | "count"
    | "create"
    | "createMany"
    | "delete"
    | "deleteMany"
    | "findFirst"
    | "findMany"
    | "findUnique"
    | "update"
    | "upsert",
    keyof T
  >
>;

type ModelName =
  | "artifact"
  | "artifactParamCuration"
  | "evalResult"
  | "flow"
  | "flowVersion"
  | "run"
  | "runParam"
  | "runStepExport"
  | "runStepProjection"
  | "sim";

/**
 * A client either provider can supply.
 *
 * `SqlClient` is the seam a repository states as a *parameter*: each one narrows
 * it to the handful of methods that repository calls. This is the other side --
 * what composition *provides*, one value that satisfies all of those seams at
 * once. Both are derived from the SQLite client, so their members are identical
 * rather than merely compatible.
 *
 * Typed against SQLite because that is the narrower of the two, which is what
 * makes the Postgres client satisfy it. See
 * `docs/initiatives/swappable-infrastructure/research/prisma-provider-type-seam-spike.md`.
 *
 * The assignment at each construction site is the parity check, so there is no
 * separate assertion: `@lcase/profile-local-system`'s `buildSqlClient` and
 * `packages/test-support`'s `createPostgresTestDb` both assign a concrete client
 * to this type with no cast, and either compile or do not.
 */
export type PortableSqlClient = {
  [M in ModelName]: PortableDelegate<SqliteClient[M]>;
} & {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};
