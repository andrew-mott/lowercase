// Generates TypeScript types from the JSON Schema files in src/schemas.
//
//   node scripts/write-generated-types.ts          writes the generated files
//   node scripts/write-generated-types.ts --check  fails if any is missing or stale
//
// Each <name>.schema.json becomes <name>.gen.ts in packages/types/src/generated.
// The generated files are committed, so the types package needs no codegen
// step of its own, and --check keeps them from drifting from their schemas.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
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

const schemaFiles = (await readdir(schemaDir))
  .filter((file) => file.endsWith(".schema.json"))
  .sort();

const stale: string[] = [];
await mkdir(outDir, { recursive: true });
for (const schemaFile of schemaFiles) {
  const outFile = path.join(
    outDir,
    schemaFile.replace(/\.schema\.json$/, ".gen.ts"),
  );
  const schema = JSON.parse(
    await readFile(path.join(schemaDir, schemaFile), "utf8"),
  );
  const formatted = await generateTypes(schema, {
    source: "packages/specs/src/schemas/" + schemaFile,
    filepath: outFile,
    cwd: schemaDir,
  });
  const relative = path.relative(process.cwd(), outFile);
  if (check) {
    const current = await readFile(outFile, "utf8").catch(() => undefined);
    if (current !== formatted) stale.push(relative);
    continue;
  }
  await writeFile(outFile, formatted);
  console.log("wrote " + relative);
}

if (stale.length > 0) {
  console.error(
    red +
      "×" +
      stop +
      " Generated types are out of date. Run `pnpm -F @lcase/specs gen`:\n" +
      stale.map((file) => "  " + file).join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(green + "✓" + stop + " Generated types are up to date");
}
