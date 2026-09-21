export function validateFlowHash(hash: unknown) {
  if (typeof hash !== "string") return;
  const regex = /^[a-zA-Z0-9]+$/;
  const match = hash.match(regex);
  if (!match) return;
  return match[0];
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
