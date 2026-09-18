// Bundles each host in the calling app into one file plus its esbuild metafile,
// and fails if a host's bundle contains a package that host must not.
//
// Takes no argument: a package manager runs a script with that package's
// directory as the working directory, so the hosts come from that app's
// `bundle.config.mjs`. This file holds only how a host is bundled and checked;
// which hosts exist, what each keeps external, and what each forbids belongs to
// the app.
//
// Reads the `tsc` output in `dist`, so the app's `build` runs first. esbuild
// only resolves and shakes here; type checking stays with `tsc`.
//
// A failed run removes `bundle` entirely rather than leaving the hosts that
// happened to finish before the failure.

import { build } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const configUrl = pathToFileURL(path.resolve("bundle.config.mjs"));
const { hosts, assets = [] } = await import(configUrl.href);

const outDir = "bundle";

// @aws-sdk/client-s3 ships CommonJS that require()s node builtins. ESM output
// has no require in scope, so esbuild's shim throws at runtime without this.
const requireBanner =
  "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);";

const hostFields = new Set(["name", "entry", "external", "forbidden"]);

// A misspelled `forbidden` would otherwise switch the check off without a word.
function assertHost(host) {
  for (const field of Object.keys(host)) {
    if (!hostFields.has(field)) {
      throw new Error(`host '${host.name}' has unknown field '${field}'`);
    }
  }
  if (typeof host.name !== "string" || typeof host.entry !== "string") {
    throw new Error("every host needs a string 'name' and 'entry'");
  }
}

const assetFields = new Set(["from", "to"]);

// Copied, never built: `from` is another package's finished output, produced by
// whatever builds it -- a frontend's `vite build`, say -- and this only puts it
// beside the hosts so one image build context holds everything deployable. A
// missing directory fails here rather than yielding an artifact that is quietly
// missing half of what it serves.
function assertAsset(asset) {
  for (const field of Object.keys(asset)) {
    if (!assetFields.has(field)) {
      throw new Error(`asset '${asset.from}' has unknown field '${field}'`);
    }
  }
  if (typeof asset.from !== "string" || typeof asset.to !== "string") {
    throw new Error("every asset needs a string 'from' and 'to'");
  }
  if (!existsSync(asset.from)) {
    throw new Error(`asset '${asset.from}' does not exist; build it first`);
  }
}

const packageByDir = new Map();

// The metafile names inputs by path, so a file's package is the nearest
// package.json above it that has a name. Some packages nest a nameless one,
// declaring only a module type, inside their build output.
function packageOfFile(file) {
  const visited = [];
  let dir = path.dirname(path.resolve(file));
  while (!packageByDir.has(dir)) {
    visited.push(dir);
    const manifest = path.join(dir, "package.json");
    const name = existsSync(manifest)
      ? JSON.parse(readFileSync(manifest, "utf8")).name
      : undefined;
    if (name) {
      packageByDir.set(dir, name);
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`no package owns '${file}'`);
    dir = parent;
  }
  const name = packageByDir.get(dir);
  for (const seen of visited) packageByDir.set(seen, name);
  return name;
}

function packageOfSpecifier(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

// Externals count as well as bundled files: a package kept external is still
// something the artifact needs installed beside it.
function assertNothingForbidden(host, metafile) {
  const forbidden = new Set(host.forbidden ?? []);
  if (forbidden.size === 0) return;

  const found = new Map();
  for (const file of Object.keys(metafile.inputs)) {
    const name = packageOfFile(file);
    if (forbidden.has(name) && !found.has(name)) found.set(name, file);
  }
  for (const output of Object.values(metafile.outputs)) {
    for (const imported of output.imports) {
      if (!imported.external || isBuiltin(imported.path)) continue;
      const name = packageOfSpecifier(imported.path);
      if (forbidden.has(name) && !found.has(name)) {
        found.set(name, `external import '${imported.path}'`);
      }
    }
  }

  if (found.size > 0) {
    const lines = [...found].map(([name, via]) => `  ${name} (via ${via})`);
    throw new Error(
      `host '${host.name}' contains forbidden packages:\n${lines.join("\n")}`,
    );
  }
}

try {
  hosts.forEach(assertHost);
  assets.forEach(assertAsset);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const host of hosts) {
    const result = await build({
      entryPoints: [host.entry],
      // `.mjs` marks the bundle as an ES module by itself, so it runs wherever
      // it is copied without a package.json declaring the module type.
      outfile: `${outDir}/${host.name}.mjs`,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      external: host.external ?? [],
      banner: { js: requireBanner },
      // Stack traces need only the mappings, which esbuild chains through the
      // `tsc` maps in `dist` back to TypeScript. Embedding every source's text
      // would more than quadruple the map for no gain in a trace.
      sourcemap: true,
      sourcesContent: false,
      metafile: true,
      logLevel: "warning",
    });
    await writeFile(
      `${outDir}/${host.name}.meta.json`,
      JSON.stringify(result.metafile),
    );
    assertNothingForbidden(host, result.metafile);
    console.log(`bundled ${host.name}`);
  }

  for (const asset of assets) {
    await cp(asset.from, `${outDir}/${asset.to}`, { recursive: true });
    console.log(`copied ${asset.from} to ${outDir}/${asset.to}`);
  }
} catch (error) {
  await rm(outDir, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
