import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createClient, type RedisClientType } from "redis";
import {
  CreateBucketCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { RedisMessageLog } from "@lcase/adapters/message-log";
import { buildEvent } from "@lcase/events";
import {
  createPostgresTestDb,
  postgresTestDatabaseUrl,
  POSTGRES_READY_ENV,
  type TestDb,
} from "@lcase/test-support";
import { createWorkerHost } from "../src/profile/worker-host.profile.js";
import type { WorkerHostConfig } from "../src/profile/worker-host.config.js";

// This host is the first process to need all three backends at once, so all
// three gate it. Skipped rather than failed when one is absent: not having
// started a container is the expected path locally, and CI supplies every one.
const redisUrl = process.env.REDIS_TEST_URL;
const s3Endpoint = process.env.S3_TEST_ENDPOINT;
const bucket = process.env.S3_TEST_BUCKET ?? "artifacts-test";
const credentials = {
  accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "minioadmin",
  secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "minioadmin",
};
const live =
  Boolean(redisUrl) &&
  Boolean(s3Endpoint) &&
  process.env[POSTGRES_READY_ENV] === "1";

// Route ids, not topic ids: the deployment decides how many streams a topic
// travels, and the terminal topic travels two. Spelled out rather than derived
// from the plan because host-plan.test.ts already pins them -- a change there
// fails by name instead of as a timeout here.
const COMMAND_ROUTE = "job.command-work.v1";
const TERMINAL_ROUTE = "job.terminal-work.v1";

describe.skipIf(!live)("worker-host against live backends", () => {
  let db: TestDb;
  let server: http.Server;
  let toolUrl: string;
  let s3: S3Client;

  beforeAll(async () => {
    // Provisions this worker's database from the migrated template. The URL in
    // the config names that same database; this is what puts a schema in it.
    db = await createPostgresTestDb();

    // Nothing in the process creates the bucket, so the fixture does. The
    // adapter's own contract suite provisions its bucket the same way.
    s3 = new S3Client({
      endpoint: s3Endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials,
    });
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (
        name !== "BucketAlreadyOwnedByYou" &&
        name !== "BucketAlreadyExists"
      ) {
        throw error;
      }
    }

    // The tool the job calls. Local and ephemeral on purpose: the protocol
    // executor is built inside `buildWorker`, so there is no seam to stub a
    // fetch through -- the job has to reach something real.
    //
    // The response is constant, which is why nothing deletes the stored object
    // afterwards: a content hash is the key, so every run writes the same one.
    // Returning anything varying from here would leave a new object per run.
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ greeting: "hello" }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    toolUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/greet`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.dispose();
  });

  // Hygiene, not a correctness requirement. The repository upserts, so a worker
  // re-putting identical content is idempotent by design, and a completed
  // terminal already proves both writes landed this run -- a failed metadata
  // write returns "content-only", which Worker turns into a failed job.
  //
  // It earns its place the moment a test asserts on absence or on a row count,
  // because the database outlives the run: `dispose` keeps it for the next file
  // on this worker, and content-addressed hashes mean the same response body
  // yields the same primary key every time.
  beforeEach(async () => {
    await db.reset();
  });

  // A fresh prefix per host, so streams and consumer groups never carry state
  // between runs. Nothing in Redis is worth preserving here.
  function config(): WorkerHostConfig {
    return {
      worker: {
        maxConcurrentJobs: 4,
        protocolTimeoutMs: 5_000,
        maxConcurrencyPerKey: 2,
      },
      sql: { kind: "postgres", url: postgresTestDatabaseUrl() },
      artifacts: {
        kind: "s3",
        bucket,
        endpoint: s3Endpoint,
        region: "us-east-1",
        forcePathStyle: true,
        credentials,
      },
      messaging: {
        kind: "redis-streams",
        url: redisUrl!,
        keyPrefix: `lcase-test:${Date.now()}-${Math.random().toString(36).slice(2)}:`,
        // Bounds how long stop() waits on a blocking read.
        blockMs: 50,
      },
    };
  }

  async function entriesOn(client: RedisClientType, stream: string) {
    const entries = await client.xRange(stream, "-", "+");
    return entries.map((e) => JSON.parse(e.message["payload"]!));
  }

  // The claim the unit tests cannot make: composition is one thing, and reaching
  // a real Postgres, a real bucket and real Redis streams is another. Start is
  // also where an unreachable backend is supposed to surface -- the process
  // reports it and rolls back rather than discovering it inside the first job.
  it("starts and stops against all three backends", async () => {
    const { runtime } = createWorkerHost(config());

    const started = await runtime.start();
    expect(started.ok).toBe(true);

    const stopped = await runtime.stop();
    expect(stopped).toEqual({ ok: true, errors: [] });
  });

  // Why the artifact store is a managed resource at all. Constructing an
  // S3Client reaches nothing, so without a start hook this process would report
  // a healthy start and only discover the bucket was wrong inside whichever job
  // ran first -- having already consumed the command that carried it.
  it("fails to start when the bucket does not exist", async () => {
    const base = config();
    const { runtime } = createWorkerHost({
      ...base,
      artifacts: { ...base.artifacts, bucket: `lcase-absent-${Date.now()}` },
    });

    const started = await runtime.start();

    expect(started.ok).toBe(false);
    if (started.ok) throw new Error("expected failure");
    expect(started.failedResourceId).toBe("artifacts");
    // SQL had already started and is disconnected again; the router never
    // started, so nothing is consuming and no stream was provisioned.
    expect(started.rollback.ok).toBe(true);
  });

  // The process boundary, proven in one process. The command is appended
  // straight onto the stream by a client that holds no plan, no router and no
  // binding -- so nothing in this test knows how Worker is wired, only where the
  // deployment says the Messages travel. An Engine would read the terminal from
  // exactly this stream, and C26 is what puts one there.
  it("answers a command on the command route with a terminal on the terminal route", async () => {
    const cfg = config();
    const prefix = cfg.messaging.keyPrefix!;
    const { runtime } = createWorkerHost(cfg);

    const started = await runtime.start();
    expect(started.ok).toBe(true);

    const client = createClient({ url: redisUrl }) as RedisClientType;
    await client.connect();

    try {
      const command = buildEvent(
        "job.httpjson.submitted",
        { url: toolUrl, refs: [] },
        {
          flowid: "flow-1",
          flowversionid: "flowversion-1",
          runid: "run-1",
          stepid: "step-1",
          jobid: "job-1",
          capid: "httpjson",
          toolid: "httpjson",
          source: "lowercase://engine",
        },
      );

      await new RedisMessageLog(client).publish(
        [`${prefix}${COMMAND_ROUTE}`],
        command,
      );

      const terminals = await vi.waitFor(
        async () => {
          const found = await entriesOn(client, `${prefix}${TERMINAL_ROUTE}`);
          expect(found).toHaveLength(1);
          return found;
        },
        { timeout: 10_000, interval: 50 },
      );

      expect(terminals[0]).toMatchObject({
        type: "job.httpjson.completed",
        jobid: "job-1",
        runid: "run-1",
        stepid: "step-1",
        // Stamped by composition, not by Worker: this is the value
        // `buildWorker` supplies as the component's identity.
        source: "lowercase://worker",
      });

      // The terminal carries a hash, not content. Everything below is the other
      // half of the deployment claim: the process that ran the job put the bytes
      // somewhere a different process can read them, and recorded that it did.
      const hash: string = terminals[0].data.output;
      expect(hash).toEqual(expect.any(String));

      // Blob in shared object storage. This is also the only thing in the suite
      // that touches S3 at all -- the store has no start hook, so a wrong bucket
      // reaches here and nowhere earlier.
      const object = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: hash }),
      );
      const stored = await object.Body!.transformToString();
      expect(JSON.parse(stored)).toEqual({ greeting: "hello" });

      // Metadata in shared SQL, keyed by the same hash. Flow and version are
      // null because the worker's content-put path never sets them -- curation
      // is deliberate and separate.
      const row = await db.client.artifact.findUnique({ where: { hash } });
      expect(row).toMatchObject({
        hash,
        contentType: "application/json",
        curated: false,
        flowId: null,
        flowVersionId: null,
      });
    } finally {
      await client.quit();
      await runtime.stop();
    }
  });
});
