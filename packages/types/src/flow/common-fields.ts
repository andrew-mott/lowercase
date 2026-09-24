import type { TextSafeContentType } from "./content-type.js";

export type EvalContextSource =
  | { source: "param"; name: string }
  | { source: "export"; stepId: string; name: string }
  | { source: "output"; stepId: string };

export type ExportDeclaration = {
  ref: string;
  type: TextSafeContentType;
  // JSON Schema, validated only when type is application/json
  schema?: Record<string, unknown>;
  // declares, once, what other refs from the same run are useful context
  // when this export is later judged by an eval flow (see EvalService)
  evalContext?: Record<string, EvalContextSource>;
};

export type StepExportsField = {
  exports?: Record<string, ExportDeclaration>;
};
