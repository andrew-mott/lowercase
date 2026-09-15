// What a user configures to compose a process, one module per axis. Some axes
// select a backend, others only tune one. TypeScript only today; these are the
// shapes a JSON or YAML config file would take once a user edits one directly.
//
// Not the arguments a component's constructor takes -- a profile's builder
// translates between the two.
//
// An axis that selects a backend states every backend there is, and is identical
// wherever it is selected; a process profile narrows the union to the ones it
// supports rather than restating an arm.

export * from "./artifact-store.config.js";
export * from "./messaging.config.js";
export * from "./sql.config.js";
export * from "./worker.config.js";
