import { bindStepRefs } from "@lcase/json-ref-binder";
import type {
  HttpBodyArtifact,
  HttpBodyJson,
  HttpBodyMultipart,
  HttpMultipartFile,
  JsonValue,
  Ref,
  StepHttp,
} from "@lcase/types";
import type { ProtocolRequest } from "../../job.contracts.js";
import type { MaterializeHttpJsonRequestOutcome } from "./materialize-http-json-request.js";
import type {
  ResolvedHttpBinary,
  ResolvedHttpBody,
} from "./http-json.types.js";

// `http`'s own normalizer -- mirrors materialize-http-json-request.ts's
// shape (build a bare step template, bind refs through the same
// bindStepRefs, project into the shared resolved-request type) but resolves
// the fuller json/artifact/multipart body union instead of a bare JSON
// value. Both normalizers feed the one executor C4 built; this Change adds
// the second normalizer, not a second executor.
export function materializeHttpRequest(
  protocol: Extract<ProtocolRequest, { kind: "http" }>,
  refs: Ref[],
  resolved: Record<string, unknown>,
): MaterializeHttpJsonRequestOutcome {
  const template: StepHttp = {
    type: "http",
    url: protocol.url,
    method: protocol.method,
    headers: protocol.headers,
    body: protocol.body,
  };

  const bound = bindStepRefs(refs, resolved, template);

  const method = bound.method ?? "GET";
  if ((method === "GET" || method === "HEAD") && bound.body !== undefined) {
    return {
      ok: false,
      message: `HTTP ${method} requests cannot have a body`,
    };
  }

  const body: ResolvedHttpBody | undefined =
    protocol.body !== undefined && bound.body !== undefined
      ? resolveBody(protocol.body, bound.body, refs)
      : undefined;

  const headers: Record<string, string> = { ...bound.headers };
  if (!("Accept" in headers) && !("accept" in headers)) {
    headers["Accept"] = "application/json";
  }
  if (body && !("Content-Type" in headers) && !("content-type" in headers)) {
    // multipart is deliberately left unset here -- fetch sets its own
    // boundary-bearing Content-Type when given a FormData body, and setting
    // one ourselves would strip the boundary.
    if (body.kind === "json") headers["Content-Type"] = "application/json";
    else if (body.kind === "artifact") {
      headers["Content-Type"] = body.value.contentType;
    }
  }

  try {
    // Validate the materialized URL -- only http:/https: allowed.
    const parsed = new URL(bound.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false,
        message: `Unsupported URL scheme "${parsed.protocol}" for "${bound.url}"`,
      };
    }
  } catch (err) {
    return { ok: false, message: `Invalid URL "${bound.url}": ${String(err)}` };
  }

  return {
    ok: true,
    request: {
      url: bound.url,
      method,
      headers,
      ...(body ? { body } : {}),
    },
  };
}

function resolveBody(
  template: HttpBodyJson | HttpBodyArtifact | HttpBodyMultipart,
  bound: HttpBodyJson | HttpBodyArtifact | HttpBodyMultipart,
  refs: Ref[],
): ResolvedHttpBody {
  if ("json" in template) {
    // ShallowJsonValue -> JsonValue: correct by construction (a step's body
    // is only ever JSON.parse'd/authored JSON), but not structurally
    // assignable -- same precedent as materialize-http-json-request.ts.
    return { kind: "json", value: (bound as HttpBodyJson).json as JsonValue };
  }
  if ("artifact" in template) {
    return {
      kind: "artifact",
      value: resolveBinary(
        template.artifact,
        (bound as HttpBodyArtifact).artifact,
        refs,
      ),
    };
  }

  const parts: Record<string, string | ResolvedHttpBinary> = {};
  for (const [key, templatePart] of Object.entries(template.multipart)) {
    const boundPart = (bound as HttpBodyMultipart).multipart[key];
    parts[key] =
      typeof templatePart === "string"
        ? (boundPart as string)
        : resolveBinary(
            templatePart.artifact,
            (boundPart as HttpMultipartFile).artifact,
            refs,
            templatePart.filename,
          );
  }
  return { kind: "multipart", parts };
}

// `boundValue` is the ref's resolved raw bytes -- `template`'s matching field
// is still the pre-bind `"{{params.audio}}"` token, which is how the
// backing ref (and its content type) gets found again after binding.
function resolveBinary(
  templateValue: string,
  boundValue: unknown,
  refs: Ref[],
  filename?: string,
): ResolvedHttpBinary {
  const token = /^\{\{(.+)\}\}$/.exec(templateValue)?.[1];
  // Guaranteed present: JobRunner's #resolveOneRef only resolves this ref
  // successfully after validating its declared paramType against what's
  // actually stored (TYPE_MISMATCH otherwise, see arc A4's Change C5
  // discussion), and validateBinaryRefPosition already requires a param used
  // in a binary body position to declare a type.
  const contentType = refs.find((r) => r.string === token)!.paramType!;
  return {
    contentType,
    // ShallowJsonValue -> Uint8Array: correct by construction (an artifact
    // ref resolves to the artifact's raw bytes, never templated as a
    // string), but not structurally assignable -- same precedent as above.
    bytes: boundValue as Uint8Array,
    ...(filename ? { filename } : {}),
  };
}
