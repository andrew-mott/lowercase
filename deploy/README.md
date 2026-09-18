# deploy

Compose files for running the system from images. One file per deployment shape.

| File                         | Runs                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `remote-worker.compose.yaml` | the API host and the Worker host as separate containers |

An image for the embedded host, which runs the whole system in one container, is
planned but not built yet.

## remote-worker

Named for the `remote-worker` deployment preset in `@lcase/message-topology`,
which both hosts resolve.

| Service       | Image                      | Role                                                              |
| ------------- | -------------------------- | ----------------------------------------------------------------- |
| `migrate`     | `lcase/migrate:local`      | applies pending Postgres migrations, then exits                   |
| `provision`   | `lcase/deploy-tasks:local` | creates every Redis stream and consumer group, then exits         |
| `api`         | `lcase/api:local`          | HTTP API, Engine, Observability, workbench; waits for setup tasks |
| `worker-host` | `lcase/worker-host:local`  | executes jobs; waits for `migrate` and `provision`                |
| `postgres`    | `postgres:16-alpine`       | `infra` profile only                                              |
| `minio`       | `bitnamilegacy/minio`      | `infra` profile only                                              |
| `redis`       | `redis:7-alpine`           | `infra` profile only                                              |

### Build

```bash
pnpm deploy:build
```

Bundles the two hosts and the deployment tasks, derives the Postgres schema,
and builds the four images. Images are local only; nothing is published.

### Run with its own infrastructure

```bash
pnpm deploy:up      # --profile infra up -d --wait
pnpm deploy:down    # down -v, deleting the volumes
pnpm deploy:fresh   # down -v, rebuild the images, up again
```

`deploy:fresh` is the cold start worth running after changing anything here: it
starts from empty volumes, so `migrate` and `provision` do their work for the
first time, and `--wait` fails if either exits non-zero or the API never reports
healthy. It stops short of proving a run completes — nothing here seeds a flow or
requests a run yet, so that part stays manual.

`pnpm verify` builds these images but never starts them, which is why these are
separate commands. Base images come from the local cache; refresh them
deliberately with `docker compose -f deploy/remote-worker.compose.yaml build --pull`.

Or with compose directly:

```bash
docker compose -f deploy/remote-worker.compose.yaml --profile infra up -d --wait
```

The API answers on <http://localhost:3000>, or on `API_PORT` if set, and serves
the workbench at that same address — the deployment needs nothing else running
for the frontend. Nothing else publishes a port, so this runs alongside the
repository-root `docker-compose.yml` used by integration tests.

### Run against existing infrastructure

Leave off `--profile infra` and point the hosts at your own services:

```bash
POSTGRES_DATABASE_URL=postgresql://user:pass@db.example:5432/lcase \
REDIS_URL=redis://redis.example:6379 \
S3_ENDPOINT=https://s3.example \
S3_BUCKET=lcase-artifacts \
S3_REGION=us-east-1 \
S3_ACCESS_KEY_ID=... \
S3_SECRET_ACCESS_KEY=... \
docker compose -f deploy/remote-worker.compose.yaml up -d --wait
```

Every variable defaults to the matching service in the compose file, so the
`infra` profile needs none of them.

### What sets itself up

- **Schema:** the `migrate` service runs `prisma migrate deploy` before either
  host starts. Hosts never migrate.
- **Bucket:** each host creates its S3 bucket on start if it is missing. A
  bucket that already exists is left alone.
- **Redis streams and groups:** the `provision` service creates every stream and
  consumer group in the `remote-worker` manifest before either host starts.
  Each host also creates its own on start, but only its own, and at the end of
  the stream: without `provision`, a command the API publishes before the
  Worker host has started lands on a stream with no Worker group, and the group
  the Worker host creates afterwards starts past it. Provisioning only creates,
  so running it again changes nothing. Outside compose it is
  `pnpm -F @lcase/deploy-tasks provision`, run before the hosts.

### Health

`GET /health` on the API returns each resource's health, with 200 when all are
healthy and 503 otherwise. The `api` container's healthcheck uses it, so
`up --wait` waits for the API to be ready. Today only the SQL client performs a
real check. The Worker host serves no HTTP and has no healthcheck.

### Data

| Volume          | Holds                      |
| --------------- | -------------------------- |
| `postgres-data` | the database               |
| `minio-data`    | artifact content           |
| `redis-data`    | streams                    |
| `api-data`      | the API host's replay logs |

`docker compose ... down` keeps them. `down -v` deletes them.

### Limits

- **One Worker replica.** `--scale worker-host=2` splits jobs between replicas,
  but a crashed replica's in-flight jobs are not recovered, so more than one is
  not a supported shape yet.
- **One API replica.** Engine holds each run's state in memory, so a second API
  container would receive results for runs it never started.
- **No Worker, no progress.** A run submitted while no Worker host is running
  waits in Redis until one starts. Nothing times it out or reports it as stuck.
