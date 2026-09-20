# Voice Pipeline — Arc A6: Binary uploads (Changes C8–C9)

**Previous:** [The engine dispatches http](./engine-http-dispatch.md) (Change C7) · **Next:** [Results out](./results-out.md) (Changes C10–C12)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. This arc lets a client put binary content, audio first, into the system through the API, and lets a flow accept a family of audio types rather than one exact type. An `http` step can already send an uploaded artifact and the engine can already dispatch it, so this is the last thing between a real audio file and a run.

**Not in this arc:** inline-input runs and streaming uploads. See the Initiative's planned arcs.

## Change C8 - Accept binary uploads - merged (#400)

### Discussion

- **The guard is the only thing in the way.** `ArtifactService.createArtifact` returns "Binary artifacts are not supported yet" for `format: "bytes"`. Its comment says binary artifacts could never satisfy a param because `isArtifactCompatible` has no `bytes` case. That stopped being true when compatibility became a plain content-type comparison, and the function never looks at a format at all. A trial run by hand, with the guard lifted, transcribed an uploaded `.wav` through an `http` step end to end.
- **Lifting it is a small real change, not a deletion.** The save call picks between two overloads: JSON content, or a string with a `text/` type. Once `bytes` is allowed, its `Uint8Array` fits neither, and the compiler says so. `ArtifactWriterPort.save` already has a third overload for `Uint8Array` with any content type, so the fix is a `bytes` branch in that call, passing the raw bytes and the upload's own content type.
- **An upload's content type is already the part's declared one.** The route builds the artifact's index from the multipart part's `Content-Type` ([post-artifact.ts](../../../../apps/http-server/src/http/routes/artifacts/post-artifact.ts)); the filename and mimetype checks only pick the format, and anything unmatched becomes `bytes` while keeping its declared type. Nothing to change there.
- **Content type parameters never reach us on a multipart upload.** Checked directly: the multipart parser reports `audio/webm;codecs=opus` as `audio/webm`. A browser recording's codec parameters therefore do not break an exact match against a param declared `audio/webm`, and no separate stripping step is needed on the upload path. What still matters for a param declared as one type is that the client sends that exact type, which is what the wildcard work in a later Change addresses.
- **The size limit is set, and generous.** The multipart plugin is registered with a 1000 MiB file limit in `build-server.ts`, applied to every multipart route, flow file uploads included. The route buffers the whole file (`part.toBuffer()`), so an upload of that size is held in memory, and everything after it (the artifact port, the worker loading the artifact to send it) works on whole values too. Streaming end to end would mean changing the ports and how content-addressed storage names content, and nothing in the voice flows needs it. Settled: lower the limit to 100 MiB, and leave streaming as its own later piece.
- **An over-limit upload is already a clean 413.** Checked directly: exceeding the limit while buffering answers `413 FST_REQ_FILE_TOO_LARGE` from Fastify's own error handling, so nothing needs adding for it, only a test that pins it to the configured limit.
- **The same bytes under a different content type replace the earlier label.** Found in the smoke check: uploading one wav as `audio/wav` and again as `audio/webm` returned the same hash, and the stored content type became `audio/webm`. The artifact's identity is its bytes alone, and `writeArtifact` in the repository upserts with the new content type, format, filename and time on every write of an existing hash. So a re-upload, or any writer storing identical content under another type (the worker included, for a step's output), silently relabels the artifact everyone else already references. Nothing here is broken by it today, and it is not fixed in this Change, because whether a content type belongs in an artifact's identity is a storage decision that reaches well past uploads. Recorded in `docs/todo.md`.
- **A failed create is a 500.** The route sends every `createArtifact` failure as 500. The guard's rejection was one of those. With it gone what remains is real save and metadata failures, so this is left alone.

### What actually landed

Matches the plan, with one finding along the way (the relabelling bullet above).

- **The guard is gone.** `ArtifactService.createArtifact` no longer refuses `bytes`, and its stale comment went with it. The save call has a `bytes` branch that passes the raw bytes and the artifact's own content type to the port's `Uint8Array` overload. An upload with no declared type is stored as `application/octet-stream`, which the existing default already gave.
- **The upload limit is 100 MiB.** `build-server.ts` exports it as `maxUploadBytes`, hardcoded, with a comment that it is a memory limit because routes buffer the whole file.
- **Tests.** The service test that expected a `bytes` rejection now covers a `bytes` artifact saving under its declared type, the octet-stream default, and a param curation accepted or refused by content type. A new route-level test builds the real server with stubbed services and shows a file exactly at the limit accepted and one byte over answered with a 413 before any artifact is created.
- **Smoke check.** With no local edits, the embedded host stored an uploaded wav as a `bytes` artifact under `audio/wav`.
- **Deliberately not done.** No route logic changed. Content types are not matched beyond exact equality yet, the limit is not configurable, and uploads are not streamed. `ArtifactPutInput`'s `format` discriminant and the content-type relabelling are both recorded in `docs/todo.md`.

## Change C9 - Wildcard param types - merged (#401)

### Discussion

Traced every place that reads a param's declared type.

- **Compatibility is one function, called from several places.** `isArtifactCompatible` is plain equality. `RunService` calls it at run start, `ArtifactService` when creating an artifact and when editing its metadata, and the workbench directly in about five places. Making that one function understand a wildcard covers all of them.
- **C2's binary check already copes.** `validateBinaryRefPosition` only asks whether the declared type is neither JSON nor `text/`, which `audio/*` is not.
- **The real problem is the worker, not the matching.** The engine copies the declared type onto each job ref as `paramType`. `JobRunner.#resolveOneRef` loads the artifact under it, and `materialize-http-request.ts` sends it as the multipart part's `Content-Type`. Under a wildcard the declared type is a pattern, so loading under `audio/*` and sending a part labelled `audio/*` would both be wrong. The worker needs the artifact's actual type.
- **The engine cannot supply it cheaply.** A run's params are name-to-hash pairs on `run.requested`, copied into run context, and the engine never sees a type. Carrying a concrete type per param would change the event data, the reducer, the run repository and likely fork and replay.
- **Settled: the worker resolves it.** `ArtifactReaderPort.load(hash)` with no expected type already returns the stored content type with the decoded value. For a param declared with a wildcard, the worker loads that way, checks the stored type against the pattern (a mismatch is the same `TYPE_MISMATCH` as today), and writes the concrete type back onto the resolved ref so the multipart part is labelled `audio/webm`, not `audio/*`. Exact declarations keep the current typed load and are unchanged.
- **Settled: wildcard only.** `audio/*` covers webm, m4a and wav. An array of types would change the schema and every reader that treats `type` as a string, so it waits until a flow needs it. `FlowParamDefinitionSchema` already accepts any non-empty string, so no schema change is needed for the wildcard.
- **Frontend was open, and checked at build time.** See below.

### What actually landed

Matches the discussion, with no deviations.

- **The matcher.** `isContentTypePattern` in flow-analysis is true only for a type followed by `/*`. `isArtifactCompatible` treats a pattern as a prefix match that keeps the slash, so `audio/*` accepts `audio/webm` but not `audiobook/x` or a bare `audio`, and anything else is still exact equality. Forms such as `*/*` and `audio/x-*` are deliberately not patterns. Nothing else in flow-analysis changed: the schema already accepted any non-empty string as a param type, and C2's binary-position check already classifies `audio/*` as binary.
- **The worker.** For a param declared with a pattern, `JobRunner` loads the artifact without an expected type, refuses it with `INPUT_RESOLUTION_FAILED` if the load fails or the stored type is outside the pattern, and hands the request materializers a copy of the refs with `paramType` narrowed to the stored type. The multipart part is therefore labelled `audio/webm`, not `audio/*`. Exact declarations keep their typed loads.
- **Tests.** Matcher cases in flow-analysis; a new worker test file covering a pattern param stored under another subtype, a type outside the pattern, a missing artifact, and an exact declaration still requiring an exact match; app-services cases for curation against a pattern param and for a run param (a new small file, since the artifact service test file was already long).
- **Frontend.** Nothing changed. Every compatibility check in the workbench goes through the shared function, so a pattern param lists matching artifacts, and the places that print the declared type show `audio/*` as it is. The text-only guards (`isTextSafeContentType`) are false for a pattern and simply skip their presets. Separately, and not part of this Change, the create-artifact dialog only accepts JSON, text and Markdown files, so audio cannot be uploaded from the workbench; it goes through the API.
- **Deliberately not done.** Arrays of types, partial wildcards, and the engine's `resolve-branch-value` effect, which still loads a param under its declared type; a pattern-typed binary param cannot sensibly drive a branch.
