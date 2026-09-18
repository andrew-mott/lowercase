import type { ServicesPort, ObservabilityTapPort } from "@lcase/ports";
import "fastify";

/**
 * augment fastify instance so that services types show up everywhere
 */
declare module "fastify" {
  interface FastifyInstance {
    services: ServicesPort;
    tap: ObservabilityTapPort;
  }
}
