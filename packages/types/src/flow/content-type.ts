// The one MIME string every consumer already treats specially -- everything
// else is either free-form (ContentType) or still closed to the three
// text-safe values (TextSafeContentType, see below).
export type ContentType = "application/json" | (string & {});

// What can be extracted from a JSON response and re-stored, or typed by hand
// into a text field: never binary. ExportDeclaration/Ref.exportType/ExportRef
// share this because an export is always JSON-derived; the workbench's
// artifact-authoring panel shares it because it's a textarea.
export type TextSafeContentType =
  "application/json" | "text/plain" | "text/markdown";

export type ContentKind = "json" | "text" | "binary";
