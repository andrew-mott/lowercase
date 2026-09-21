import type { ArtifactServicePort } from "@lcase/ports";
import { makeInlinePutInput, type InlinePart } from "./inline-part.js";

export type StoredInlineInputs =
  | { ok: true; params: Record<string, string> }
  // `invalid` is the caller's part, `storage` is ours.
  | { ok: false; kind: "invalid" | "storage"; error: string };

/**
 * Stores each input as an artifact and returns the param map a run request
 * takes: param name to artifact hash. Stops at the first failure.
 */
export async function storeInlineInputs(
  artifacts: Pick<ArtifactServicePort, "storeInputArtifact">,
  inputs: InlinePart[],
): Promise<StoredInlineInputs> {
  const params: Record<string, string> = {};

  for (const input of inputs) {
    const putInput = makeInlinePutInput(input);
    if (!putInput.ok) {
      return { ok: false, kind: "invalid", error: putInput.error };
    }

    const stored = await artifacts.storeInputArtifact(putInput.value);
    if (!stored.ok) {
      return {
        ok: false,
        kind: "storage",
        error: `Unable to store part "${input.name}": ${stored.error}`,
      };
    }
    params[input.name] = stored.value.hash;
  }

  return { ok: true, params };
}
