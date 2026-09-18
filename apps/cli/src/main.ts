#!/usr/bin/env node
import { Command } from "commander";
import { registerCommands } from "./commands/register-commands.js";
import { bootstrap } from "./bootstrap.js";

async function main(): Promise<void> {
  const { services, runtime } = bootstrap();

  // process's own "exit" event can't reliably await async work (Node exits
  // before the promise settles), so graceful shutdown is only attempted for
  // the two cases that can actually wait on it: normal completion below,
  // and an interrupt signal.
  const stopAndExit = async () => {
    await runtime.stop();
    process.exit(0);
  };
  process.once("SIGINT", stopAndExit);
  process.once("SIGTERM", stopAndExit);

  await runtime.start();

  const program = new Command();
  program.description("cli tool for lowercase workflows");
  registerCommands(program, services);
  await program.parseAsync();

  await runtime.stop();
}

(async () => await main())();
