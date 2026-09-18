const DEFAULT_TRUNCATE_AT = 240;

/** Stringifies a resolved value for display — strings pass through as-is,
 * everything else (JSON values, objects) gets pretty-printed. */
export function stringifyForPreview(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** Truncates already-stringified display text with a trailing ellipsis marker. */
export function truncateForPreview(
  text: string,
  maxLength = DEFAULT_TRUNCATE_AT,
): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
