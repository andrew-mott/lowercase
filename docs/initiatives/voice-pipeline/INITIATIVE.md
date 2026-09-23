# Voice Pipeline

**Status: Complete — Changes #393–#407 merged to `main`.**

## Summary

Made a flow that takes audio in and returns something useful possible end to end, building only the engine pieces that flow needed. The engine was originally built to orchestrate a local speech-to-text → LLM → text-to-speech pipeline, and binary data was the part it couldn't carry: every param, export and step output was JSON, plain text or markdown only, and the one capability step, `httpjson`, could only send and read JSON.

**Finish line reached: a transcription flow.** Audio in, a speech-to-text step, an LLM step that corrects the transcript (technical vocabulary especially), text out — `transcribe-audio` and `transcribe-correct` in `examples/`. The audio arrives as a run param, and the flow's result is the corrected text.

**Second goal reached too: a stateless voice round trip, and further.** `speak` does the same front half in reverse (text in, a text-to-speech step, audio as the result), and `converse` turned into a full conversational round trip — history and a system prompt as caller-supplied params, since the flow itself carries no state — landing sooner than planned because it needed nothing the other three hadn't already proven.

Getting there meant binary moving both directions through the whole system: a new `http` step whose body can be JSON, raw artifact bytes, or multipart form data; wildcard param types (`audio/*`) so a caller can send whatever real encoding a browser or device produces; a step's output stored under its response's own content type; declared flow outputs and a route to fetch a finished run's result (or one inline multipart request that holds for it); and a route serving an artifact's raw bytes by hash, which is also what finally let an audio artifact play back in the workbench instead of only reporting a byte count. A small local web client, outside the repo's package workspace, was built alongside the later flows just to record audio and exercise them by hand.

The Initiative also piloted schema-first definitions on the side: new types written as JSON Schema first, generated into TypeScript, validated by AJV — scoped deliberately to flow-definition shapes only. Job command and terminal Messages stayed hand-rolled Zod; bridging `packages/events` for real is the [`json-schema-migration`](../json-schema-migration/INITIATIVE.md) Initiative's job, not this one's.

Deliberately not part of this, investigated and recorded rather than built because no flow here actually needed them (see "Not yet scoped"): naming a flow by name and version, a step consuming another step's whole non-JSON output, and retiring the legacy `format` column in favor of real content types everywhere.

## Design principles

Settled in discussion before any Change was written, so each Change can build on them without re-deciding them.

- **A new `http` step, beside `httpjson`.** `httpjson` stays exactly as it is at the flow step-type and event-family levels. Whether `httpjson` becomes a preset of `http` is settled at one layer only: the worker's _execution logic_ is shared rather than duplicated, with `httpjson`'s submission normalized into `http`'s request shape before hitting the same executor (arc [A4](./arcs/worker-http-executor.md)). The step-type and event layers stay separate; whether they ever unify the same way remains undecided. Adding a protocol to the worker is the extension model [ADR-0006](../../adr/0006-worker-tool-extensibility-model.md) chose, not a reopening of the worker work in `worker-tools-artifacts`.
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
- **Messages keep the CloudEvents envelope.** A command is a CloudEvent with its own `type`, carried on the existing topics and typed through the existing `EventMap`. No separate field distinguishes a command from an event — that distinction lives in the `type` string itself, same as every other family.
- **The capability goes in a type name only when the payload depends on it.** The command's data is the capability's request, so it is named for the capability (`job.http.<verb>`). Completed and failed data are identical for every capability, so the new family's terminals can be generic, with the capability read from the envelope's `entity`/`capid`. Only types that are actually emitted are declared. The new family does not copy the queued, started, delayed and resumed types `httpjson` declares.
- **Schema-first, bridged to Zod where Zod is the interface.** A JSON Schema file is the source of truth and AJV does the validating. Where existing code expects a Zod schema (the flow's step union), Zod hands the new type to the AJV validator and reports AJV's errors as its own issues, so the shape is never written twice. A Zod discriminated union cannot hold an AJV-backed member, so the step union dispatches on `type` before validating (Change C1). Scoped to flow-definition shapes only: job command and terminal Messages stay hand-rolled Zod like their siblings, since `packages/events`'s `eventSchemaRegistry` has no AJV bridge anywhere in it — bridging it is the `json-schema-migration` Initiative's (I7) job, not this one's.

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
| C14    | The transcription, speech, and conversation flows             | merged (#406) | [9]   |          |
| C15    | Audio playback in the workbench                               | merged (#407) | [10]  |          |

[1]: ./arcs/http-step.md
[2]: ./arcs/content-types.md
[3]: ./arcs/http-job.md
[4]: ./arcs/worker-http-executor.md
[5]: ./arcs/engine-http-dispatch.md
[6]: ./arcs/binary-uploads.md
[7]: ./arcs/results-out.md
[8]: ./arcs/inline-runs.md
[9]: ./arcs/the-flows.md
[10]: ./arcs/binary-in-the-workbench.md

## Not yet scoped

- **Referencing a whole step output.** A ref into the fields of a JSON output already works, and so do exports. What does not work is a step's whole output as another step's input when that output is not JSON, such as audio feeding a later step's `artifact` body. A step's output has no declared type, so the worker defaults it to JSON and loading a text or binary output fails as an unresolved input. There is nothing to select with a JSON path from binary, so `{{steps.X.output}}` has to mean the whole artifact. In an `artifact` position it passes the hash through. Interpolated into a string, it makes sense only for a text output. None of the flows in this Initiative needs it: a transcript reaches the LLM step through an export, and audio that is a flow's result is returned as an output without any step reading it.

  Unlike a param, a step's output has no declared type anywhere in the flow definition — what it actually is isn't known until the step runs. So this can't be checked statically the way C2's `validateBinaryRefPosition` checks a param's declared type; the check has to be dynamic, against the real thing. The worker is the natural place for it: `ArtifactReaderPort.load(hash)`'s untyped overload already returns `{ contentType, value }` together, so resolving a `steps.X.output` ref already hands back the real content type right where it's about to be used. The worker asking itself "is this the right content type for what I'm about to do with it" at that point is the same rule `validateBinaryRefPosition` enforces for params, just checked dynamically instead of statically — not necessarily the same function, the mechanism is still open. Whether the engine also gets a pre-dispatch check, to fail before a job is even sent rather than only once the worker looks, is a separate, undecided enhancement on top.

  Confirmed in code, and sized two ways. The full version — a real declared type for a step's whole output, checked at both author time and run time — touches three layers, not one: `Ref.exportType` is typed `TextSafeContentType` on purpose, deliberately excluding binary (`packages/types/src/flow-analysis/types.ts`), so a new field capable of holding a binary pattern is needed there and on the wire (`packages/events/src/schemas/job/job.data.schema.ts`); the step schema itself (`packages/specs/src/schemas/http.step.schema.json`) has no slot to declare it; and `validateBinaryRefPosition` (`packages/functional-core/flow-analysis/src/analyze-references.ts`) explicitly only checks `ref.scope === "params"` today — its own doc comment says "only params can be binary today" — so it would need widening to keep the same author-time safety net for a step's whole output.

  A worker-only version is real and much smaller, though. `JobRunner#resolveOneRef` already writes a ref's dynamically-resolved content type back onto `paramType` regardless of the ref's original scope, and `materialize-http-request.ts`'s `resolveBinary` (which sets the outgoing request's content type for an artifact/multipart body) reads `.paramType` without caring how it got set — so if `#resolveOneRef` learned to load a whole-output ref untyped and pass its real content type through (only for the whole-value, artifact-bind-path case; a JSON sub-path access into a step's output still needs the existing JSON branch), that content type would already reach the outgoing request for free, no schema or wire-schema change needed. What this version gives up: no author-time position check (a misused ref still only fails at run time, same as today, just with a different error), and no declared expectation a step can check the source's actual output against — it accepts whatever bytes are there. If this ever gets built without a concrete need forcing the fuller version, the worker-only one is the one to reach for first.

- **Retiring the `format` column in favor of content type.** `Artifact.format` (`json`/`text`/`markdown`/`bytes`) predates binary support and is already redundant at the point of writing, by the code's own admission: `ArtifactWriter.save()` (`packages/artifacts/src/artifact-writer.ts`) takes only `content` and `contentType`, and computes `format` solely to keep the column populated ("keeps the legacy `format` column populated," per its own comment); `artifact.service.ts#createArtifact` likewise resolves a real `contentType` first and only falls back to `defaultContentTypeForFormat(input.format)` when the caller gave none. The one place `format` still earns its keep is `ArtifactPutInput`'s discriminated union, which needs some discriminant to type `value` per branch (`JsonValue`/`string`/`Uint8Array`) — a narrow, local need, not a reason to keep the column.

  The read side is the real blocker, and it is a real one: the DB column, `ArtifactIndex`/`ArtifactListItem`, `GetArtifactRes`, and (before C15) at least six `apps/workbench` files all branched on the four-way bucket, which collapses every binary artifact into one undifferentiated `"bytes"` case regardless of what it actually is. C15 migrated one of those six, `ArtifactContentPanel.tsx`, onto real content type (see [arc A10](./arcs/binary-in-the-workbench.md)); still branching on `format` are `RunInputRow.tsx`, `StepOutputExportsPanel.tsx`, `ArtifactHashLoader.tsx`, `ref-resolution.ts`'s `artifactFormatToLanguage`, and `MetadataTab.tsx`. Still not a Change to schedule on its own — the remaining five migrate opportunistically as each gets touched, same as C15 did for the first.

  Not a Change to schedule on its own. Retire it opportunistically instead: each future touch to one of the remaining read sites migrates that one off `format` onto real `contentType`, and once the last one has moved, dropping the DB column plus the `ArtifactFormat`/`ArtifactPutInput` types is small, mechanical cleanup with nothing left depending on them.

- **Naming a flow by name and version, rather than the three identifiers (`flowId`, `flowVersionId`, `flowDefHash`) a run request needs today.** Was C14, moved here rather than kept as a numbered Change: investigated directly, and the real blocker is that flow versioning doesn't work yet, not the naming route itself. `POST /api/flows` always creates a brand-new `Flow` row on every upload (`PrismaFlowRepository.createFlow` always writes `sequence: 1`), never adds a version to an existing flow by name, and `Flow.name` has no uniqueness constraint — two unrelated `Flow` rows can already share a name. Naming by name+version only works once versions actually accumulate under one `Flow` row, which they do not. Fixing that — a lookup by name, and a uniqueness decision — is its own piece of work, deliberately not taken on now; the immediate need is met instead by a small script external to the engine that uploads a flow and records the ids it gets back, which sidesteps the naming problem rather than solving it.

**Open decisions:**

- **What a caller sees for a run that failed.** The original leaning was a generic shape carrying the failed step's id and its error message. What actually shipped (C13) is simpler: the SSE `failed` message is `{ ok: false, error: "Run failed" }`, a fixed string with no step id or detail. That's a real gap from the original plan, not a deliberate narrowing — nobody decided to drop the step-level detail, C13 just didn't carry it through. Still open: whether to add it back, and if so how much (the step id alone, or its message too), given the detailed event history already holds the full account for a developer.

- How a flow declares exports on an `http` step whose response type is unknown until it runs. The flow validator could refuse them, or they could fail at runtime on a non-JSON response.

**Later target flows, not built here.** Neither obviously needs new engine features, only services the flows call.

- **Note-taking.** Transcription, then an LLM categorizes the note, then it is stored somewhere it can be searched, with a separate flow that answers questions over the stored notes (a RAG step). Storage and retrieval could be `http` steps against an external vector store or search service, so the knowledge lives in a service built for it rather than in the engine.

**Outside this Initiative:**

- **Streaming,** whether chunks of audio in, or output streamed between steps. It is its own Initiative. This one only avoids closing the door on it.
- **The `mcp` step,** which still plans and then hangs because nothing executes it. It is recorded in `docs/todo.md`.
