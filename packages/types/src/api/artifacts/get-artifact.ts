import type { JsonValue } from "../../json-value.js";

export type GetArtifactReq = { hash: string };
export type GetArtifactRes =
  | {
      ok: true;
      format: "json";
      value: JsonValue;
    }
  | {
      ok: true;
      format: "text" | "markdown";
      value: string;
    }
  | {
      ok: true;
      format: "bytes";
      byteLength: number;
      contentType: string;
    }
  | { ok: false; error: string };
