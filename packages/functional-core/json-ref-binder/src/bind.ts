import type { Ref, StepDefinition } from "@lcase/types";
import util from "util";

/**
 * Walk through all references, look up their resolved values, and replace
 * those values with a materialized view of a step definition
 */
export function bindStepRefs<T extends StepDefinition>(
  refs: Ref[],
  resolved: Record<string, unknown>,
  step: T,
): T {
  if (!refs.length) return step;

  const clone = structuredClone(step);
  for (const ref of refs) {
    if (resolved[ref.string] === undefined) continue;
    bindReference(ref, clone, resolved[ref.string]);
  }
  return clone;
}

/**
 * Given a reference, step definition, and value to assign, traverse the
 * step definition to mutate the value, either by assigning or interpolation
 * as a string.
 */
export function bindReference(
  ref: Ref,
  bindData: Record<string, unknown> | unknown[],
  value: unknown,
) {
  if (!ref.bindPath.length) return;

  let current: unknown = bindData;
  let parent: unknown = bindData;

  // loop through all but last entries in path, because its not necessary to
  // resolve to a value at this point, only when assigning below.
  // when length is one, break because the parent is only used at the root level
  for (const [index, token] of ref.bindPath.entries()) {
    parent = current;
    if (index === ref.bindPath.length - 1) break;

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

  const lastToken = ref.bindPath[ref.bindPath.length - 1];

  if (
    typeof lastToken === "string" &&
    typeof parent === "object" &&
    parent !== null
  ) {
    const lt = lastToken as string;
    const p = parent as Record<string, unknown>;

    p[lt] = interpolateRef(p[lt], value, ref);
  } else if (typeof lastToken === "number" && Array.isArray(parent)) {
    const lt = lastToken as number;
    const p = parent as unknown[];

    p[lt] = interpolateRef(p[lt], value, ref);
  }
}

/**
 * If this reference should be interpolated, and the field itself is a string,
 * then replaceAll with a match.  Otherwise, return just the value.
 * @param field Field to possibly replace strings with values
 * @param value Value to interpolate or return
 * @param ref The reference being interpolated
 * @returns unknown value
 */
export function interpolateRef(field: unknown, value: unknown, ref: Ref) {
  console.log("called interpolate:", ref.string);
  if (ref.interpolated && typeof field === "string") {
    const stringified =
      typeof value === "object" || Array.isArray(value)
        ? util.inspect(value, false, null)
        : String(value);

    return field.replaceAll(`{{${ref.string}}}`, stringified);
  } else return value;
}
