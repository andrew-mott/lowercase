# @lcase/cli

Command line interface for lowercase flows.

May expand later into a general application layer for managing lowercase
processes, as an alternative to a GUI.

## Status: only `validate` is dependable

The rest of the CLI is out of sync with the relational identity model introduced
during the SQL migration, and is paused pending a rework rather than removed:
`run` takes the three identifiers a persisted flow version has, which `add` does
not produce, and `sim` uses an older fork path with no params support. Use the
HTTP server and the workbench instead — see the
[root README](../../README.md#quickstart).

## validate

Checks a flow definition against the schema without running it.

```bash
# from the repo root
pnpm -F @lcase/cli start validate ./examples/parallel.flow.json

# or from apps/cli
pnpm start validate ./examples/parallel.flow.json
```

## The other commands

Registered and type-checked, but see the status above before reaching for them.

| Command                                      | What it does                                             |
| -------------------------------------------- | -------------------------------------------------------- |
| `run <flowId> <flowVersionId> <flowDefHash>` | Runs a persisted flow version by its relational identity |
| `add <pathToFlow>`                           | Stores a flow definition file in CAS                     |
| `sim <forkRunId>`                            | Forks a run, with `-r, --reuse <reuse...>`               |
| `replay <runId>`                             | Replays a run without side effects                       |

`--help` prints the full list. Note that `add` and `sim` currently report
`replay`'s description there, which is a copy-paste that outlived the commands it
was copied into.

The package declares a `pwp` bin pointing at `dist/main.js`, so a built checkout
can be invoked directly instead of through pnpm.
