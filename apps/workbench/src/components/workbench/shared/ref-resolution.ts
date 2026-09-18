import type { FlowDefinition, JsonValue, Ref } from "@lcase/types";
import {
  resolvePath,
  resolveJsonPath,
} from "@lcase/json-ref-binder/resolve-path";
import type { MainPanelLanguage } from "@/components/workbench/shared/MainPanelTypes";

export type ParamArtifactContent =
  | { format: "json"; value: JsonValue }
  | { format: "text" | "markdown"; value: string };

/** An artifact's content-format doesn't map 1:1 onto editor/display language
 * naming — "text" artifacts render as "plaintext". */
export function artifactFormatToLanguage(
  format: ParamArtifactContent["format"],
): MainPanelLanguage {
  return format === "json"
    ? "json"
    : format === "markdown"
      ? "markdown"
      : "plaintext";
}

export type ParamRefUsage = {
  ref: Ref;
  resolved: boolean;
  originalField: unknown;
  resolvedValue: unknown; // the raw resolved sub-value, before any string substitution
  interpolatedResult: unknown;
};

/** One step ref together with its resolved hash/artifact/usage — the shared unit both
 * the Field Resolution (composed) and References (atomic) tabs render from. */
export type ResolvedRef = {
  ref: Ref;
  hash: string | null;
  artifact: ParamArtifactContent | undefined;
  usage: ParamRefUsage | undefined;
};

/**
 * Renders a bindPath for display as real JS accessor syntax — numeric segments
 * become `[n]` (no leading dot, so consecutive indices compose as `[0][1]` for
 * multi-dimensional arrays) rather than being joined with dots like every other
 * segment. bindPath itself stays an array of string/number segments for actual
 * traversal (resolvePath) — this is display-only formatting.
 */
export function formatBindPath(bindPath: (string | number)[]): string {
  return bindPath.reduce<string>((acc, segment, index) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }
    return index === 0 ? `${segment}` : `${acc}.${segment}`;
  }, "");
}

export function findParamRefs(refs: Ref[], paramName: string): Ref[] {
  return refs.filter(
    (r) => r.scope === "params" && r.valuePath[1] === paramName,
  );
}

export function findStepRefs(refs: Ref[], stepId: string): Ref[] {
  return refs.filter((r) => r.stepId === stepId);
}

/**
 * The hash a "steps"/"params" scope ref resolved to during a real run — mirrors
 * packages/engine/src/references/value-refs.ts's getRefHash exactly, sourced only
 * from lightweight hash-only data (a run's initial param hashes, and each step's
 * own outputHash/exportHashes), never from job.<cap>.submitted's bundled payload.
 */
export function resolveRefHash(
  ref: Ref,
  ctx: {
    paramHashes: Record<string, string>;
    stepArtifacts: Record<
      string,
      { outputHash?: string; exportHashes?: Record<string, string> }
    >;
  },
): string | null {
  if (ref.scope === "params") {
    const paramName = ref.valuePath[1];
    return typeof paramName === "string"
      ? (ctx.paramHashes[paramName] ?? null)
      : null;
  }
  if (ref.scope !== "steps") return null;

  const referencedStepId = ref.valuePath[1];
  if (typeof referencedStepId !== "string") return null;
  const info = ctx.stepArtifacts[referencedStepId];
  if (!info) return null;

  if (ref.valuePath[2] === "exports") {
    const exportName = ref.valuePath[3];
    return typeof exportName === "string"
      ? (info.exportHashes?.[exportName] ?? null)
      : null;
  }
  return info.outputHash ?? null;
}

/**
 * Mirrors value-refs.ts's own valuePath slicing so resolveJsonPath walks the
 * fetched artifact from the same root the worker itself resolves against.
 */
function getArtifactRelativeValuePath(ref: Ref): (string | number)[] {
  if (ref.scope === "params") return ref.valuePath.slice(2);
  if (ref.valuePath[2] === "exports") return ref.valuePath.slice(4);
  if (ref.valuePath[2] === "output") return ref.valuePath.slice(3);
  return ref.valuePath.slice(2);
}

export function buildRefUsage(
  ref: Ref,
  flowDef: FlowDefinition,
  artifact: ParamArtifactContent,
): ParamRefUsage {
  const step = flowDef.steps[ref.stepId] as unknown as Record<string, unknown>;
  const originalField = resolvePath(ref.bindPath, step);
  const resolvedValue =
    artifact.format === "json"
      ? resolveJsonPath(getArtifactRelativeValuePath(ref), artifact.value)
      : artifact.value;

  if (resolvedValue === undefined) {
    return {
      ref,
      resolved: false,
      originalField,
      resolvedValue: undefined,
      interpolatedResult: originalField,
    };
  }

  return {
    ref,
    resolved: true,
    originalField,
    resolvedValue,
    interpolatedResult: interpolateRefLocal(originalField, resolvedValue, ref),
  };
}

/**
 * Composes a field's *final* resolved value from every ref that lives in it
 * (a field can embed more than one {{...}} reference) — folding each ref's
 * substitution onto the same accumulator in sequence, rather than showing one
 * row per ref with only its own fragment substituted into an otherwise-still-
 * templated string.
 */
export function foldResolvedField(
  flowDef: FlowDefinition,
  stepId: string,
  bindPath: (string | number)[],
  group: ResolvedRef[],
): {
  originalField: unknown;
  value: unknown;
  anyUnresolved: boolean;
  anyLoading: boolean;
} {
  const step = flowDef.steps[stepId] as unknown as Record<string, unknown>;
  const originalField = resolvePath(bindPath, step);

  let acc = originalField;
  let anyUnresolved = false;
  let anyLoading = false;

  for (const resolvedRef of group) {
    if (resolvedRef.hash === null) {
      anyUnresolved = true;
      continue;
    }
    if (!resolvedRef.usage) {
      anyLoading = true;
      continue;
    }
    if (!resolvedRef.usage.resolved) {
      anyUnresolved = true;
      continue;
    }
    const ref = resolvedRef.ref;
    acc =
      ref.interpolated && typeof acc === "string"
        ? interpolateRefLocal(acc, resolvedRef.usage.resolvedValue, ref)
        : resolvedRef.usage.resolvedValue;
  }

  return { originalField, value: acc, anyUnresolved, anyLoading };
}

export function interpolateRefLocal(
  field: unknown,
  value: unknown,
  ref: Ref,
): unknown {
  if (ref.interpolated && typeof field === "string") {
    const stringified =
      typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value);
    return field.replaceAll(`{{${ref.string}}}`, stringified);
  }
  return value;
}

export function renderParamRefReport(
  paramName: string,
  usages: ParamRefUsage[],
): string {
  if (usages.length === 0) {
    return `No usages of param "${paramName}" found in this flow.`;
  }

  const sections = usages.map((usage) => {
    const fieldPath = formatBindPath(usage.ref.bindPath);
    const heading = `### Step "${usage.ref.stepId}" — ${fieldPath}`;
    if (!usage.resolved) {
      return `${heading}\n\n_could not resolve \`{{${usage.ref.string}}}\` against the selected artifact_`;
    }
    const resultText =
      typeof usage.interpolatedResult === "string"
        ? usage.interpolatedResult
        : JSON.stringify(usage.interpolatedResult, null, 2);
    return `${heading}\n\n\`\`\`\n${resultText}\n\`\`\``;
  });

  return `## Usages of param "${paramName}"\n\n${sections.join("\n\n")}`;
}
