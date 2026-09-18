export function isHash(hash: unknown): hash is string {
  if (typeof hash !== "string") return false;
  const regex = /^[a-zA-Z0-9]+$/;
  const match = hash.match(regex);
  if (!match) return false;
  return true;
}
