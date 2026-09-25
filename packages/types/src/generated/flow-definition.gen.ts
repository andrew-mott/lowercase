// Generated from packages/specs/src/schemas/flow-definition.schema.json.
// Do not edit. Change the schema, then run `pnpm -F @lcase/specs gen`.

export type FlowKind = "business" | "eval";
export type StepDefinition =
  StepBranch | StepJoin | StepParallel | StepHttpJson | StepMcp | StepHttp;
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
/**
 * A capability step that makes one HTTP request. Its body is JSON, a stored artifact's bytes, or a multipart form, and its response is stored under the response's own content type.
 */
export type StepHttp = StepOnField & {
  type: "http";
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: {
    [k: string]: string;
  };
  body?: HttpBodyJson | HttpBodyArtifact | HttpBodyMultipart;
  exports?: {
    [k: string]: HttpExportDeclaration;
  };
};

export type FlowDefinition = {
  name: string;
  version: string;
  description?: string;
  kind?: FlowKind;
  params?: {
    [k: string]: FlowParamDefinition;
  };
  outputs?: {
    [k: string]: FlowOutputDefinition;
  };
  start: string;
  steps: {
    [k: string]: StepDefinition;
  };
};
export type FlowParamDefinition = {
  type: string;
  optional?: true;
};
export type FlowOutputDefinition = {
  payload: string;
};
export type StepBranch = {
  type: "branch";
  value: string;
  cases: {
    [k: string]: string;
  };
  default: string;
};
export type StepJoin = {
  type: "join";
  steps: string[];
  next: string;
};
export type StepParallel = {
  type: "parallel";
  steps: string[];
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
/**
 * A JSON body. String values are templated, as in an httpjson step's body.
 */
export type HttpBodyJson = {
  json: unknown;
};
/**
 * A stored artifact's bytes as the whole body, sent with the artifact's own content type.
 */
export type HttpBodyArtifact = {
  artifact: string;
};
/**
 * A multipart/form-data body, keyed by part name. A string part is a templated field, and an artifact part is a file.
 */
export type HttpBodyMultipart = {
  multipart: {
    [k: string]: string | HttpMultipartFile;
  };
};
/**
 * A file part, carrying a stored artifact's bytes and content type.
 */
export type HttpMultipartFile = {
  artifact: string;
  filename?: string;
};
/**
 * A value selected from a JSON response and stored as its own artifact.
 */
export type HttpExportDeclaration = {
  ref: string;
  type: "application/json" | "text/plain" | "text/markdown";
  schema?: {
    [k: string]: unknown;
  };
};
