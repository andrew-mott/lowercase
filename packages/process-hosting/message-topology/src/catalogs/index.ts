/**
 * Every conversation this product declares, one module per protocol family.
 *
 * Separate from the package's main entry point so the generic topology layer
 * stays free of product identities: a router validates a topology without
 * importing job topics.
 *
 * Organized by family rather than by kind, mirroring
 * `packages/types/src/events/`, so adding an event type touches one folder on
 * each side. A `commands/` module holding run, job, and replay commands
 * together would instead force a host that only takes part in jobs to import
 * all of them. Whether commands, lifecycle, and telemetry travel on shared
 * physical streams is a routing question, answered by route IDs in a
 * deployment, not by how these files are arranged.
 *
 * Only `job` is here so far. The others are still on `EventBusPort`, and each
 * migrates as its own protocol slice. Catalogs are closed under union, so they
 * merge rather than replace.
 */
export * from "./job.catalog.js";
