import type { Command } from "commander";
import fs from "fs";
import { resolveCliPath } from "../../resolve-path.js";

import { FlowSchema } from "@lcase/specs";
import type { ServicesPort } from "@lcase/ports";

export function cliValidateAction(flowPath: string) {
  const resolvedFlowPath = resolveCliPath(flowPath);
  const raw = fs.readFileSync(resolvedFlowPath, { encoding: "utf-8" });

  try {
    const json = JSON.parse(raw);
    const result = FlowSchema.safeParse(json);
    if (result.error) {
      console.log("Invalid");
      console.log("Reason:", result.error.errors);
      return;
    }
    console.log("Valid");
  } catch (e) {
    console.log("Invalid");
    console.log("Error:", e);
  }
}
export function registerValidateCmd(program: Command, _services: ServicesPort) {
  program.command("validate <flowPath>").action(cliValidateAction);
  return program;
}
