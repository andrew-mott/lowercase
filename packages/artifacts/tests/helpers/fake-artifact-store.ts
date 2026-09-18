import type { ArtifactStorePort, ArtifactStorePutResult } from "@lcase/ports";

// A genuine in-memory ArtifactStorePort -- implements the real interface
// rather than casting a partial object, matching this codebase's newer
// no-`as unknown as X` bar (see
// packages/components/worker/tests/helpers/fake-artifacts.ts).
export function createFakeArtifactStorePort() {
  const data = new Map<string, { bytes: Uint8Array; contentType: string }>();

  const store: ArtifactStorePort = {
    putBytes(hash, bytes, contentType): Promise<ArtifactStorePutResult> {
      data.set(hash, { bytes, contentType });
      return Promise.resolve({ ok: true, path: `fake://${hash}` });
    },
    getBytes(hash) {
      const entry = data.get(hash);
      if (!entry) {
        return Promise.resolve({
          ok: false as const,
          error: {
            code: "NOT_FOUND" as const,
            message: `No artifact found for hash "${hash}"`,
          },
        });
      }
      return Promise.resolve({ ok: true as const, value: { ...entry } });
    },
  };

  return { store, data };
}
