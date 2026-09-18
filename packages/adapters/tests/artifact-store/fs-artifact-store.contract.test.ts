import { afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { FsArtifactStore } from "../../src/artifact-store/fs-artifact-store.js";
import { runArtifactStoreContractTests } from "./artifact-store.contract.js";

const filePath = path.dirname(fileURLToPath(import.meta.url));
const testPath = path.join(filePath, "test-artifacts-contract-fs");

afterEach(async () => {
  await rm(testPath, { recursive: true, force: true });
});

runArtifactStoreContractTests(
  "FsArtifactStore",
  () => new FsArtifactStore(testPath),
);
