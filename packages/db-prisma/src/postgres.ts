// Where this provider's database lives when nothing says otherwise. Same shape
// as ./sqlite.ts's defaultSqliteUrl, and for the same reason: the Prisma CLI and
// a running app have to name the same server.
export {
  defaultPostgresShadowUrl,
  defaultPostgresUrl,
} from "./postgres-url.js";

// exported for type definitions
export * from "./generated/postgres/client.js";
export * from "./generated/postgres/commonInputTypes.js";
export * from "./generated/postgres/enums.js";
export * from "./generated/postgres/models.js";
