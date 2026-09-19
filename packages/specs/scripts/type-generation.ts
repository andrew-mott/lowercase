import { compile } from "json-schema-to-typescript";
import type { JSONSchema } from "json-schema-to-typescript";
import prettier from "prettier";

export type GenerateOptions = {
  /** Where the schema lives, named in the generated file's header. */
  source: string;
  /** Where the output will be written; picks the Prettier config. */
  filepath: string;
  /** Directory that relative $refs to other files resolve against. */
  cwd: string;
};

/**
 * Turns one JSON Schema into the TypeScript source of its generated file:
 * a header, then one type alias per titled schema, formatted as the repo's
 * Prettier config would.
 */
export async function generateTypes(
  schema: JSONSchema,
  options: GenerateOptions,
): Promise<string> {
  if (!schema.title) {
    throw new Error(`${options.source} needs a title to name its type`);
  }
  const ts = await compile(schema, schema.title, {
    bannerComment: banner(options.source),
    additionalProperties: false,
    cwd: options.cwd,
    format: false,
  });
  const config = await prettier.resolveConfig(options.filepath);
  const format = { ...config, filepath: options.filepath };
  const aliased = toTypeAliases(await prettier.format(ts, format));
  return prettier.format(aliased, format);
}

function banner(source: string): string {
  return [
    `// Generated from ${source}.`,
    "// Do not edit. Change the schema, then run `pnpm -F @lcase/specs gen`.",
  ].join("\n");
}

/**
 * json-schema-to-typescript always declares a named object as an interface,
 * with no option to change it. Declare types instead, so a generated object
 * fits a Record<string, unknown> the way a hand-written type alias does. Runs
 * on formatted output, where every declaration opens with `export interface
 * Name {` and closes with `}` at column 0, or is `export interface Name {}` when
 * it has no properties. Anything else, such as the `extends` it writes for its
 * own `tsExtends` keyword, throws rather than being guessed.
 */
export function toTypeAliases(ts: string): string {
  let open = false;
  return ts
    .split("\n")
    .map((line) => {
      const empty = line.match(/^export interface (\w+) \{\}$/);
      if (empty) return `export type ${empty[1]} = {};`;
      const declaration = line.match(/^export interface (\w+) \{$/);
      if (declaration) {
        open = true;
        return `export type ${declaration[1]} = {`;
      }
      if (line.startsWith("export interface ")) {
        throw new Error("Cannot turn into a type alias: " + line);
      }
      if (open && line === "}") {
        open = false;
        return "};";
      }
      return line;
    })
    .join("\n");
}
