import type { Path } from "@lcase/types";
/**
 * Generic function to traverse through objects/array structures,
 * then process a primitive value with a callback.
 * @param value unknown data structure
 */
type HandleValue = (value: unknown, path: Path) => void;

export function traverse(
  value: unknown,
  handleValue: HandleValue,
  path: Path = [],
) {
  if (!isTraversable(value)) {
    handleValue(value, path);
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], handleValue, path.concat(i));
    }
  } else {
    for (const [key, val] of Object.entries(value)) {
      traverse(val, handleValue, path.concat(key));
    }
  }
}

/**
 * Simple type narrowing check to see if value is not an array, object, or
 * null, as null is also an object, but not traversable.
 * @param value unknown
 * @returns boolean
 */
export function isTraversable(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}
