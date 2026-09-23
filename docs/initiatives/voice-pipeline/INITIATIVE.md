# Voice Pipeline

## Summary

Make a flow that takes audio in and returns something useful possible end to end, and build only the engine pieces that flow needs. The engine was originally built to orchestrate a local speech-to-text → LLM → text-to-speech pipeline, and binary data is the part it still cannot carry: every param, export and step output today is JSON, plain text or markdown, and the only capability step, `httpjson`, sends a JSON body and reads a JSON or text response.

**Finish line: a transcription flow.** Audio in, a speech-to-text step, an LLM step that corrects the transcript (technical vocabulary especially), text out. The audio arrives as a run param, and the flow's result is the corrected text.

**Second goal: a stateless voice round trip.** The same front half, then a text-to-speech step, with audio as the flow's result. Stateless means no context carried between runs.

The two flows split the binary work in half. Transcription needs binary on the request side of a step. The round trip adds binary on the response side, plus serving that audio back out of the API.

The Initiative also pilots schema-first definitions. Every new type it introduces is written as JSON Schema first, its TypeScript type is generated from that schema, and AJV validates it. The existing Zod schemas stay as they are. This is a trial on new, isolated types, not the [`json-schema-migration`](../json-schema-migration/INITIATIVE.md) Initiative. That one moves the existing schemas and can use what this one learns.

## Design principles

Settled in discussion before any Change was written, so each Change can build on them without re-deciding them.

- **A new `http` step, beside `httpjson`.** `httpjson` stays exactly as it is at the flow step-type and event-family levels — Change C3 kept the event families additive, not reopened here. The open question this bullet originally deferred — whether `httpjson` becomes a preset of `http` — is now settled at exactly one layer, decided while scoping arc [A4](./arcs/worker-http-executor.md): the worker's _execution logic_ is shared rather than duplicated, with `httpjson`'s submission normalized into `http`'s request shape before hitting the same executor. The step-type and event layers stay separate; whether they ever unify the same way remains undecided. Adding a protocol to the worker is the extension model [ADR-0006](../../adr/0006-worker-tool-extensibility-model.md) chose, not a reopening of the worker work in `worker-tools-artifacts`.
- **Steps hand each other references, never bytes.** Binary content lives in CAS, and a step, a Message or a ref only ever carries its hash. The terminal Message already carries only the output hash and export hashes, so this extends an existing rule rather than introducing one. It is also what keeps streaming possible later: a reference can come to mean something still being written without changing how flows are authored.
- **`body` names its kind, because binary cannot be interpolated.** `{{...}}` templating inserts values into JSON, and audio can only _be_ a body or _be_ a part. The `http` step's `body` is one of:

  ```json
  { "json": { "input": "{{steps.reply.exports.text}}" } }
  { "artifact": "{{params.audio}}" }
  { "multipart": {
      "file": { "artifact": "{{params.audio}}", "filename": "input.wav" },
      "model": "…"
  } }
  ```

  `json` behaves exactly like `httpjson`'s body today. `artifact` sends the stored bytes, with `Content-Type` taken from the artifact's own metadata. `multipart` is a map of parts: a string part is templated like any other string, and an `{ artifact }` part becomes a file part. Multipart is required from the start, not a follow-up, because OpenAI-compatible speech-to-text servers (faster-whisper-server, whisper.cpp's server) take the audio as a multipart `file` part.

- **A response is stored as what it says it is.** The step's output artifact takes the response's `Content-Type`. Exports select from JSON, so they apply only when that type is JSON.
- **Messages keep the CloudEvents envelope.** A command is a CloudEvent with its own `type`, carried on the existing topics and typed through the existing `EventMap`. A `kind` extension attribute (command or event) may be added to the shared envelope, optional at first, because Messages already in replay logs and Redis streams do not carry it.
- **The capability goes in a type name only when the payload depends on it.** The command's data is the capability's request, so it is named for the capability (`job.http.<verb>`). Completed and failed data are identical for every capability, so the new family's terminals can be generic, with the capability read from the envelope's `entity`/`capid`. Only types that are actually emitted are declared. The new family does not copy the queued, started, delayed and resumed types `httpjson` declares.
- **Schema-first, bridged to Zod where Zod is the interface.** A JSON Schema file is the source of truth and AJV does the validating. Where existing code expects a Zod schema (the flow's step union, and `eventSchemaRegistry`, which `buildEvent` validates against), Zod hands the new type to the AJV validator and reports AJV's errors as its own issues, so the shape is never written twice. A Zod discriminated union cannot hold an AJV-backed member, so the step union dispatches on `type` before validating (see Change C1). A command's schema covering the whole Message this way — a shared CloudEvents envelope schema, then the `type` and `data`, existing in both Zod and JSON Schema until a migration — was the original intent here, but Change C3 found `packages/events`'s `eventSchemaRegistry` is entirely hand-rolled Zod with no AJV bridge anywhere in it, and is itself the `json-schema-migration` Initiative's (I7) refactor target. So this Initiative's schema-first trial stays scoped to flow-definition shapes, proven by C1; new job command/terminal Messages are hand-rolled the same way their siblings already are, until I7 does that migration for real.

## Change index

| Change | Description                                                   | Status        | Where | See also |
| ------ | ------------------------------------------------------------- | ------------- | ----- | -------- |
| C1     | Schema pipeline and the http step definition                  | merged (#393) | [1]   |          |
| C2     | Widen content types past JSON/text/markdown                   | merged (#394) | [2]   |          |
| C3     | The http job's command and terminal Messages                  | merged (#395) | [3]   |          |
| C4     | A shared executor for http and httpjson                       | merged (#396) | [4]   |          |
| C5     | Worker and JobRunner wiring for two submissions, one executor | merged (#397) | [4]   |          |
| C6     | Output storage stores a response as what it says it is        | merged (#398) | [4]   |          |
| C7     | Engine planning and dispatch for http                         | merged (#399) | [5]   |          |
| C8     | Accept binary uploads                                         | merged (#400) | [6]   |          |
| C9     | Wildcard param types                                          | merged (#401) | [6]   |          |
| C10    | Flow outputs                                                  | merged (#402) | [7]   |          |
| C11    | Run outputs route                                             | merged (#403) | [7]   |          |
| C12    | Artifact content route                                        | merged (#404) | [7]   |          |
| C13    | Inline run request that holds for the result                  | merged (#405) | [8]   |          |
| C14    | The transcription, speech, and conversation flows             | in progress   | [9]   |          |

[1]: ./arcs/http-step.md
[2]: ./arcs/content-types.md
[3]: ./arcs/http-job.md
[4]: ./arcs/worker-http-executor.md
[5]: ./arcs/engine-http-dispatch.md
[6]: ./arcs/binary-uploads.md
[7]: ./arcs/results-out.md
[8]: ./arcs/inline-runs.md
[9]: ./arcs/the-flows.md

## Planned arcs

Estimates, not commitments. The Change numbers are a guess at the map ahead and will move as discussion splits or merges them. A Change gets a row in the index above only once it is scoped, and each arc's file is created when we reach it and holds that arc's discussion. The order follows what each arc needs from the one before.

1. **Binary in (A6).** Small, and first because every later piece puts audio into the system through the API.
   - C8: lift the upload guard, including the `bytes` branch the save call needs.
   - C9: how a param's declared type matches an artifact's content type. An upload's type is already the part's declared `Content-Type`, and compatibility is exact equality. The multipart parser already drops parameters, so a browser's `audio/webm;codecs=opus` arrives as `audio/webm`, but a client still has to send exactly the type a param declares. Settled: wildcard matching such as `audio/*` in a param's declared type, with the worker resolving the artifact's concrete type at load time. An array of types waits until a flow needs it.
2. **Results out (A7).** What makes a run's result reachable at all.
   - C10: flow outputs, declared in the definition and validated.
   - C11: a route returning a finished run's outputs (start, then fetch), with the generic failure shape.
   - C12: a route returning one artifact's stored bytes by hash, buffered; streaming and the S3 redirect are a later addition.
3. **Inline runs (A8).** After results out, because the endpoint that takes data and the way a caller gets results back are one conversation (start and wait).
   - C13: the run request that carries its inputs inline, turns each into an artifact, and waits for the result, so one request and one response cover the whole run.
4. **The flows (A9).** The first Change reaches the finish line.
   - C14: four flows in `examples/`, each verified by posting a multipart run request to a live stack. `transcribe-audio` (one step, speech to text, the text as a flow output) and `transcribe-correct` (speech to text, then an LLM pass that corrects the transcript, returning the corrected text and the raw one) reach the finish line. `speak` (an LLM pass that rewrites text for reading aloud, then a text-to-speech step, with audio as a flow output) and `converse` (the round trip, plus conversation with context: history and a system prompt are both params, so the caller carries them across turns) are the second goal and a later target flow, both landing here rather than as separate Changes. Every service address, model name and prompt a step needs is a param, not baked into the flow, so a flow does not hardcode where its dependencies run or how they are prompted; a flow with more than one usable backend (`speak`'s two text-to-speech services, `converse` stateless or with a custom persona) is one flow taking different param values, not several flows.
   - C15: a step's whole output as another step's input when it is not JSON, with the worker's dynamic content-type check (see "Referencing a whole step output" below). No flow here needs it, so it is built when one does. May turn out small: the mechanism it needs already exists for a sibling case (a pattern-typed param), just scoped to the wrong ref kind.
5. **Binary in the workbench (A10).** Decoupled from `ArtifactIndex`'s own planned retirement — its own Change, not blocked on that timing.
   - C16: the workbench renders binary artifact types it can handle, starting with audio playback, rather than only reporting a byte count. The read route it needs (C12) is already built.

## Not yet scoped

- **Referencing a whole step output.** A ref into the fields of a JSON output already works, and so do exports. What does not work is a step's whole output as another step's input when that output is not JSON, such as audio feeding a later step's `artifact` body. A step's output has no declared type, so the worker defaults it to JSON and loading a text or binary output fails as an unresolved input. There is nothing to select with a JSON path from binary, so `{{steps.X.output}}` has to mean the whole artifact. In an `artifact` position it passes the hash through. Interpolated into a string, it makes sense only for a text output. None of the flows in this Initiative needs it: a transcript reaches the LLM step through an export, and audio that is a flow's result is returned as an output without any step reading it.

  Unlike a param, a step's output has no declared type anywhere in the flow definition — what it actually is isn't known until the step runs. So this can't be checked statically the way C2's `validateBinaryRefPosition` checks a param's declared type; the check has to be dynamic, against the real thing. The worker is the natural place for it: `ArtifactReaderPort.load(hash)`'s untyped overload already returns `{ contentType, value }` together, so resolving a `steps.X.output` ref already hands back the real content type right where it's about to be used. The worker asking itself "is this the right content type for what I'm about to do with it" at that point is the same rule `validateBinaryRefPosition` enforces for params, just checked dynamically instead of statically — not necessarily the same function, the mechanism is still open. Whether the engine also gets a pre-dispatch check, to fail before a job is even sent rather than only once the worker looks, is a separate, undecided enhancement on top.

  Confirmed in code: nothing like this exists today, not even partially. `JobRunner#resolveOneRef` (`packages/components/worker/src/job-runner.ts`) computes a ref's content type as `ref.exportType ?? "application/json"`, and `exportType` is only ever set for an export ref (`ref.valuePath[2] === "exports"`, `packages/components/engine/src/references/value-refs.ts`) — a whole-output ref never gets one, so it always falls through to the `application/json` branch and loads with that as the expected type, failing outright if the artifact is not JSON. The mechanism to fix it is not new work, though: the load-untyped-then-check-compatibility shape it would need already exists right above that fallback, for a pattern-typed param (`ref.scope === "params" && isContentTypePattern(...)`), gated to that one scope. Extending it to a whole-output ref looks like widening that condition, not building something new — what is not yet decided is what "compatible" means for a step's output, since unlike a param it has no declared type to check against; the real requirement comes from the position using it (an `artifact` slot accepts anything, a string position wants text).

- **How a binary output shows in the workbench.** Today it gets only its byte length — no preview, no playback. `ArtifactContentPanel.tsx` (`apps/workbench`) branches on `format === "bytes"` and stops there. The read route it would use (`GET /artifacts/:hash/content`) already exists and is what the finish-line flows themselves use to serve their audio, so the missing piece is the panel, not the API: getting the artifact's content type to it (available elsewhere in the system already, likely a short hop) and branching to an `<audio controls>` element pointed at that route for playable types, keeping today's message for everything else.

  Confirmed in code: nothing like this exists today, not even partially. `JobRunner#resolveOneRef` (`packages/components/worker/src/job-runner.ts`) computes a ref's content type as `ref.exportType ?? "application/json"`, and `exportType` is only ever set for an export ref (`ref.valuePath[2] === "exports"`, `packages/components/engine/src/references/value-refs.ts`) — a whole-output ref never gets one, so it always falls through to the `application/json` branch and loads with that as the expected type, failing outright if the artifact is not JSON. The mechanism to fix it is not new work, though: the load-untyped-then-check-compatibility shape it would need already exists right above that fallback, for a pattern-typed param (`ref.scope === "params" && isContentTypePattern(...)`), gated to that one scope. Extending it to a whole-output ref looks like widening that condition, not building something new — what is not yet decided is what "compatible" means for a step's output, since unlike a param it has no declared type to check against; the real requirement comes from the position using it (an `artifact` slot accepts anything, a string position wants text).

- **Naming a flow by name and version, rather than the three identifiers (`flowId`, `flowVersionId`, `flowDefHash`) a run request needs today.** Was C14, moved here rather than kept as a numbered Change: investigated directly, and the real blocker is that flow versioning doesn't work yet, not the naming route itself. `POST /api/flows` always creates a brand-new `Flow` row on every upload (`PrismaFlowRepository.createFlow` always writes `sequence: 1`), never adds a version to an existing flow by name, and `Flow.name` has no uniqueness constraint — two unrelated `Flow` rows can already share a name. Naming by name+version only works once versions actually accumulate under one `Flow` row, which they do not. Fixing that — a lookup by name, and a uniqueness decision — is its own piece of work, deliberately not taken on now; the immediate need is met instead by a small script external to the engine that uploads a flow and records the ids it gets back, which sidesteps the naming problem rather than solving it.

**Open decisions:**

- **What a caller sees for a run that failed.** The original leaning was a generic shape carrying the failed step's id and its error message. What actually shipped (C13) is simpler: the SSE `failed` message is `{ ok: false, error: "Run failed" }`, a fixed string with no step id or detail. That's a real gap from the original plan, not a deliberate narrowing — nobody decided to drop the step-level detail, C13 just didn't carry it through. Still open: whether to add it back, and if so how much (the step id alone, or its message too), given the detailed event history already holds the full account for a developer.

- How a flow declares exports on an `http` step whose response type is unknown until it runs. The flow validator could refuse them, or they could fail at runtime on a non-JSON response.

**Later target flows, not built here.** Neither obviously needs new engine features, only services the flows call.

- **Note-taking.** Transcription, then an LLM categorizes the note, then it is stored somewhere it can be searched, with a separate flow that answers questions over the stored notes (a RAG step). Storage and retrieval could be `http` steps against an external vector store or search service, so the knowledge lives in a service built for it rather than in the engine.

**Outside this Initiative:**

- **Streaming,** whether chunks of audio in, or output streamed between steps. It is its own Initiative. This one only avoids closing the door on it.
- **The `mcp` step,** which still plans and then hangs because nothing executes it. It is recorded in `docs/todo.md`.
