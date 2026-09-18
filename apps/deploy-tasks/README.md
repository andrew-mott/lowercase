# @lcase/deploy-tasks

One-shot tasks a deployment runs before its long-lived processes start. Each
task does its work and exits; none of them hosts a component.

Tasks are plain Node programs. `deploy/remote-worker.compose.yaml` runs them as
services the hosts wait on, but nothing here depends on Docker: outside it, a
task is a command run before starting the hosts, the way `pnpm db:migrate` is.

## Tasks

### `provision`

Creates every Redis stream and consumer group the `remote-worker` deployment
reads, from the manifest in `@lcase/message-topology/deployments`.

Each host creates only the groups for the subscriptions it hosts, at the end of
the stream. In a split deployment that makes start order matter: a command the
API host publishes before the Worker host has started lands on a stream with no
Worker group, and the group the Worker host creates afterwards starts past it.
Provisioning creates every group before either host starts, so nothing
published is skipped and nothing already consumed is replayed.

It only creates. Groups that already exist keep their position, so running it
again changes nothing, and it never removes a stream or group the manifest no
longer names.

| Variable    | Default                  |
| ----------- | ------------------------ |
| `REDIS_URL` | `redis://localhost:6379` |

The stream key prefix is not configurable, matching both hosts.

## Commands

```bash
pnpm build
pnpm bundle           # after build; bundle/provision.mjs
pnpm provision        # run the built task
pnpm dev:provision    # run from source via tsx
pnpm test
```
