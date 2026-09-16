import { serveHost } from "../http/serve.js";
import { createApiHost } from "../profiles/api-host/api-host.profile.js";
import { config } from "./api.config.js";

await serveHost("api-host", createApiHost(config));
