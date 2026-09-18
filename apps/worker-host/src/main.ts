import { config } from "./runtime.config.js";
import { createWorkerHost } from "./profile/worker-host.profile.js";

const { runtime } = createWorkerHost(config);

const started = await runtime.start();
if (!started.ok) {
  // `start()` reports rather than throws, and a process that ignored this would
  // sit connected to nothing, consuming no Messages and saying so to no one.
  // Resources that had already started were rolled back before this returned.
  console.error(
    `[worker-host] failed to start: resource '${started.failedResourceId}': ${started.error}`,
  );
  if (!started.rollback.ok) {
    console.error(
      "[worker-host] rollback also failed:",
      started.rollback.errors,
    );
  }
  process.exitCode = 1;
} else {
  console.log("[worker-host] started; consuming worker.job-command.v1");
}

let stopping = false;

/**
 * Ends intake and closes connections. This is not a drain: nothing reclaims
 * entries already claimed by another consumer, and nothing waits on work that
 * has not been read yet.
 *
 * What it does do is bounded and worth having. The router stops reading, then
 * awaits its read loops -- a blocking read returns within one `blockMs` -- so a
 * batch already claimed is worked through and its terminals published before the
 * publisher connection closes. SQL disconnects after the router, so those
 * writes still land.
 */
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;

  console.log(`[worker-host] ${signal} received, stopping`);
  const stopped = await runtime.stop();
  if (!stopped.ok) {
    console.error("[worker-host] stop reported errors:", stopped.errors);
    process.exitCode = 1;
  }
}

// Nothing else holds the event loop open: the read loops' Redis connections are
// what keep this process alive, and closing them is what lets it exit.
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
