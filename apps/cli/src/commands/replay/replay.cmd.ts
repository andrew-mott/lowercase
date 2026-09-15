import type { ServicesPort } from "@lcase/ports";
import type { Command } from "commander";

export async function cliReplayAction(
  services: ServicesPort,
  runId: string,
): Promise<void> {
  console.log("[cli] running replay command");
  await services.replay.replayRun(runId);
}

export function registerReplayCmd(
  program: Command,
  services: ServicesPort,
): Command {
  program
    .command("replay <runId>")
    .description("replay a run without side effects")
    .action(async (runId: string) => {
      await cliReplayAction(services, runId);
    });
  return program;
}
