import { vi } from "vitest";
import type {
  PermitGrant,
  PermitRequest,
  ResourcePermitPort,
} from "../../src/ports/outbound/resource-permit.port.js";

// Auto-grants immediately with an incrementing grantId -- for the tests
// that don't care about the permit-acquire wait itself (success, expected
// failure, thrown invariant failure, guaranteed release).
export function createFakePermitPort() {
  let counter = 0;
  const acquire = vi.fn(
    async (request: PermitRequest): Promise<PermitGrant> => {
      counter += 1;
      return { grantId: `grant-${counter}`, resourceKey: request.resourceKey };
    },
  );
  const release = vi.fn(async (_grantId: string) => {});
  const port: ResourcePermitPort = { acquire, release };
  return { port, acquire, release };
}

// Never auto-resolves `acquire` -- simulates waiting for capacity. Rejects
// only when the caller's own AbortSignal fires, so the cancellation test can
// abort mid-wait. No canonical AbortError convention exists in this repo
// yet, so this just rejects with a plain Error; Worker classifies purely
// by signal state, not error identity.
export function createControllablePermitPort() {
  const acquire = vi.fn(
    (
      _request: PermitRequest,
      options?: { signal?: AbortSignal },
    ): Promise<PermitGrant> => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    },
  );
  const release = vi.fn(async (_grantId: string) => {});
  const port: ResourcePermitPort = { acquire, release };
  return { port, acquire, release };
}
