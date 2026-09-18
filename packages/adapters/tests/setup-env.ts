import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Loads the repo root's .env.test.local (gitignored, see
// .env.test.local.example) into process.env before any integration test
// file's top-level `process.env.X` reads run. Doesn't override already-set
// vars (dotenv's default), so CI's workflow-level env: values -- and any
// local shell export -- still win over this file.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
config({ path: path.join(repoRoot, ".env.test.local") });

// .env second, so anything test-specific above wins. It is loaded at all
// because POSTGRES_HOST_PORT lives there: docker compose reads that file
// natively when publishing the port, and the Prisma configs already read it, so
// the suites reading it too is what makes one variable move all three.
config({ path: path.join(repoRoot, ".env") });
