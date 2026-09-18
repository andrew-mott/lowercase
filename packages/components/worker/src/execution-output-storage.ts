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

export async function tryStoreOutput(
  writer: ArtifactWriterPort,
  payload: JsonValue,
): Promise<ArtifactRef | undefined> {
  const result = await writer.save(payload, "application/json");
  return result.status === "saved" ? { hash: result.hash } : undefined;
}

export async function storeExecutionOutputs(
  writer: ArtifactWriterPort,
  payload: JsonValue,
  declarations?: Record<string, ExportRef>,
): Promise<StoreExecutionOutputsOutcome> {
  const outputResult = await writer.save(payload, "application/json");
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
  const storedExports = await storeDeclaredExports(
    writer,
    payload,
    declarations,
  );
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
