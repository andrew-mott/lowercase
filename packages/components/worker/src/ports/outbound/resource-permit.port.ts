export type PermitRequest = {
  requestId: string;
  // Derived by a ResourceKeyResolver (see resource-key-resolver.ts), not
  // supplied directly by the caller -- the canonical key may only be
  // knowable after reference resolution (e.g. a templated URL).
  resourceKey: string;
  concurrencyCost?: number;
  rateCost?: number;
};

export type PermitGrant = {
  grantId: string;
  resourceKey: string;
};

export interface ResourcePermitPort {
  acquire(
    request: PermitRequest,
    options?: { signal?: AbortSignal },
  ): Promise<PermitGrant>;

  release(grantId: string): Promise<void>;
}
