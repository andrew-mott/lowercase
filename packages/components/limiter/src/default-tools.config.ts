import type { ToolSpec } from "@lcase/types";

export const defaultToolsConfig: ToolSpec[] = [
  {
    id: "mcp",
    maxConcurrency: 1,
    capabilities: ["mcp"],
    location: "internal",
    rateLimit: undefined,
  },
  {
    id: "httpjson",
    maxConcurrency: 1,
    capabilities: ["httpjson"],
    location: "internal",
    rateLimit: undefined,
  },
];
