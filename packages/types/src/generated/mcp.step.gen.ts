// Generated from packages/specs/src/schemas/mcp.step.schema.json.
// Do not edit. Change the schema, then run `pnpm -F @lcase/specs gen`.

export type StepMcp = StepCapCommonFields &
  StepOnField & {
    type: "mcp";
    url: string;
    transport: "sse" | "stdio" | "streamable-http" | "http";
    feature: {
      primitive:
        "resource" | "prompt" | "tool" | "sampling" | "roots" | "elicitation";
      name: string;
    };
  };

export type StepCapCommonFields = {
  args?: {
    [k: string]: unknown;
  };
  tool?: string;
};
export type StepOnField = {
  on?: {
    success?: string;
    failure?: string;
  };
};
