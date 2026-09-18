import { createClient, type RedisClientType } from "redis";
import { RedisMessageLog } from "@lcase/adapters/message-log";
import {
  provisionRedisTopology,
  type ProvisionedRedisTopology,
} from "@lcase/message-router";
import { assertManifest } from "@lcase/message-topology";
import { jobCatalog } from "@lcase/message-topology/catalogs";
import { remoteWorker } from "@lcase/message-topology/deployments";
import type { MessageLogPort } from "@lcase/ports";
import type { RedisStreamsMessagingUserConfig } from "@lcase/types";

/**
 * The part of a host's messaging configuration that decides where streams and
 * groups live. Taken from the same type rather than restated, so provisioning
 * and the hosts cannot disagree about what a prefix is.
 */
export type ProvisionConfig = {
  messaging: Pick<RedisStreamsMessagingUserConfig, "url" | "keyPrefix">;
};

export type ConnectMessageLog = (url: string) => Promise<MessageLogPort>;

export const connectRedisMessageLog: ConnectMessageLog = async (url) => {
  const client: RedisClientType = createClient({ url });
  await client.connect();
  return new RedisMessageLog(client);
};

/**
 * Creates every stream and consumer group the `remote-worker` deployment reads,
 * then closes its connection.
 *
 * The manifest is fixed rather than selected: this is the deployment the
 * compose file runs, and provisioning another is a different call, not a flag.
 * It is validated against the catalog first, because provisioning a manifest
 * whose routes do not match its subscriptions would create groups no host
 * reads.
 */
export async function runProvision(
  config: ProvisionConfig,
  connect: ConnectMessageLog = connectRedisMessageLog,
): Promise<ProvisionedRedisTopology> {
  assertManifest(jobCatalog, remoteWorker);

  const log = await connect(config.messaging.url);
  try {
    return await provisionRedisTopology({
      manifest: remoteWorker,
      log,
      keyPrefix: config.messaging.keyPrefix,
    });
  } finally {
    await log.close();
  }
}
