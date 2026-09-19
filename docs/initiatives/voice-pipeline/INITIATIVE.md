# Voice Pipeline

## Summary

Make a flow that takes audio in and returns something useful possible end to end, and build only the engine pieces that flow needs. The engine was originally built to orchestrate a local speech-to-text → LLM → text-to-speech pipeline, and binary data is the part it still cannot carry: every param, export and step output today is JSON, plain text or markdown, and the only capability step, `httpjson`, sends a JSON body and reads a JSON or text response.

**Finish line: a transcription flow.** Audio in, a speech-to-text step, an LLM step that corrects the transcript (technical vocabulary especially), text out. The audio arrives as a run param, and the flow's result is the corrected text.

**Second goal: a stateless voice round trip.** The same front half, then a text-to-speech step, with audio as the flow's result. Stateless means no context carried between runs.

The two flows split the binary work in half. Transcription needs binary on the request side of a step. The round trip adds binary on the response side, plus serving that audio back out of the API.

The Initiative also pilots schema-first definitions. Every new type it introduces is written as JSON Schema first, its TypeScript type is generated from that schema, and AJV validates it. The existing Zod schemas stay as they are. This is a trial on new, isolated types, not the [`json-schema-migration`](../json-schema-migration/INITIATIVE.md) Initiative. That one moves the existing schemas and can use what this one learns.

## Design principles

Settled in discussion before any Change was written, so each Change can build on them without re-deciding them.

- **A new `http` step, beside `httpjson`.** `httpjson` stays exactly as it is. Whether it later becomes a preset of `http` is decided once `http` exists, not before. Adding a protocol to the worker is the extension model [ADR-0006](../../adr/0006-worker-tool-extensibility-model.md) chose, not a reopening of the worker work in `worker-tools-artifacts`.
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
- **Schema-first, bridged to Zod where Zod is the interface.** A JSON Schema file is the source of truth and AJV does the validating. Where existing code expects a Zod schema (the flow's step union, and `eventSchemaRegistry`, which `buildEvent` validates against), Zod hands the new type to the AJV validator and reports AJV's errors as its own issues, so the shape is never written twice. A Zod discriminated union cannot hold an AJV-backed member, so the step union dispatches on `type` before validating (see Change C1). A command's schema covers the whole Message: a shared CloudEvents envelope schema, then the `type` and `data`. The envelope then exists in both Zod and JSON Schema until the migration, so a test runs the same fixture Messages through both.

## Change index

| Change | Description                                  | Status    | Where | See also |
| ------ | -------------------------------------------- | --------- | ----- | -------- |
| C1     | Schema pipeline and the http step definition | in review | [1]   |          |

[1]: ./arcs/http-step.md

## Not yet scoped

Roughly in dependency order:

- **Content types beyond three.** `FlowParamContentType`, `Ref.paramType`, `Ref.exportType` and `ExportRef.type` each allow only `application/json`, `text/plain` and `text/markdown`. An `audio/wav` param needs them widened, together with `RunService`'s param checks. Uploading the audio already works: `POST /artifacts` multipart stores an unrecognised MIME type as bytes, and run params are already artifact hashes.
- **Referencing a whole step output.** Refs reach only `steps.X.exports.Y` today. A binary response has nothing to select with a JSON path, so `{{steps.X.output}}` is needed. In an `artifact` position it passes the hash through. Interpolated into a string, as when a transcript feeds an LLM prompt, it makes sense only for a text output.
- **The command and terminal Messages.** Schemas, `EventMap` entries, the registries a new type needs (`eventSchemaRegistry`, the `CloudEventContextSchema` enums, `otelAttributesRegistry`, `category.registry.ts`), and the job catalog's type unions and topic lists.
- **The worker's `http` executor.** Request materialization that reads artifact bodies from CAS rather than binding them through `bindStepRefs`, multipart encoding, and output storage by response content type.
- **Engine planning and dispatch** for the new step, and acceptance of its terminals.
- **Flow outputs.** `FlowDefinition.outputs` is parsed as an untyped record and nothing reads it. It is the natural place for "this flow's result is this artifact".
- **The read path.** A route streaming an artifact's raw bytes with its content type (today `GET /artifacts/:hash` returns only `byteLength` for bytes), and playback or download in the workbench.
- **Getting a result back to the caller.** `POST /api/runs` returns only `{ ok: true, runId }`. To get a flow's result, a client has to wait on its own (polling the run or watching `/events`), then work out which step's output is the result and fetch it. Flow outputs answer the second part. The first needs a shape: a synchronous endpoint that holds the request until the run finishes, a route returning a finished run's outputs, or both. Starting a run is also awkward from outside: the request takes `flowId`, `flowVersionId` and `flowDefHash`, so a client needs three identifiers to name one flow.
- **A client script, as the test harness.** A small Node script in `examples/`: upload a `.wav`, start the run with its hash as the param, wait, fetch the result. It is how the finish line gets verified, and it evolves in the same Changes as the API it uses, so its friction decides the result-retrieval shape rather than guesswork. The actual capture application is a separate project in its own repository. It depends only on the public HTTP API, and building it waits until that API has settled.

**Open decisions:**

- The command's name. An imperative type such as `job.http.execute`, against the past-tense `job.httpjson.submitted`.
- Generic terminals, or `job.http.completed`/`failed`. Generic terminals avoid the multiplication, but a type name alone no longer says what kind of job finished. Check whether the observability projection or the workbench branches on the terminal's type string before choosing.
- How a caller gets a run's result, which is also what the API promises to callers outside the workbench. Three shapes, each built on the one before:
  1. _Start, then fetch._ `POST /runs` returns the run ID as today, and the client waits (polling, or `/events`) and then reads a finished run's outputs route.
  2. _Start and wait._ The same request held open until the run finishes, returning its outputs, with a timeout that falls back to the run ID.
  3. _Start and stream._ One request whose response is an SSE stream: the run's step and run events as progress, then its outputs as the final event. The events and the SSE machinery already exist. A browser's `EventSource` only issues GET, so a client reads this POST response with `fetch`.

  The first is needed regardless. The second is the third without progress, so it may never be worth having separately. Leaning: build the first, and add the third if the client script shows that waiting hurts. This is progress about a run, not the streaming of audio between steps that stays outside this Initiative.

  Separately: whether a flow can be started by name and version rather than three identifiers.

- How a flow declares exports on an `http` step whose response type is unknown until it runs. The flow validator could refuse them, or they could fail at runtime on a non-JSON response.

**Later target flows, not built here.** Neither obviously needs new engine features, only services the flows call.

- **Note-taking.** Transcription, then an LLM categorizes the note, then it is stored somewhere it can be searched, with a separate flow that answers questions over the stored notes (a RAG step). Storage and retrieval could be `http` steps against an external vector store or search service, so the knowledge lives in a service built for it rather than in the engine.
- **Conversation with context.** The round trip, remembering earlier turns. The context can live in the LLM service, or the calling application can pass history in as a param. Either keeps the engine stateless per run.

**Outside this Initiative:**

- **Streaming,** whether chunks of audio in, or output streamed between steps. It is its own Initiative. This one only avoids closing the door on it.
- **The `mcp` step,** which still plans and then hangs because nothing executes it. It is recorded in `docs/todo.md`.
