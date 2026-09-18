import type { Command } from "commander";
import { registerRunCmd } from "./run/run.cmd.js";
import { registerValidateCmd } from "./validate/validate.js";

import { registerReplayCmd } from "./replay/replay.cmd.js";
import { registerSimCmd } from "./sim/sim.cmd.js";
import type { ServicesPort } from "@lcase/ports";
import { registerAddCmd } from "./add/add.cmd.js";

export function registerCommands(program: Command, services: ServicesPort) {
  registerRunCmd(program, services);
  registerValidateCmd(program, services);
  registerReplayCmd(program, services);
  registerSimCmd(program, services);
  registerAddCmd(program, services);
}
