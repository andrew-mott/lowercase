import {
  createSemaphore,
  type Semaphore,
} from "../../concurrency/semaphore.js";
import type {
  PermitGrant,
  PermitRequest,
  ResourcePermitPort,
} from "../../ports/outbound/resource-permit.port.js";

export type LocalResourcePermitConfig = {
  maxConcurrencyPerKey: number;
};

export type ResourcePermitTelemetry = {
  onWaitStart?(request: PermitRequest): void;
  onGranted?(grant: PermitGrant): void;
  onCancelled?(request: PermitRequest): void;
  onReleased?(grantId: string): void;
};

// A real, local, in-process ResourcePermitPort -- one semaphore per
// resourceKey, lazily created. Deliberately not part of WorkerConfig: this is
// a separate adapter the runtime composes independently and hands in via
// WorkerDeps.permits, keeping WorkerConfig scoped to worker's own execution
// parameters only. These permits constrain a resolved external resource;
// WorkerCapacity constrains how many jobs one worker runs at once.
export function createLocalResourcePermit(
  config: LocalResourcePermitConfig,
  telemetry?: ResourcePermitTelemetry,
): ResourcePermitPort {
  const semaphores = new Map<string, Semaphore>();
  const releases = new Map<string, () => void>();
  let counter = 0;

  function semaphoreFor(key: string): Semaphore {
    let sem = semaphores.get(key);
    if (!sem) {
      sem = createSemaphore(config.maxConcurrencyPerKey);
      semaphores.set(key, sem);
    }
    return sem;
  }

  return {
    async acquire(request, options) {
      telemetry?.onWaitStart?.(request);
      const outcome = await semaphoreFor(request.resourceKey).acquire(
        options?.signal,
      );
      if (outcome.kind === "cancelled") {
        telemetry?.onCancelled?.(request);
        // No canonical AbortError convention in this codebase -- Worker
        // classifies purely by signal state, not error identity.
        throw new Error(`resource permit wait cancelled: ${request.requestId}`);
      }

      counter += 1;
      const grant: PermitGrant = {
        grantId: `permit-${counter}`,
        resourceKey: request.resourceKey,
      };
      releases.set(grant.grantId, outcome.release);
      telemetry?.onGranted?.(grant);
      return grant;
    },

    async release(grantId) {
      const mappedRelease = releases.get(grantId);
      if (!mappedRelease) return; // idempotent: unknown/already-released grantId is a no-op
      releases.delete(grantId);
      mappedRelease();
      telemetry?.onReleased?.(grantId);
    },
  };
}
