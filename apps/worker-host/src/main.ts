import { workerHostPlan } from "./host-plan.js";

// Scaffold entrypoint. The host plan resolves, which is enough to prove this
// process can derive its own slice of the deployment -- but nothing is
// constructed, connected, or bound yet, so this exits rather than pretending to
// be a running Worker host.
//
// What lands here: config parsing, the app-local profile (Redis carrier,
// Postgres, S3/MinIO, Worker), the managed runtime, and a signal handler that
// stops it. No drain guarantee -- see README.
const plan = workerHostPlan();
console.log(
  `[worker-host] plan resolved: role '${plan.roleId}' of manifest '${plan.manifestId}' over ${plan.carrier}`,
);
console.log("Full plan object:", JSON.stringify(plan, null, 2));
console.log("[worker-host] not runnable yet: no profile is wired.");
process.exitCode = 1;
