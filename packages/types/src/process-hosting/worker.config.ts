// Worker's user-facing knobs, distinct from `@lcase/worker`'s own
// `WorkerConfig`: that one is what the constructor takes, and a profile's
// builder translates this into it.
export type WorkerUserConfig = {
  maxConcurrentJobs: number;
  protocolTimeoutMs: number;
  // The local resource-permit adapter's own per-key concurrency limit.
  maxConcurrencyPerKey: number;
};
