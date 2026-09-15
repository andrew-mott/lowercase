import { createClient, type RedisClientType } from "redis";
import { RedisMessageLog } from "@lcase/adapters/message-log";
import {
  createRedisMessageRouter,
  type MessageRouter,
} from "@lcase/message-router";
import type { ResolvedHostPlan } from "@lcase/message-topology";
import type { LifecycleHooks } from "@lcase/assembly";
import type { RedisStreamsMessagingUserConfig } from "@lcase/types";

export type BuiltMessageRouter = {
  router: MessageRouter;
  hooks: LifecycleHooks<MessageRouter>;
};

export function buildMessageRouter(
  config: RedisStreamsMessagingUserConfig,
  plan: ResolvedHostPlan,
): BuiltMessageRouter {
  // Both sides are static here, so this only fires if the manifest itself is
  // changed to another carrier -- which would otherwise build Redis streams for
  // a deployment that says the Messages travel some other way.
  if (plan.carrier !== config.kind) {
    throw new Error(
      `[worker-host] messaging config selects '${config.kind}' but host plan '${plan.manifestId}' is carried by '${plan.carrier}'`,
    );
  }

  const router = createRedisMessageRouter({
    plan,
    // One connected client per call: each blocking read loop needs a connection
    // of its own, and so does publishing.
    createLog: async () => {
      const client: RedisClientType = createClient({ url: config.url });
      await client.connect();
      return new RedisMessageLog(client);
    },
    keyPrefix: config.keyPrefix,
    consumerName: config.consumerName,
    blockMs: config.blockMs,
  });

  return {
    router,
    hooks: {
      start: () => router.start(),
      stop: () => router.stop(),
    },
  };
}
