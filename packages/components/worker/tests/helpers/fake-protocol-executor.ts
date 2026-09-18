import { vi } from "vitest";
import type {
  ProtocolExecutor,
  ProtocolResult,
  ResolvedProtocolRequest,
} from "../../src/protocol/protocol-executor.types.js";

// Genuinely respects `signal`, matching the real contract every
// ProtocolExecutor implementation must honor -- races `resultFn`'s outcome
// against the signal firing, rather than ignoring it. A fake that ignored
// cancellation would silently defeat any test exercising timeout/abort
// behavior further up the stack.
export function createFakeProtocolExecutor(
  resultFn: (
    request: ResolvedProtocolRequest,
  ) => ProtocolResult | Promise<ProtocolResult>,
) {
  const execute = vi.fn(
    (
      request: ResolvedProtocolRequest,
      options?: { signal?: AbortSignal },
    ): Promise<ProtocolResult> => {
      const signal = options?.signal;
      if (signal?.aborted) {
        return Promise.reject(new Error("aborted"));
      }
      return new Promise<ProtocolResult>((resolve, reject) => {
        const onAbort = () => reject(new Error("aborted"));
        signal?.addEventListener("abort", onAbort, { once: true });
        Promise.resolve(resultFn(request)).then(
          (result) => {
            signal?.removeEventListener("abort", onAbort);
            resolve(result);
          },
          (err: unknown) => {
            signal?.removeEventListener("abort", onAbort);
            reject(err);
          },
        );
      });
    },
  );
  const executor: ProtocolExecutor = { execute };
  return { executor, execute };
}
