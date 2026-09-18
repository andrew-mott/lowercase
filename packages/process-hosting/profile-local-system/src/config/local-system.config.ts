import type {
  ArtifactStoreUserConfig,
  MessagingUserConfig,
  SqlUserConfig,
  WorkerUserConfig,
} from "@lcase/types";
import type { ObservabilityConfig } from "./observability.config.js";
import type { LimiterConfig } from "./limiter.config.js";

export type LocalSystemConfig = {
  artifacts: ArtifactStoreUserConfig;
  worker: WorkerUserConfig;
  observability: ObservabilityConfig;
  limiter: LimiterConfig;
  sql: SqlUserConfig;
  messaging: MessagingUserConfig;
};
