// Generates TypeScript types from the composed flow-definition JSON Schema.
//
//   node scripts/write-generated-types.ts          writes the generated file
//   node scripts/write-generated-types.ts --check  fails if it is missing or stale
//
// The generated file is committed, so the types package needs no codegen step
// of its own, and --check keeps it from drifting from its schema graph.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateTypes } from "./schema-type-compiler.ts";

const specsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const schemaDir = path.join(specsRoot, "src/schemas");
const outDir = path.resolve(specsRoot, "../types/src/generated");
const check = process.argv.includes("--check");

const red = "\x1b[38;2;255;100;50m";
const green = "\x1b[38;2;108;235;106m";
const stop = "\x1b[0m";

const schemaFile = "flow-definition.schema.json";
const outFile = path.join(outDir, "flow-definition.gen.ts");
const schema = JSON.parse(
  await readFile(path.join(schemaDir, schemaFile), "utf8"),
);
const formatted = await generateTypes(schema, {
  source: "packages/specs/src/schemas/" + schemaFile,
  filepath: outFile,
  cwd: schemaDir,
});
const relative = path.relative(process.cwd(), outFile);

await mkdir(outDir, { recursive: true });
if (check) {
  const current = await readFile(outFile, "utf8").catch(() => undefined);
  if (current === formatted) {
    console.log(green + "✓" + stop + " Generated types are up to date");
  } else {
    console.error(
      red +
        "×" +
        stop +
        " Generated types are out of date. Run `pnpm -F @lcase/specs gen`:\n" +
        "  " +
        relative,
    );
    process.exitCode = 1;
  }
} else {
  await writeFile(outFile, formatted);
  console.log("wrote " + relative);
  console.log(green + "✓" + stop + " Generated types are up to date");
}
