import type { ServicesPort } from "@lcase/ports";
import type { Command } from "commander";
import { resolveCliPath } from "../../resolve-path.js";

export async function cliAddAction(
  services: ServicesPort,
  pathToFlow: string,
): Promise<void> {
  console.log("[cli] add command");

  const absolutePath = resolveCliPath(pathToFlow);
  await services.flow.storeFlowInCas(absolutePath);
}

export function registerAddCmd(
  program: Command,
  services: ServicesPort,
): Command {
  program
    .command("add <pathToFlow>")
    .description("replay a run without side effects")
    .action(async (pathToFlow: string) => {
      await cliAddAction(services, pathToFlow);
    });
  return program;
}
