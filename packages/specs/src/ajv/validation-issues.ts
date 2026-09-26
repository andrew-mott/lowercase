import type { ErrorObject, ValidateFunction } from "ajv";

export type SchemaIssue = { path: string[]; message: string };

type Subschema = { $ref?: string; type?: string };
type Schema = {
  required?: string[];
  properties?: Record<string, { const?: unknown }>;
  allOf?: Schema[];
  $defs?: Defs;
};
type Defs = Record<string, Schema>;
type SchemaResolver = (id: string) => object | boolean | undefined;
type SchemaOwner = (schema: object | boolean | undefined) => string | undefined;

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
export function schemaIssues(
  validate: ValidateFunction,
  resolveSchema: SchemaResolver = () => undefined,
  schemaOwner: SchemaOwner = () => undefined,
): SchemaIssue[] {
  const errors = validate.errors ?? [];
  const schema = validate.schema;
  const defs = definitions(schema);
  let remaining = errors;

  // Deepest first, so a oneOf nested inside another one's alternative (a
  // multipart part inside a multipart body) is settled before its parent.
  const oneOfs = errors
    .filter((error) => error.keyword === "oneOf")
    .sort((a, b) => b.instancePath.length - a.instancePath.length);

  for (const oneOf of oneOfs) {
    const owner = schemaOwner(oneOf.parentSchema);
    const oneOfDefs = owner ? definitions(resolveSchema(owner)) : defs;
    const alternatives = (oneOf.schema as Subschema[]).map((subschema, index) =>
      alternative(
        subschema,
        `${oneOf.schemaPath}/${index}/`,
        oneOfDefs,
        resolveSchema,
      ),
    );
    const intended = alternatives.filter((alt) => alt.matches(oneOf.data));
    const selectedExternalReference =
      intended.length === 1 &&
      intended[0].schemaId !== undefined &&
      !intended[0].schemaId.startsWith("#");
    const atOrBelowThisValue = (error: ErrorObject) =>
      error.instancePath === oneOf.instancePath ||
      error.instancePath.startsWith(oneOf.instancePath + "/");
    const inSelectedRange = (error: ErrorObject) =>
      selectedExternalReference
        ? atOrBelowThisValue(error)
        : error.instancePath === oneOf.instancePath;

    if (intended.length === 1) {
      // External step schemas can report a discriminator failure below this
      // value. Internal unions only filter their own level so nested problems
      // from the selected shape remain visible.
      remaining = remaining.filter(
        (error) =>
          error !== oneOf &&
          !(
            inSelectedRange(error) &&
            !belongsTo(error, intended[0], schemaOwner)
          ),
      );
    } else {
      // Every error at or below a value that must match a oneOf came from one
      // of its alternatives, as long as the oneOf is the only keyword there.
      remaining = remaining.filter(
        (error) => error === oneOf || !atOrBelowThisValue(error),
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

function definitions(value: object | boolean | undefined): Defs {
  return schemaObject(value)?.$defs ?? {};
}

function alternative(
  subschema: Subschema,
  inlinePrefix: string,
  defs: Defs,
  resolveSchema: SchemaResolver,
) {
  if (subschema.$ref) {
    const name = subschema.$ref.split("/").pop() ?? "";
    const referenced = subschema.$ref.startsWith("#/$defs/")
      ? defs[name]
      : schemaObject(resolveSchema(subschema.$ref));
    const required = referenced?.required ?? [];
    const type = discriminator(referenced);
    return {
      schemaId: subschema.$ref,
      prefix: subschema.$ref.startsWith("#/$defs/")
        ? `#/$defs/${name}/`
        : `${subschema.$ref}/`,
      label: type === undefined ? `{ ${required.join(", ")} }` : `"${type}"`,
      matches: (data: unknown) =>
        typeof data === "object" &&
        data !== null &&
        (type === undefined
          ? required.every((field) => field in data)
          : "type" in data && data.type === type),
    };
  }
  return {
    schemaId: undefined,
    prefix: inlinePrefix,
    label: `a ${subschema.type}`,
    matches: (data: unknown) => typeof data === subschema.type,
  };
}

function belongsTo(
  error: ErrorObject,
  alternative: { schemaId?: string; prefix: string },
  schemaOwner: SchemaOwner,
) {
  return (
    error.schemaPath.startsWith(alternative.prefix) ||
    (alternative.schemaId !== undefined &&
      schemaOwner(error.parentSchema) === alternative.schemaId)
  );
}

function discriminator(schema: Schema | undefined): unknown {
  return (
    schema?.properties?.type?.const ??
    schema?.allOf?.map(discriminator).find((value) => value !== undefined)
  );
}

function schemaObject(value: object | boolean | undefined): Schema | undefined {
  return typeof value === "object" && value !== null
    ? (value as Schema)
    : undefined;
}

function message(error: ErrorObject): string {
  switch (error.keyword) {
    case "additionalProperties":
      return `unknown field "${error.params.additionalProperty}"`;
    case "unevaluatedProperties":
      return `unknown field "${error.params.unevaluatedProperty}"`;
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
