// Generated from packages/specs/src/schemas/http-json.step.schema.json.
// Do not edit. Change the schema, then run `pnpm -F @lcase/specs gen`.

/**
 * A legacy capability step that makes one HTTP request and can declare eval context for its exports.
 */
export type StepHttpJson = StepCapCommonFields &
  StepOnField & {
    type: "httpjson";
    url: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    headers?: {
      [k: string]: string;
    };
    body?:
      | null
      | boolean
      | number
      | string
      | unknown[]
      | {
          [k: string]: unknown;
        };
    exports?: {
      [k: string]: HttpJsonExportDeclaration;
    };
  };
export type HttpJsonEvalContextSource =
  | {
      source: "param";
      name: string;
    }
  | {
      source: "export";
      stepId: string;
      name: string;
    }
  | {
      source: "output";
      stepId: string;
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
export type HttpJsonExportDeclaration = {
  ref: string;
  type: "application/json" | "text/plain" | "text/markdown";
  schema?: {
    [k: string]: unknown;
  };
  evalContext?: {
    [k: string]: HttpJsonEvalContextSource;
  };
};
