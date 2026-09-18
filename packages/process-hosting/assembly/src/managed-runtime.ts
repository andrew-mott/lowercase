import type { HealthStatus, ManagedResource } from "./managed-resource.js";
import {
  startAll,
  stopAll,
  type StartOutcome,
  type StopOutcome,
} from "./lifecycle.js";

export type SystemHealthReport = {
  status: "healthy" | "unhealthy";
  resources: readonly { id: string; health: HealthStatus }[];
};

export type ManagedRuntime = {
  start(): Promise<StartOutcome>;
  stop(): Promise<StopOutcome>;
  health(): Promise<SystemHealthReport>;
};

function assertUniqueIds(resources: readonly ManagedResource<unknown>[]): void {
  const seen = new Set<string>();
  for (const resource of resources) {
    if (seen.has(resource.id)) {
      throw new Error(
        `[runtime] duplicate managed resource id: ${resource.id}`,
      );
    }
    seen.add(resource.id);
  }
}

// Shared by assembleEmbeddedSystem now, and by future role-specific
// assemblers (assembleEngineHost, assembleWorkerHost, ...) later --
// role-specific assemblers differ only in their input type and how they
// build the ordered resource list, not in start/stop/health/rollback
// mechanics.
export function createManagedRuntime(
  resources: readonly ManagedResource<unknown>[],
): ManagedRuntime {
  assertUniqueIds(resources);
  let running = false;

  return {
    async start(): Promise<StartOutcome> {
      if (running) {
        return {
          ok: false,
          failedResourceId: "",
          error: "already running",
          rollback: { ok: true, errors: [] },
        };
      }
      const outcome = await startAll(resources);
      running = outcome.ok;
      return outcome;
    },
    async stop(): Promise<StopOutcome> {
      const outcome = await stopAll(resources);
      running = false;
      return outcome;
    },
    async health(): Promise<SystemHealthReport> {
      const results = await Promise.all(
        resources.map(async (resource) => ({
          id: resource.id,
          health: await resource.health(),
        })),
      );
      const status = results.every((r) => r.health.status === "healthy")
        ? "healthy"
        : "unhealthy";
      return { status, resources: results };
    },
  };
}
