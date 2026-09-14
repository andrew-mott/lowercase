# @lcase/worker-host

The Worker host: one OS process that hosts `Worker` and no other component.

It resolves the `remote-worker` manifest for the `worker-host` role, consumes
the Worker command subscription over Redis Streams, executes jobs, and
publishes terminals onto the terminal topic. It never learns who reads those
terminals — Engine and Observability appear nowhere in its host plan.

## Scope

This app deliberately does **not** depend on `@lcase/profile-local-system`.
That package is the complete embedded graph, and importing it here would
install Engine, Observability, Limiter, Replay, and the app-services graph into
a process that hosts none of them. Its composition profile is app-local for the
same reason.

## Infrastructure

Redis, Postgres, and S3/MinIO — all three, and not the lightweight branches the
embedded profile also supports. Worker resolves input refs from CAS and writes
its output and declared exports back as new artifacts, so the metadata it
produces has to land where the Engine process can read it. Two processes cannot
share an `FsArtifactStore` directory or a SQLite file in a way that proves
anything about a deployment.

## Lifecycle

This process makes **no drain or stop guarantee**. Stopping ends intake, lets
the current batch of deliveries settle, and closes connections. Anything still
unread in Redis is left there. A real lifecycle contract — accepting, draining,
stopped, with an ordered host stop policy — is separate work tracked as Change
C28 of the `swappable-infrastructure` initiative's remote-worker arc.

## Commands

```bash
pnpm dev              # run from source via tsx
pnpm build
pnpm start
pnpm test             # unit
pnpm test:integration # needs docker compose up -d --wait
```
