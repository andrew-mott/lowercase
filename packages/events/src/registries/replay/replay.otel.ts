import type { ReplayOtelAttributesMap } from "@lcase/types";

export const replayOtelAttributesMap = {
  "replay.mode.submitted": {
    action: "submitted",
    domain: "replay",
    entity: "mode",
  },
} satisfies ReplayOtelAttributesMap;
