import type { ManagedResource } from "./managed-resource.js";

export type StopOutcome = {
  ok: boolean;
  errors: readonly { resourceId: string; error: string }[];
};

export type StartOutcome =
  | { ok: true }
  | {
      ok: false;
      failedResourceId: string;
      error: string;
      rollback: StopOutcome;
    };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Stops resources in reverse order, best-effort: one stop() throwing does
// not prevent the rest from being attempted. Collects every error.
export async function stopAll(
  resources: readonly ManagedResource<unknown>[],
): Promise<StopOutcome> {
  const errors: { resourceId: string; error: string }[] = [];
  for (let i = resources.length - 1; i >= 0; i--) {
    const resource = resources[i];
    try {
      await resource.stop();
    } catch (err) {
      errors.push({ resourceId: resource.id, error: errorMessage(err) });
    }
  }
  return { ok: errors.length === 0, errors };
}

// Starts resources strictly in the given order. On failure, stops every
// already-started resource in reverse order (best-effort: a rollback
// stop() throwing does not abort the rest of the rollback) and reports
// both the original failure and any rollback failures.
export async function startAll(
  resources: readonly ManagedResource<unknown>[],
): Promise<StartOutcome> {
  const started: ManagedResource<unknown>[] = [];
  for (const resource of resources) {
    try {
      await resource.start();
      started.push(resource);
    } catch (err) {
      const rollback = await stopAll(started);
      return {
        ok: false,
        failedResourceId: resource.id,
        error: errorMessage(err),
        rollback,
      };
    }
  }
  return { ok: true };
}
