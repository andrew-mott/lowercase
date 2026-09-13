/**
 * Generic Message router hosting: the two carriers, the delivery lane behind
 * both of them, and the host-plan checks they share.
 *
 * Named for what it hosts rather than for messaging in general, because
 * neither Message *types* nor topology declarations are here. The envelope
 * lives in `@lcase/types`, the topic, subscription, publisher and handler
 * contracts live in `@lcase/ports`, and protocol declarations, deployment
 * manifests, and host plans live in `@lcase/message-topology`. What is here is
 * the delivery mechanism.
 *
 * It imports those packages for types only, so its production dependency
 * closure is empty. That is deliberate: a process hosting one component must be
 * able to install a carrier without installing Engine, Worker, application
 * services, Observability, or any concrete adapter.
 *
 * The log-backed carrier names `MessageLogPort` and never a Redis client. A
 * profile hands it a factory that opens whatever connection it wants, which is
 * what keeps this package free of a `redis` dependency.
 */
export * from "./delivery.types.js";
export * from "./message-router.js";
export * from "./in-process/in-process-message-router.js";
export * from "./redis/redis-message-router.js";
