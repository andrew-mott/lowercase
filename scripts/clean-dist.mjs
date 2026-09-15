// Removes the calling package's build output.
//
// Takes no argument: a package manager runs a script with that package's
// directory as the working directory, so the path is always the same from here
// even though the path *to* here differs by nesting depth.
//
// `node` rather than `rm -rf` so this works on Windows, and `fs.rmSync` rather
// than a dependency because it has been built in since Node 14.14.

import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
