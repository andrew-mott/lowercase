import { createLocalSystem } from "@lcase/profile-local-system";
import { serveHost } from "../http/serve.js";
import { config } from "./embedded.config.js";

await serveHost("embedded", createLocalSystem(config));
