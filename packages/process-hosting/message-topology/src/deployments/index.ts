/**
 * The supported deployments, each naming every role that cooperates in it.
 *
 * A sibling of `catalogs/` rather than living under one, because a deployment
 * is of the whole system. `local-system` enables only job identities today
 * purely because that is the only migrated conversation; when the run and step
 * families move off `EventBusPort` it enables those too, without moving file.
 *
 * Presets only. Nothing here loads a manifest from outside the repo, compiles
 * a placement, or registers a role dynamically.
 */
export * from "./local-system.deployment.js";
export * from "./remote-worker.deployment.js";
