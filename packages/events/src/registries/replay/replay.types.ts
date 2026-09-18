import type { ReplayEventType } from "@lcase/types";

export const replayEventTypes = [
  "replay.mode.submitted",
] as const satisfies ReplayEventType[];

type MissingReplayTypes = Exclude<
  ReplayEventType,
  (typeof replayEventTypes)[number]
>;
type _ListsAllReplayTypes = MissingReplayTypes extends never ? true : never;
const _checkEventTypes: _ListsAllReplayTypes = true;
