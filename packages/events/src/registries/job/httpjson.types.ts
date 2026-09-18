import type { JobHttpJsonEventType } from "@lcase/types";

export const httpjsonEventTypes = [
  "job.httpjson.completed",
  "job.httpjson.delayed",
  "job.httpjson.resumed",
  "job.httpjson.failed",
  "job.httpjson.queued",
  "job.httpjson.started",
  "job.httpjson.submitted",
] as const satisfies JobHttpJsonEventType[];

type MissingHttpJsonTypes = Exclude<
  JobHttpJsonEventType,
  (typeof httpjsonEventTypes)[number]
>;
type _ListsAllHttpJsonTypes = MissingHttpJsonTypes extends never ? true : never;
const _checkEventTypes: _ListsAllHttpJsonTypes = true;
