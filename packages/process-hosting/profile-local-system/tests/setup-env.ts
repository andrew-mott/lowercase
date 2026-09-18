import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Loads the repo root's .env.test.local (gitignored, see
// .env.test.local.example) into process.env before any integration test
// file's top-level `process.env.X` reads run. Doesn't override already-set
// vars (dotenv's default), so CI's workflow-level env: values -- and any
// local shell export -- still win over this file. Same setup as
// packages/adapters/tests/setup-env.ts.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
config({ path: path.join(repoRoot, ".env.test.local") });
