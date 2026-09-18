import { config } from "./provision.config.js";
import { runProvision } from "./tasks/provision.js";

try {
  const { groups } = await runProvision(config);
  for (const { stream, group } of groups) {
    console.log(`[deploy-tasks] group '${group}' ready on '${stream}'`);
  }
} catch (error) {
  // A deployment waits on this exiting successfully, so a failure has to be an
  // exit code rather than only a log line.
  console.error("[deploy-tasks] provisioning failed:", error);
  process.exitCode = 1;
}
