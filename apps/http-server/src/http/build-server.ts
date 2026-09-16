import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { ServicesPort, ObservabilityTapPort } from "@lcase/ports";
import { routes } from "./routes/routes.js";
import { eventsRoute } from "./routes/events-route.js";

/**
 * What the HTTP layer needs from whichever profile composed the process.
 *
 * Declared here rather than imported from a profile so that more than one can
 * satisfy it: a host that composes the full embedded graph and one that
 * composes only part of it both arrive here as the same two things. Nothing
 * about serving HTTP depends on which profile produced them.
 *
 * No runtime, deliberately. Starting and stopping the process's resources is
 * the host's business, not the web framework's -- see `serveHost`.
 */
export type HttpSystem = {
  services: ServicesPort;
  tap: ObservabilityTapPort;
};

export async function buildServer({
  services,
  tap,
}: HttpSystem): Promise<FastifyInstance> {
  const app = Fastify();
  // NOTE:  order matters when registering plugins

  app.decorate("services", services);
  app.decorate("tap", tap);

  await app.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  await app.register(multipart, { limits: { fileSize: 1000 * 1024 * 1024 } });

  await app.register(routes);
  await app.register(eventsRoute);

  return app;
}
