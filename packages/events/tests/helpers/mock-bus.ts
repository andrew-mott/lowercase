import { vi } from "vitest";
import type { EventBusPort } from "@lcase/ports";

/**
 * A properly-typed EventBusPort mock -- no `as unknown as EventBusPort` cast needed,
 * since `bus` genuinely implements all three real port methods. Individual mocks are
 * also returned directly for assertions (`expect(publish).toHaveBeenCalledWith(...)`),
 * mirroring how existing tests keep a handle on the mock before wrapping it.
 */
export function createMockBus() {
  const publish = vi.fn(async () => {});
  const subscribe = vi.fn(() => () => undefined);
  const close = vi.fn(async () => undefined);
  const bus: EventBusPort = { publish, subscribe, close };
  return { bus, publish, subscribe, close };
}
