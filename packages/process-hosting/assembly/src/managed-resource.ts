export type HealthStatus =
  { status: "healthy" } | { status: "unhealthy"; reason: string };

export type ManagedResource<T> = {
  readonly id: string;
  readonly instance: T;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<HealthStatus>;
};

export type LifecycleHooks<T> = {
  start?: (instance: T) => void | Promise<void>;
  stop?: (instance: T) => void | Promise<void>;
  health?: (instance: T) => HealthStatus | Promise<HealthStatus>;
};

// Normalizes heterogeneous lifecycle shapes (sync start/stop, missing
// start entirely, missing everything) into one uniform async surface --
// without requiring any change to the wrapped class. This is how
// InMemoryEventBus (only close()) and ObservabilityTap (sync start/stop)
// both become ManagedResource<T> with zero edits to those classes.
export function managedResource<T>(
  id: string,
  instance: T,
  hooks: LifecycleHooks<T> = {},
): ManagedResource<T> {
  return {
    id,
    instance,
    start: async () => {
      await hooks.start?.(instance);
    },
    stop: async () => {
      await hooks.stop?.(instance);
    },
    health: async () =>
      (await hooks.health?.(instance)) ?? { status: "healthy" },
  };
}

// Separates "construct a client from config" (possibly async: connect,
// authenticate) from proving it's ready and tearing it down, which stay on
// the resulting ManagedResource. No concrete provider is implemented yet --
// this is the shape a later real infra provider (S3 client, Postgres pool)
// will satisfy.
export type Provider<C, T> = {
  readonly kind: string;
  build(config: C): Promise<T>;
};
