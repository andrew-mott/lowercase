import type {
  ArtifactReadWritePort,
  ArtifactRepositoryPort,
  ArtifactStorePort,
} from "@lcase/ports";
import { ArtifactReader } from "./artifact-reader.js";
import { ArtifactWriter } from "./artifact-writer.js";

// Plain composition, not a class -- ArtifactReader/ArtifactWriter stay
// available on their own for any consumer that only wants one capability.
export function createArtifactReadWritePort(
  store: ArtifactStorePort,
  repository: ArtifactRepositoryPort,
): ArtifactReadWritePort {
  const reader = new ArtifactReader(store);
  const writer = new ArtifactWriter(store, repository);
  return {
    load: reader.load.bind(reader),
    save: writer.save.bind(writer),
  };
}
