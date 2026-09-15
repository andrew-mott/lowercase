// Messages are routed by mailboxes the process owns. Nothing to connect to,
// nothing to provision, and no delivery survives the process.
export type InProcessMessagingUserConfig = { kind: "in-process" };

// Messages travel through Redis Streams: one stream per delivery route, one
// consumer group per logical subscription on each route it reads. A topic is
// not a stream -- the deployment decides how many routes one carries. Fields
// cover what's needed to construct a client, matching how
// S3ArtifactStoreUserConfig carries endpoint and credentials rather than a
// pre-built client.
export type RedisStreamsMessagingUserConfig = {
  kind: "redis-streams";
  url: string;
  /** Namespaces stream keys. Defaults to "lcase:". */
  keyPrefix?: string;
  /** This process's consumer name within every group. Defaults to "local". */
  consumerName?: string;
  /** How long a read blocks with nothing to read. Bounds shutdown latency. */
  blockMs?: number;
};

// Named for the mechanism, matching the other config axes (`artifacts: { kind:
// "filesystem" }`, `sql: { kind: "sqlite" }`), so the carriers sit on one axis
// rather than describing different ones.
export type MessagingUserConfig =
  InProcessMessagingUserConfig | RedisStreamsMessagingUserConfig;
