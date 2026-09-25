// Generated from packages/specs/src/schemas/http.step.schema.json.
// Do not edit. Change the schema, then run `pnpm -F @lcase/specs gen`.

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

export type StepOnField = {
  on?: {
    success?: string;
    failure?: string;
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
