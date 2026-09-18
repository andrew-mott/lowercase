/**
 * The `local-system` process profile: the complete embedded object graph, its
 * supported concrete providers, and the assembler that orders their lifecycle.
 *
 * This is one profile whose process happens to host almost the whole system,
 * not the definition of a runtime. It is a shared package rather than app-local
 * because two executables build this same graph -- the HTTP server and the CLI.
 * See ADR-0008.
 *
 * The job protocol declarations used to live here, because this profile was
 * their only honest owner. They are now `@lcase/message-topology/catalogs`, and
 * this barrel deliberately does not re-export them: a second process host
 * consumes that package directly rather than through the embedded profile.
 */
export * from "./config/index.js";
export * from "./assemble-embedded-system.js";
export * from "./local-system.profile.js";
export * from "./build-artifact-store.js";
