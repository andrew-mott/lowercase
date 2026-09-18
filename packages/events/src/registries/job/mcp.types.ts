import type { JobMcpEventType } from "@lcase/types";

export const mcpEventTypes = [
  "job.mcp.completed",
  "job.mcp.delayed",
  "job.mcp.resumed",
  "job.mcp.failed",
  "job.mcp.queued",
  "job.mcp.started",
  "job.mcp.submitted",
] as const satisfies JobMcpEventType[];

type MissingMcpTypes = Exclude<JobMcpEventType, (typeof mcpEventTypes)[number]>;
type _ListsAllMcpTypes = MissingMcpTypes extends never ? true : never;
const _checkEventTypes: _ListsAllMcpTypes = true;
