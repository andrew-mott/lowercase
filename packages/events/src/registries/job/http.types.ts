import type { JobHttpEventType } from "@lcase/types";

export const httpEventTypes = [
  "job.http.submitted",
  "job.http.completed",
  "job.http.failed",
] as const satisfies JobHttpEventType[];

type MissingHttpTypes = Exclude<
  JobHttpEventType,
  (typeof httpEventTypes)[number]
>;
type _ListsAllHttpTypes = MissingHttpTypes extends never ? true : never;
const _checkEventTypes: _ListsAllHttpTypes = true;
