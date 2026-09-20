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
| C8     | Accept binary uploads                                         | in progress   | [6]   |          |

[1]: ./arcs/http-step.md
[2]: ./arcs/content-types.md
[3]: ./arcs/http-job.md
[4]: ./arcs/worker-http-executor.md
[5]: ./arcs/engine-http-dispatch.md
[6]: ./arcs/binary-uploads.md

## Planned arcs

Estimates, not commitments. The Change numbers are a guess at the map ahead and will move as discussion splits or merges them. A Change gets a row in the index above only once it is scoped, and each arc's file is created when we reach it and holds that arc's discussion. The order follows what each arc needs from the one before.

1. **Binary in (A6).** Small, and first because every later piece puts audio into the system through the API.
   - C8: lift the upload guard, including the `bytes` branch the save call needs.
   - C9: how a param's declared type matches an artifact's content type. An upload's type is already the part's declared `Content-Type`, and compatibility is exact equality. The multipart parser already drops parameters, so a browser's `audio/webm;codecs=opus` arrives as `audio/webm`, but a client still has to send exactly the type a param declares. The likely shape is wildcard matching such as `audio/*` in a param's declared type. An array of types is the alternative if wildcards prove too loose. The upload size limit (currently about 1 GB, buffered in memory) is lowered in C8.
2. **Results out (A7).** What makes a run's result reachable at all.
   - C10: flow outputs, declared in the definition and validated.
   - C11: a route returning a finished run's outputs (start, then fetch), with the generic failure shape.
   - C12: the raw-bytes read path, streaming through the API, with the S3 redirect as a later addition.
3. **Inline runs (A8).** After results out, because the endpoint that takes data and the way a caller gets results back are one conversation (start and wait).
   - C13: the run request that carries its inputs inline, turns each into an artifact, and waits for the result, so one request and one response cover the whole run.
   - C14: naming a flow by name and version rather than three identifiers, if the discussion keeps it separate from C13.
4. **The flows (A9).** The first Change reaches the finish line.
   - C15: the transcription flow and the client script.
   - C16: `{{steps.X.output}}`, with the worker's dynamic content-type check.
   - C17: the text-to-speech round trip. The later target flows follow.

## Not yet scoped

Detail behind the arcs above, roughly in dependency order:

- **Starting a run with its inputs inline.** Today a client uploads each input as an artifact, then starts the run with the hashes as params. An application capturing audio should instead be able to send the audio and the flow it wants in one request, with the run path turning each part into an artifact and binding it to a param. One shape: a multipart request whose part names are param names. The open questions are how the flow is named (see the identifiers point under "Getting a result back to the caller"), how a non-file part is typed against its declared param, and where the artifact-creating step sits, since `RunService` deliberately depends only on ports and would need the artifact service or writer injected.
- **Referencing a whole step output.** Refs reach only `steps.X.exports.Y` today. A binary response has nothing to select with a JSON path, so `{{steps.X.output}}` is needed. In an `artifact` position it passes the hash through. Interpolated into a string, as when a transcript feeds an LLM prompt, it makes sense only for a text output.

  Unlike a param, a step's output has no declared type anywhere in the flow definition — what it actually is isn't known until the step runs. So this can't be checked statically the way C2's `validateBinaryRefPosition` checks a param's declared type; the check has to be dynamic, against the real thing. The worker is the natural place for it: `ArtifactReaderPort.load(hash)`'s untyped overload already returns `{ contentType, value }` together, so resolving a `steps.X.output` ref already hands back the real content type right where it's about to be used. The worker asking itself "is this the right content type for what I'm about to do with it" at that point is the same rule `validateBinaryRefPosition` enforces for params, just checked dynamically instead of statically — not necessarily the same function, the mechanism is still open. Whether the engine also gets a pre-dispatch check, to fail before a job is even sent rather than only once the worker looks, is a separate, undecided enhancement on top.

- **Flow outputs.** `FlowDefinition.outputs` is parsed as an untyped record and nothing reads it. It is the natural place for "this flow's result is this artifact".
- **The read path.** A route streaming an artifact's raw bytes with its content type (today `GET /artifacts/:hash` returns only `byteLength` for bytes), and playback or download in the workbench.
- **Getting a result back to the caller.** `POST /api/runs` returns only `{ ok: true, runId }`. To get a flow's result, a client has to wait on its own (polling the run or watching `/events`), then work out which step's output is the result and fetch it. Flow outputs answer the second part. The first needs a shape: a synchronous endpoint that holds the request until the run finishes, a route returning a finished run's outputs, or both. Starting a run is also awkward from outside: the request takes `flowId`, `flowVersionId` and `flowDefHash`, so a client needs three identifiers to name one flow.
- **A client script, as the test harness.** A small Node script in `examples/`: upload a `.wav`, start the run with its hash as the param, wait, fetch the result. It is how the finish line gets verified, and it evolves in the same Changes as the API it uses, so its friction decides the result-retrieval shape rather than guesswork. The actual capture application is a separate project in its own repository. It depends only on the public HTTP API, and building it waits until that API has settled.

**Open decisions:**

- How a caller gets a run's result, which is also what the API promises to callers outside the workbench. Three shapes, each built on the one before:
  1. _Start, then fetch._ `POST /runs` returns the run ID as today, and the client waits (polling, or `/events`) and then reads a finished run's outputs route.
  2. _Start and wait._ The same request held open until the run finishes, returning its outputs, with a timeout that falls back to the run ID.
  3. _Start and stream._ One request whose response is an SSE stream: the run's step and run events as progress, then its outputs as the final event. The events and the SSE machinery already exist. A browser's `EventSource` only issues GET, so a client reads this POST response with `fetch`.

  The first is needed regardless, as the fallback when a held request times out. The second is the third without progress. Leaning: build the first, then the second together with inline runs, because a capture client (an application, or something as small as a hotkey-triggered shortcut) wants one request carrying the audio and the flow and one response carrying the result. Add the third if the client script shows that waiting hurts. A held request has a limit, and a run that outlasts it answers with the run ID so the caller falls back to the first shape. A text output comes back inline in the response, and a binary output as a reference to the read route, since it cannot sit inside JSON. Whether a flow with a single output can answer with the raw body is open. This is progress about a run, not the streaming of audio between steps that stays outside this Initiative.

  Separately: whether a flow can be started by name and version rather than three identifiers.

- How result bytes reach the caller. Leaning: the read route streams them through the API, because the filesystem store has nothing to sign a URL with and the embedded deployment must work too. On the S3 store the same route can answer with a redirect to a short-lived URL instead, so clients never see which backend they are on. Two things to check before relying on that: the client has to be able to reach the S3 endpoint (MinIO on a compose-internal network may not be reachable), and URL lifetime belongs to the deferred security pass.

- How a binary output shows in the workbench, which today gets only its byte length.

- What a caller sees for a run that failed. Leaning: the route returning a run's outputs has one generic shape for every flow: the run's status, its outputs when it succeeded, and on failure the failed step's id and error message. A flow does not declare its own failure results. Most failures (a server error, a timeout, an unresolved ref) belong to the run rather than to what the flow's author intended, and a declared failure result would imply routing to it, which is closer to error branches than to output declarations. Declaring one later is an additive field beside `outputs`. Open within that: how much of the failure to expose by default. The detailed event history already holds the full account for a developer, so the default may be no more than a status and a short message, with the step id as the one field to decide on.

- How a flow declares exports on an `http` step whose response type is unknown until it runs. The flow validator could refuse them, or they could fail at runtime on a non-JSON response.

**Later target flows, not built here.** Neither obviously needs new engine features, only services the flows call.

- **Note-taking.** Transcription, then an LLM categorizes the note, then it is stored somewhere it can be searched, with a separate flow that answers questions over the stored notes (a RAG step). Storage and retrieval could be `http` steps against an external vector store or search service, so the knowledge lives in a service built for it rather than in the engine.
- **Conversation with context.** The round trip, remembering earlier turns. The context can live in the LLM service, or the calling application can pass history in as a param. Either keeps the engine stateless per run.

**Outside this Initiative:**

- **Streaming,** whether chunks of audio in, or output streamed between steps. It is its own Initiative. This one only avoids closing the door on it.
- **The `mcp` step,** which still plans and then hangs because nothing executes it. It is recorded in `docs/todo.md`.
