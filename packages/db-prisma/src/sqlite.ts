// No client instance here any more. A module-global constructed at import time
// is what kept a process from choosing its provider by config at all: importing
// this module was already the choice. Construction moved to
// `buildSqlClient` in @lcase/profile-local-system; only the default location
// stayed behind, because the Prisma CLI and a running app have to agree on it.
export { defaultSqliteUrl } from "./sqlite-url.js";

// exported for type definitions
export * from "./generated/sqlite/client.js";
export * from "./generated/sqlite/commonInputTypes.js";
export * from "./generated/sqlite/enums.js";
export * from "./generated/sqlite/models.js";
