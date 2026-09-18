import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

export type WorkbenchRouteOptions = {
  /** A directory holding the workbench's `vite build` output. */
  root: string;
};

// Everything the API answers on. A request under one of these is the API's,
// whether or not a route matches it, so an unknown path here stays a 404 the
// caller can read rather than a page.
const API_ROOTS = ["/api", "/events", "/health"];

const isApiPath = (url: string): boolean => {
  // Compared without the query string, and each root owns itself and everything
  // under it. A path that merely starts with the same letters -- `/evaluations`
  // against `/events` -- belongs to the client router, which is why this is not
  // a bare `startsWith`.
  const pathname = url.split("?")[0]!;
  return API_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
};

/**
 * Serves the built workbench, so a deployment is one address with no separate
 * frontend to run.
 *
 * The build is served as it was produced: `index.html` references its chunks by
 * absolute `/assets/...` paths, which is why this serves from the root rather
 * than under a prefix, and hashed filenames mean nothing here has to know what
 * the frontend built.
 *
 * Client-side routes are paths this server has no route for, so the not-found
 * handler answers them with `index.html` and lets the browser's router take it
 * from there. It refuses to guess for anything the API owns, and for anything
 * that is not a GET, because a page is not an answer to those.
 */
export const workbenchRoute = async (
  app: FastifyInstance,
  { root }: WorkbenchRouteOptions,
) => {
  const index = path.join(root, "index.html");
  if (!existsSync(index)) {
    throw new Error(
      `[workbench-route] no index.html in '${root}'; build it with \`pnpm -F @lcase/workbench build\``,
    );
  }

  await app.register(fastifyStatic, { root });

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== "GET" || isApiPath(request.url)) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `Route ${request.method}:${request.url} not found`,
      });
    }
    return reply.sendFile("index.html");
  });
};
