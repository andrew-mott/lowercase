/**
 * Static messaging topology: how a product declares conversations, how one
 * deployment enables and routes them, and what one process role is responsible
 * for.
 *
 * Nothing here hosts anything. There is no router, no carrier, no connection,
 * and no lifecycle -- a deployment is described here and run by
 * `@lcase/message-router`. It sits beside that package because declaring a
 * topology and hosting one are the same general mechanism, not because this
 * package runs in a process of its own.
 *
 * It imports `@lcase/ports` and `@lcase/types` for types only, so its
 * production dependency closure is empty. That is deliberate and worth
 * protecting: every cooperating process reads a manifest, so anything added
 * here is installed by all of them.
 *
 * This entry point is the generic layer and holds no product identity at all.
 * The conversations are `@lcase/message-topology/catalogs` and the supported
 * deployments are `@lcase/message-topology/deployments`, so that a generic
 * router can validate a topology without importing topics it has no business
 * knowing, and so that a host does not pull in protocol modules for
 * conversations it takes no part in.
 *
 * Those two are siblings rather than nested, because a deployment is of the
 * whole system while a catalog is one protocol family. `local-system` enables
 * only job identities today purely because that is the only migrated
 * conversation.
 *
 * The scope is messaging, which is why the deployment types carry a
 * `Messaging` prefix. SQL, object storage, secrets, and process launch are not
 * described here, and the unqualified names are left for a broader deployment
 * layer if one ever arrives.
 */
export * from "./define-topic.js";
export * from "./catalog.js";
export * from "./manifest.js";
export * from "./assert-manifest.js";
export * from "./host-plan.js";
export * from "./resolve-host-plan.js";
