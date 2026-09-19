import type { ErrorObject, ValidateFunction } from "ajv";

export type SchemaIssue = { path: string[]; message: string };

type Subschema = { $ref?: string; type?: string };
type Defs = Record<string, { required?: string[] }>;

/**
 * Turns a failed validation's AJV errors into one issue per real problem, with
 * a readable message and the path to the value it is about.
 *
 * A `oneOf` fails with an error from every alternative it tried, which reads as
 * noise: a multipart body with one bad part would also report that it is
 * missing `json` and `artifact`. When the value names exactly one alternative
 * (it has that alternative's required fields), only that alternative's errors
 * are kept. When it names none, or several, the alternatives' errors are
 * replaced by one issue listing the shapes it could have been.
 */
export function schemaIssues(validate: ValidateFunction): SchemaIssue[] {
  const errors = validate.errors ?? [];
  const schema = validate.schema;
  const defs = (
    typeof schema === "object" && "$defs" in schema ? schema.$defs : {}
  ) as Defs;
  let remaining = errors;

  // Deepest first, so a oneOf nested inside another one's alternative (a
  // multipart part inside a multipart body) is settled before its parent.
  const oneOfs = errors
    .filter((error) => error.keyword === "oneOf")
    .sort((a, b) => b.instancePath.length - a.instancePath.length);

  for (const oneOf of oneOfs) {
    const alternatives = (oneOf.schema as Subschema[]).map((subschema, index) =>
      alternative(subschema, `${oneOf.schemaPath}/${index}/`, defs),
    );
    const intended = alternatives.filter((alt) => alt.matches(oneOf.data));
    const atThisValue = (error: ErrorObject) =>
      error.instancePath === oneOf.instancePath;

    if (intended.length === 1) {
      // Every other alternative fails at this value itself (a missing required
      // field, an extra field), never below it.
      remaining = remaining.filter(
        (error) =>
          error !== oneOf &&
          !(
            atThisValue(error) &&
            !error.schemaPath.startsWith(intended[0].prefix)
          ),
      );
    } else {
      // Every error at or below a value that must match a oneOf came from one
      // of its alternatives, as long as the oneOf is the only keyword there.
      remaining = remaining.filter(
        (error) =>
          error === oneOf ||
          !(
            atThisValue(error) ||
            error.instancePath.startsWith(oneOf.instancePath + "/")
          ),
      );
      oneOf.message =
        "must be one of " + alternatives.map((alt) => alt.label).join(", ");
    }
  }

  return remaining.map((error) => ({
    path: toPath(error.instancePath),
    message: message(error),
  }));
}

function alternative(subschema: Subschema, inlinePrefix: string, defs: Defs) {
  if (subschema.$ref) {
    const name = subschema.$ref.split("/").pop() ?? "";
    const required = defs[name]?.required ?? [];
    return {
      prefix: `#/$defs/${name}/`,
      label: `{ ${required.join(", ")} }`,
      matches: (data: unknown) =>
        typeof data === "object" &&
        data !== null &&
        required.every((field) => field in data),
    };
  }
  return {
    prefix: inlinePrefix,
    label: `a ${subschema.type}`,
    matches: (data: unknown) => typeof data === subschema.type,
  };
}

function message(error: ErrorObject): string {
  switch (error.keyword) {
    case "additionalProperties":
      return `unknown field "${error.params.additionalProperty}"`;
    case "required":
      return `missing required field "${error.params.missingProperty}"`;
    case "enum":
      return "must be one of " + error.params.allowedValues.join(", ");
    case "const":
      return `must be "${error.params.allowedValue}"`;
    default:
      return error.message ?? "is invalid";
  }
}

// "/body/multipart/file" -> ["body", "multipart", "file"], undoing JSON
// Pointer's escapes for "/" and "~" in keys.
function toPath(instancePath: string): string[] {
  if (!instancePath) return [];
  return instancePath
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}
