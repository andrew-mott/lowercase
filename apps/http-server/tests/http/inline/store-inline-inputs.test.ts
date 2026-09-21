import { describe, expect, it, vi } from "vitest";
import type { InlinePart } from "../../../src/http/routes/runs/inline/inline-part.js";
import { storeInlineInputs } from "../../../src/http/routes/runs/inline/store-inline-inputs.js";

const part = (name: string, contentType: string, body: string): InlinePart => ({
  name,
  contentType,
  buffer: Buffer.from(body),
});

const stored = (hash: string) => ({ ok: true, value: { hash } });

describe("storeInlineInputs", () => {
  it("returns each input's hash under its part name", async () => {
    const storeInputArtifact = vi
      .fn()
      .mockResolvedValueOnce(stored("hash-a"))
      .mockResolvedValueOnce(stored("hash-b"));

    const result = await storeInlineInputs({ storeInputArtifact } as never, [
      part("audio", "audio/webm", "x"),
      part("options", "application/json", '{"a":1}'),
    ]);

    expect(result).toEqual({
      ok: true,
      params: { audio: "hash-a", options: "hash-b" },
    });
    expect(storeInputArtifact).toHaveBeenCalledTimes(2);
  });

  it("stops at an invalid part without storing the ones after it", async () => {
    const storeInputArtifact = vi.fn().mockResolvedValue(stored("hash-a"));

    const result = await storeInlineInputs({ storeInputArtifact } as never, [
      part("options", "application/json", "{nope"),
      part("audio", "audio/webm", "x"),
    ]);

    expect(result).toEqual({
      ok: false,
      kind: "invalid",
      error: 'Part "options" is not valid JSON',
    });
    expect(storeInputArtifact).not.toHaveBeenCalled();
  });

  it("reports a failed write as a storage error naming the part", async () => {
    const storeInputArtifact = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "disk full" });

    const result = await storeInlineInputs({ storeInputArtifact } as never, [
      part("audio", "audio/webm", "x"),
    ]);

    expect(result).toEqual({
      ok: false,
      kind: "storage",
      error: 'Unable to store part "audio": disk full',
    });
  });
});
