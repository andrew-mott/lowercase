import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import { resolveCliPath } from "../../resolve-path.js";

// assume process was invoked from project root
type ManagedProcess = {
  label: string;
  child: ChildProcess;
};

async function spawnServer(
  label: string,
  absolutePath: string,
  port: number,
): Promise<ManagedProcess | undefined> {
  const child = spawn("node", [absolutePath], {
    stdio: "inherit",
    detached: false,
  });
  console.log(`[demo] spawned process; ${label} server (pid: ${child.pid})`);

  let result;

  console.log(
    `[demo] waiting on ${label} serrver health check at http://localhost:${port}/health`,
  );

  // try 30 times, wait about 500ms between tries. ~ 15secs overall
  for (let i = 0; i < 30; i++) {
    try {
      result = await fetch(`http://localhost:${port}/health`);
      break;
    } catch {
      await new Promise((r) => {
        setTimeout(r, 500);
      });
      continue;
    }
  }

  if (!result) {
    console.error(`Unable to start server ${label} on localhost port ${port}`);
    return;
  } else {
    console.log(
      `[demo] ${label} server ready; http://localhost:${port}/health returned ${result.ok}`,
    );
  }

  child.on("exit", (code, signal) => {
    console.log(
      `[demo] ${label} server exited with code ${code ?? "null"} signal ${
        signal ?? "null"
      }`,
    );
  });

  child.on("error", (error) => {
    console.error(`[demo] ${label} server had error:`, error);
  });

  return { label, child };
}

export async function startDemoServers(): Promise<
  ManagedProcess[] | undefined
> {
  // paths relative from project root
  // must be run from project root
  const transformRelPath = "examples/dist/transform.server.js";
  const unicodeRelPath = "examples/dist/unicode.server.js";
  const transformAbsPath = resolveCliPath(transformRelPath);
  const unicodeAbsPath = resolveCliPath(unicodeRelPath);

  const unicodeChild: ManagedProcess | undefined = await spawnServer(
    "unicode",
    unicodeAbsPath,
    3004,
  );

  const transformChild: ManagedProcess | undefined = await spawnServer(
    "tranform",
    transformAbsPath,
    3005,
  );

  if (!unicodeChild || !transformChild) {
    console.error("[demo] error setting up mcp servers");
    return;
  }

  return [unicodeChild, transformChild];
}
