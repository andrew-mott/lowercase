import type { ManagedRuntime } from "@lcase/assembly";
import { buildServer, type HttpSystem } from "./build-server.js";
import { healthRoute } from "./routes/health.js";

export type HostSystem = HttpSystem & {
  runtime: ManagedRuntime;
};

/**
 * Runs a composed system as an HTTP process: start, serve, stop on a signal.
 *
 * Every host here does this identically, and the Worker host does the same
 * thing without the serving, which is why the sequence is worth stating once.
 * What each host decides is what it composed; how a process reports a failed
 * start and how it shuts down are not host-specific and were previously
 * duplicated by being inside `buildServer`, where a web framework had no
 * business owning them.
 *
 * `runtime.start()` reports rather than throws, and the outcome has to be
 * checked. Ignoring it is what let this process bind a port while holding no
 * database connection -- observed, not hypothetical: an artifact run outside
 * the workspace logged `{ ok: false, failedResourceId: 'sql' }` and then served
 * 500s to every request. Resources that did start were rolled back before the
 * outcome was returned, so there is nothing left running to clean up; the only
 * correct move is to say which resource failed and exit non-zero.
 */
export async function serveHost(
  name: string,
  system: HostSystem,
): Promise<void> {
  const started = await system.runtime.start();
  if (!started.ok) {
    console.error(
      `[${name}] failed to start: resource '${started.failedResourceId}': ${started.error}`,
    );
    if (!started.rollback.ok) {
      console.error(`[${name}] rollback also failed:`, started.rollback.errors);
    }
    process.exit(1);
  }

  const server = await buildServer(system);
  // Registered here rather than in `buildServer`, which deliberately has no
  // runtime. Serving at all already implies a successful start, since the port
  // only opens once `runtime.start()` has succeeded.
  await server.register(healthRoute, {
    health: () => system.runtime.health(),
  });

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const host = process.env.HOST || "127.0.0.1";
  try {
    await server.listen({ port, host });
  } catch (error) {
    // The runtime is up at this point, so stopping it is this branch's job --
    // exiting straight out would leave consumer groups registered and a SQL
    // connection open until the socket died on its own.
    console.error(`[${name}] failed to listen on ${host}:${port}:`, error);
    await system.runtime.stop();
    process.exit(1);
  }
  console.log(`[${name}] listening on ${host}:${port}`);

  let stopping = false;

  /**
   * Ends intake and closes connections, in that order.
   *
   * The HTTP server closes first so nothing new arrives, then the runtime stops
   * its resources in reverse start order -- the router before the components
   * that handle what it delivers, and the SQL client last, so the projections a
   * claimed Message produces are still able to write.
   *
   * Not a drain. Nothing reclaims entries another consumer holds, and nothing
   * waits on work that has not been read yet.
   */
  async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;

    console.log(`[${name}] ${signal} received, stopping`);
    await server.close();
    const stopped = await system.runtime.stop();
    if (!stopped.ok) {
      console.error(`[${name}] stop reported errors:`, stopped.errors);
      process.exitCode = 1;
    }
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
