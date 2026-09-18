// Removes the calling package's installed dependencies. Same working-directory
// contract as clean-dist.mjs.
//
// The retries are what make this survive Windows, where an editor, a file
// watcher, or a stray process holding a handle surfaces as EBUSY or EPERM
// rather than as a missing file. Deep trees like Electron's prebuilt binaries
// are where that actually happens, and retrying is most of what a dedicated
// removal package would have provided.

import { rmSync } from "node:fs";

rmSync("node_modules", {
  recursive: true,
  force: true,
  maxRetries: 3,
  retryDelay: 100,
});
