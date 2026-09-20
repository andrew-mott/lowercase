# Voice Pipeline — Arc A6: Binary uploads (Change C8)

**Previous:** [The engine dispatches http](./engine-http-dispatch.md) (Change C7)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. This arc lets a client put binary content, audio first, into the system through the API. An `http` step can already send an uploaded artifact and the engine can already dispatch it, so this is the last thing between a real audio file and a run.

**Not in this arc:** how a param's declared type matches an artifact's content type beyond exact equality (wildcards such as `audio/*`), inline-input runs, and streaming uploads. See the Initiative's planned arcs.

## Change C8 - Accept binary uploads - in progress

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
