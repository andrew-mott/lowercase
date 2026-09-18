import {
  createLocalSystem,
  type LocalSystem,
} from "@lcase/profile-local-system";
import { config } from "./runtime.config.js";

export function bootstrap(): LocalSystem {
  return createLocalSystem(config);
}
