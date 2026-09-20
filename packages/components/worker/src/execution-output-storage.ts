import { classifyContentType } from "@lcase/flow-analysis";
import { resolveJsonPath } from "@lcase/json-ref-binder";
import type { ArtifactWriterPort, SaveArtifactResult } from "@lcase/ports";
import type { ExportRef, JsonValue } from "@lcase/types";
import { validateExportSchema } from "./export-validation.js";
import type { StoredExecutionOutputs } from "./job-result.factories.js";
import type {
  ArtifactRef,
  JobExecutionError,
  JobExecutionErrorCode,
} from "./job.contracts.js";

export type StoreExecutionOutputsOutcome =
  | { ok: true; outputs: StoredExecutionOutputs }
  | { ok: false; error: JobExecutionError; output?: ArtifactRef };

type StoreExportsOutcome =
  | { ok: true; exports?: Record<string, ArtifactRef> }
  | { ok: false; error: JobExecutionError };

type StoreExportOutcome =
  { ok: true; artifact: ArtifactRef } | { ok: false; error: JobExecutionError };

type JsonExportValueOutcome =
  { ok: true; value: JsonValue } | { ok: false; error: JobExecutionError };

type ExportErrorCode = Extract<
  JobExecutionErrorCode,
  | "EXPORT_RESOLUTION_FAILED"
  | "EXPORT_VALIDATION_FAILED"
  | "EXPORT_STORE_FAILED"
>;

// Saves a response payload under its own real content type instead of always
// tagging it application/json. A defined contentType is trusted directly
// (readResponseBody only ever produces a payload whose JS shape matches
// classifyContentType(contentType) -- json via response.json(), text/* via
// response.text(), anything else via response.arrayBuffer() -- so the casts
// below encode that pairing, not a runtime check). An undefined contentType
// falls back to classifying the payload's own JS shape, which is also what
// keeps a bare JSON object with no known contentType tagged application/json,
// matching the old unconditional behavior for that case.
function saveResponsePayload(
  writer: ArtifactWriterPort,
  payload: JsonValue | string | Uint8Array,
  contentType: string | undefined,
): Promise<SaveArtifactResult> {
  if (contentType === undefined) {
    if (payload instanceof Uint8Array) {
      return writer.save(payload, "application/octet-stream");
    }
    if (typeof payload === "string") {
      return writer.save(payload, "text/plain");
    }
    return writer.save(payload, "application/json");
  }

  switch (classifyContentType(contentType)) {
    case "json":
      return writer.save(payload as JsonValue, "application/json");
    case "text":
      return writer.save(payload as string, contentType as `text/${string}`);
    case "binary":
      return writer.save(payload as Uint8Array, contentType);
  }
}

// The failed-job path: best-effort save of a failure response's body, purely
// for debugging (a parseable error detail blob becomes the failed
// JobResult's optional `output`). Storage failing here must not surface as a
// new error -- the job is already failing for the real reason, the protocol
// error -- so this swallows it and returns undefined rather than a
// StoreExecutionOutputsOutcome. No export handling either: exports only ever
// apply to a step that actually completed.
export async function tryStoreFailureOutput(
  writer: ArtifactWriterPort,
  payload: JsonValue | string | Uint8Array,
  contentType: string | undefined,
): Promise<ArtifactRef | undefined> {
  const result = await saveResponsePayload(writer, payload, contentType);
  return result.status === "saved" ? { hash: result.hash } : undefined;
}

// The completed-job path: the protocol call succeeded, so this is the job's
// real output. Storage failing here is a real failure (OUTPUT_STORE_FAILED),
// and declared exports are resolved and stored against it, since only a
// completed step's output is ever something a flow can export from.
export async function storeCompletedOutputs(
  writer: ArtifactWriterPort,
  payload: JsonValue | string | Uint8Array,
  contentType: string | undefined,
  declarations?: Record<string, ExportRef>,
): Promise<StoreExecutionOutputsOutcome> {
  const outputResult = await saveResponsePayload(writer, payload, contentType);
  if (outputResult.status !== "saved") {
    return {
      ok: false,
      error: {
        code: "OUTPUT_STORE_FAILED",
        message: saveErrorMessage(outputResult),
        retryable: false,
      },
    };
  }

  const output: ArtifactRef = { hash: outputResult.hash };
  // Exports select from JSON only -- a genuinely binary payload isn't a
  // JsonValue at all, so there's nothing for resolveJsonPath to walk. A
  // string payload still narrows into JsonValue fine and needs no special
  // case: storeDeclaredExport already fails a declared export gracefully
  // against a non-object root, the same way it does today for a bad
  // valuePath.
  const storedExports =
    payload instanceof Uint8Array
      ? await storeDeclaredExportsAgainstBinary(declarations, contentType)
      : await storeDeclaredExports(writer, payload, declarations);
  if (!storedExports.ok) {
    return { ok: false, error: storedExports.error, output };
  }

  return {
    ok: true,
    outputs: {
      output,
      ...(storedExports.exports ? { exports: storedExports.exports } : {}),
    },
  };
}

function storeDeclaredExportsAgainstBinary(
  declarations: Record<string, ExportRef> | undefined,
  contentType: string | undefined,
): StoreExportsOutcome {
  if (Object.keys(declarations ?? {}).length === 0) return { ok: true };
  return exportFailure(
    "EXPORT_RESOLUTION_FAILED",
    `Cannot resolve declared exports from a binary response (content type "${contentType ?? "unknown"}")`,
  );
}

async function storeDeclaredExports(
  writer: ArtifactWriterPort,
  payload: JsonValue,
  declarations?: Record<string, ExportRef>,
): Promise<StoreExportsOutcome> {
  const entries = Object.entries(declarations ?? {});
  if (entries.length === 0) return { ok: true };

  const exports: Record<string, ArtifactRef> = {};
  for (const [exportName, declaration] of entries) {
    const stored = await storeDeclaredExport(
      writer,
      payload,
      exportName,
      declaration,
    );
    if (!stored.ok) return stored;
    exports[exportName] = stored.artifact;
  }

  return { ok: true, exports };
}

async function storeDeclaredExport(
  writer: ArtifactWriterPort,
  payload: JsonValue,
  exportName: string,
  declaration: ExportRef,
): Promise<StoreExportOutcome> {
  // Export paths carry a leading "output" segment by construction. The
  // payload passed here is already the output itself.
  const selected = resolveJsonPath(declaration.valuePath.slice(1), payload);
  if (selected === undefined) {
    return exportFailure(
      "EXPORT_RESOLUTION_FAILED",
      `Could not resolve export "${exportName}" from "${declaration.string}"`,
    );
  }

  if (declaration.type === "application/json") {
    return storeJsonExport(writer, exportName, declaration, selected);
  }

  return storeTextExport(writer, exportName, declaration.type, selected);
}

async function storeJsonExport(
  writer: ArtifactWriterPort,
  exportName: string,
  declaration: ExportRef,
  selected: unknown,
): Promise<StoreExportOutcome> {
  const valueResult = jsonExportValue(exportName, selected);
  if (!valueResult.ok) return valueResult;

  if (declaration.schema) {
    const validation = validateExportSchema(
      declaration.schema,
      valueResult.value,
    );
    if (!validation.ok) {
      return exportFailure(
        "EXPORT_VALIDATION_FAILED",
        `Export "${exportName}" failed schema validation: ${validation.message}`,
      );
    }
  }

  return storedArtifact(
    await writer.save(valueResult.value, "application/json"),
  );
}

function jsonExportValue(
  exportName: string,
  selected: unknown,
): JsonExportValueOutcome {
  if (typeof selected !== "string") {
    return { ok: true, value: selected as JsonValue };
  }

  try {
    return { ok: true, value: JSON.parse(selected) as JsonValue };
  } catch (err) {
    return exportFailure(
      "EXPORT_RESOLUTION_FAILED",
      `Export "${exportName}" could not be parsed as JSON: ${String(err)}`,
    );
  }
}

async function storeTextExport(
  writer: ArtifactWriterPort,
  exportName: string,
  type: "text/plain" | "text/markdown",
  selected: unknown,
): Promise<StoreExportOutcome> {
  if (typeof selected !== "string") {
    return exportFailure(
      "EXPORT_RESOLUTION_FAILED",
      `Export "${exportName}" declared ${type} but resolved value is not a string`,
    );
  }

  const result =
    type === "text/plain"
      ? await writer.save(selected, "text/plain")
      : await writer.save(selected, "text/markdown");
  return storedArtifact(result);
}

// Only a "saved" outcome counts as success here: every artifact still needs
// its SQL row for real downstream consumers (run-param reuse, previews), so
// a content-only save (CAS succeeded, SQL metadata didn't) isn't yet a safe
// success case to hand back. Revisit once those consumers migrate off SQL.
function storedArtifact(result: SaveArtifactResult): StoreExportOutcome {
  if (result.status !== "saved") {
    return exportFailure("EXPORT_STORE_FAILED", saveErrorMessage(result));
  }
  return { ok: true, artifact: { hash: result.hash } };
}

function saveErrorMessage(
  result: Extract<SaveArtifactResult, { status: "content-only" | "failed" }>,
): string {
  return result.error.message;
}

function exportFailure(
  code: ExportErrorCode,
  message: string,
): { ok: false; error: JobExecutionError } {
  return { ok: false, error: { code, message, retryable: false } };
}
