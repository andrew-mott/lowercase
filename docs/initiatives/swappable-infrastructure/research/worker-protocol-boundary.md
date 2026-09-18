# C12 Worker input-shape clarification

Please revise the C12 plan around the following distinction. This is a clarification of the Worker target, not a new architecture.

## Core decision

The full `job.httpjson.submitted` Message remains at the Worker root throughout execution and terminal construction.

`JobRunner` should not receive that envelope or a renamed copy of its metadata. It should receive a narrow, protocol-specific projection containing only the work it performs.

The existing `ExecuteJobCommand` is a transitional amalgam from the direct-call architecture. It combines:

- Message-derived identity;
- executable HTTP work; and
- process-local execution mechanics.

It must not become the permanent JobRunner contract.

## Updated durable target

```typescript
type HttpJsonSubmission = MessageOf<"job.httpjson.submitted">;

type SubmittedData = HttpJsonSubmission["data"];

type WorkerExecution = {
  readonly submission: HttpJsonSubmission;
  readonly signal?: AbortSignal;
  // Add attemptId only after execution attempts have real semantics.
};

type HttpJsonWork = {
  readonly protocol: ProtocolRequest;
  readonly refs: SubmittedData["refs"];
  readonly exportRefs?: NonNullable<SubmittedData["exportRefs"]>;
};

type JobRunContext = {
  readonly permitRequestId: string;
  readonly signal?: AbortSignal;
};
```

Conceptually:

```text
HttpJsonSubmission
  -> Worker retains WorkerExecution
  -> projects HttpJsonWork + JobRunContext
  -> JobRunner returns JobRunOutcome
  -> Worker combines submission + outcome
  -> terminal Message
```

Responsibilities:

- `HttpJsonSubmission`: canonical inter-component protocol and complete metadata.
- `WorkerExecution`: Worker-root context containing the origin and any real process-local control.
- `HttpJsonWork`: the executable HTTP request template, input refs, and export-ref declarations.
- `JobRunContext`: mechanics JobRunner needs for this invocation.
- `JobRunOutcome`: modeled execution result without copied job identity.

The README’s existing `JobRunInput` wording was illustrative, not a separately required type. Prefer the concrete `HttpJsonWork` name now. Do not maintain both names for the same flat DTO.

If a combined runner parameter later becomes useful, it may be:

```typescript
type JobRunInput = {
  readonly work: HttpJsonWork;
  readonly context: JobRunContext;
};
```

Do not let it become another flattened identity and dependency bag.

## What C12 should do now

C12 is still an inert boundary Change: it adds decisions and Worker-side behavior but does not activate the mailbox path.

For the safest transition:

1. Introduce `HttpJsonWork` as the input to `JobRunner`.
2. Pass permit/cancellation mechanics separately through `JobRunContext` or equivalent explicit parameters.
3. Add Worker's real submitted-Message handler.
4. Retain the complete submission at Worker until terminal publication has reached admission.
5. Build the terminal from the original submission plus `JobRunOutcome`.
6. Keep the expanded `ExecuteJobCommand` only where necessary for the still-live direct `Worker.execute()` compatibility path.
7. Do not let the legacy command remain the JobRunner contract or grow new fields.
8. Leave the new handler, topology, and terminal publisher unbound so the direct path remains the sole live authority during C12.

It is acceptable for the Message handler to cross a small, explicitly temporary compatibility projection during C12 if that avoids manufacturing a fake Message for the direct path or introducing awkward dual-origin plumbing.

C13 should delete together:

- `Worker.execute()`;
- `JobExecutionPort`;
- `JobExecutionRequest` and `JobExecutionOutcome`;
- the direct-path mapper;
- the expanded `ExecuteJobCommand`;
- copied identity in `JobResult`; and
- any remaining compatibility-only projection.

After C13, Worker orchestration should operate from `WorkerExecution`, while JobRunner sees only `HttpJsonWork` and its minimal run context.

Code comments should describe this as temporary direct-boundary compatibility without embedding Change numbers.

## Field decisions

### Use `exportRefs`, not `exports`

The input values are export-reference declarations. Produced `exports` are artifact references.

Keeping `exportRefs`:

- matches the Message schema;
- avoids a spelling-only translation; and
- prevents input declarations from being confused with produced outputs.

### Permit identity

For C12, use:

```typescript
permitRequestId: execution.submission.jobid;
```

The current permit `requestId` is only a diagnostic/telemetry label. Permit release is keyed by the separately generated `grantId`.

This is not execution-attempt identity. Do not retain or recreate `executionId = jobid`.

When retries or redelivery create real attempts, add a genuine `attemptId` to `WorkerExecution` or `JobRunContext` and decide separately where it is required.

Update the Worker README/migration language that currently recommends the submitted Message ID so the documents make one consistent choice.

### `resourceHint`

`resourceHint` has no producer and no corresponding submitted-Message field.

Omit it from `HttpJsonWork` for C12 unless a real Worker-owned or runtime-owned source is established. Do not expand the inter-component Message merely to preserve an unused field.

### `args`

The submitted HTTP data contains `args`, but the current Worker mapper and HTTP execution path ignore it.

For C12, preserve that behavior deliberately:

- omit `args` from `HttpJsonWork`;
- document or test that it currently has no HTTP execution semantics; and
- leave schema cleanup or new semantics to separate work.

Do not spread all of `submission.data` into the work object and accidentally imply support.

### Body type

`ProtocolRequest.body` currently requires `JsonValue`, while the submitted schema exposes `ShallowJsonValue`.

Keep any necessary cast in one explicit semantic projection for C12. If the change remains small, the more honest eventual model is for the unresolved protocol template to retain the submitted body type and perform the `JsonValue` assertion only when producing the resolved, wire-ready request.

## Future extension

If Worker later executes another protocol, extend from the proven shapes:

```typescript
type JobWork = HttpJsonWork | McpWork;
```

Do not generalize C12 around hypothetical protocols.

## C12 review checks

C12 should demonstrate that:

- Worker receives and retains the literal submitted Message.
- JobRunner imports no Message envelope or carrier type.
- JobRunner receives no copied run, step, trace, source, or CloudEvent metadata.
- `HttpJsonWork` contains only execution data.
- process-local signal and permit diagnostics stay outside Message data.
- expected outcomes produce exactly one terminal through Worker-owned construction.
- unexpected throws reject the handler without fabricating a terminal.
- terminal admission is awaited.
- the direct path remains the only active path until the atomic C13 flip.
- no fake Message, attempt ID, or `resourceHint` producer is invented for migration convenience.
