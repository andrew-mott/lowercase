import { describe, expect, it } from "vitest";
import type { ArtifactStorePort } from "@lcase/ports";

// Behavioral contract shared by every ArtifactStorePort implementation --
// FsArtifactStore and S3ArtifactStore both run this suite so the two stay
// verifiably consistent rather than drifting apart silently. Deliberately
// covers only what's common across backends: implementation-specific
// behavior (FS's sharded path shape, legacy-format fallback) stays in each
// adapter's own dedicated test files.
export function runArtifactStoreContractTests(
  name: string,
  makeStore: () => Promise<ArtifactStorePort> | ArtifactStorePort,
): void {
  describe(`ArtifactStorePort contract (${name})`, () => {
    it("round-trips bytes and contentType by hash", async () => {
      const store = await makeStore();
      const hash =
        "contracthash1111111111111111111111111111111111111111111111111";
      const bytes = new TextEncoder().encode(
        JSON.stringify({ hello: "world" }),
      );

      const putResult = await store.putBytes(hash, bytes, "application/json");
      expect(putResult.ok).toBe(true);

      const getResult = await store.getBytes(hash);
      expect(getResult.ok).toBe(true);
      if (!getResult.ok) throw new Error("expected ok result");
      expect(new TextDecoder().decode(getResult.value.bytes)).toBe(
        JSON.stringify({ hello: "world" }),
      );
      expect(getResult.value.contentType).toBe("application/json");
    });

    it("returns NOT_FOUND for a hash that was never written", async () => {
      const store = await makeStore();
      const result = await store.getBytes(
        "contractmissing22222222222222222222222222222222222222222222222",
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failed result");
      expect(result.error.code).toBe("NOT_FOUND");
    });

    it("putBytes is idempotent for the same hash", async () => {
      const store = await makeStore();
      const hash =
        "contractidempotent333333333333333333333333333333333333333333333";
      const bytes = new TextEncoder().encode("hello");

      const first = await store.putBytes(hash, bytes, "text/plain");
      const second = await store.putBytes(hash, bytes, "text/plain");
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      const getResult = await store.getBytes(hash);
      expect(getResult.ok).toBe(true);
      if (!getResult.ok) throw new Error("expected ok result");
      expect(getResult.value.contentType).toBe("text/plain");
      expect(new TextDecoder().decode(getResult.value.bytes)).toBe("hello");
    });
  });
}
