import type { JsonValue, Path } from "@lcase/types";

/**
 * Uses a path from a reference and resolves the path to a value
 * from a supplied data object.
 * @param path path to the value in state
 * @param object object with holds the value in the path
 * @returns unknown (whatever value it finds)
 */
export function resolvePath(
  path: Path,
  object: Record<string, unknown>,
): unknown {
  let current: unknown = object;
  for (const token of path) {
    if (typeof token === "number" && Array.isArray(current)) {
      current = (current as unknown[])[token as number];
    } else if (
      typeof token === "string" &&
      typeof current === "object" &&
      current !== null
    ) {
      current = (current as Record<string, unknown>)[token];
    } else return;
  }
  return current;
}

export function resolveJsonPath(path: Path, json: JsonValue) {
  let current: unknown = json;
  for (const token of path) {
    if (typeof token === "number" && Array.isArray(current)) {
      current = (current as unknown[])[token as number];
    } else if (
      typeof token === "string" &&
      typeof current === "object" &&
      current !== null
    ) {
      current = (current as Record<string, unknown>)[token];
    } else return;
  }
  return current;
}
