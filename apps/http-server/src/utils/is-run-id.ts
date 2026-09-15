/**
 * Narrows the type if its a valid run id string
 * @param runId unknown
 * @returns
 */
export function isRunId(runId: unknown): runId is string {
  if (typeof runId !== "string") return false;
  const regex = /^run-[a-zA-Z0-9-]+$/;
  const match = runId.match(regex);

  if (!match) return false;
  return true;
}
