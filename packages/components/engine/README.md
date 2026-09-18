# Engine

### New Run Requested Flow

1. Get flow graph from hash

- no flow def -> emit error

2. Get fork spec from hash (if supplied)

- no fork spec -> emit error

3. Get run index from hash (if fork spec needs it)

- no run index -> emit error

### Typical event flow

```
run.requested    { flowDefHash, forkSpecHash }
  - flowDef
  - forkSpec
  - runIndex
run.denied/accepted (run.accepted -> initialize run)
run.initialized (run.initialized - start run)
run.started (run.started -> p
step.planned
step.started
job.*.submitted
job.*.completed/failed
step.completed/failed
run.completed/failed
```

### Typical event flow

| Event                           | State Changes                           | Effects                                               |
| ------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| `run.requested`                 | Store traceId / run + hashes            | Get flowDef, forkSpec, runIndex. Emit denied/accepted |
| `run.denied`                    | Remove any piece from engine state      | Emit error                                            |
| `run.accepted`                  | Initialize run state                    |
| `run.initialized`               | Start Run by planning first step        |
| `run.started`                   | Plan first step/steps to run            |
| `step.planned`                  | Materialize whatever we need / emit job |
| `step.started`                  | Plan other steps that should run next   |
| `job.*.completed/failed`        | Decide retry logic for step             |
| `step.completed/failed/retried` | Re execute / plan next steps / end run  |
| `run.completed/failed`          | Delete state from engine                |

## how to do a simulation / forked run

###

- always run from start
- if step is reused, apply it appropriately
- if not, execute it
