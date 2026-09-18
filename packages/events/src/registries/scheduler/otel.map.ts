import type { SchedulerOtelAttributesMap } from "@lcase/types";

export const schedulerOtelAttributesMap: SchedulerOtelAttributesMap = {
  "scheduler.slot.requested": {
    action: "requested",
    domain: "scheduler",
    entity: "slot",
  },
  "scheduler.started": {
    action: "started",
    domain: "scheduler",
    entity: undefined,
  },
  "scheduler.stopped": {
    action: "stopped",
    domain: "scheduler",
    entity: undefined,
  },
};
