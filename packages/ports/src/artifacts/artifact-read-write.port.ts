import type { ArtifactReaderPort } from "./artifact-reader.port.js";
import type { ArtifactWriterPort } from "./artifact-writer.port.js";

// Flat combination of the two capability modules -- callers write
// artifacts.load(...)/artifacts.save(...) directly rather than through a
// nested { reader, writer } shape. Replaces the earlier ArtifactAccessPort.
export interface ArtifactReadWritePort
  extends ArtifactReaderPort, ArtifactWriterPort {}
