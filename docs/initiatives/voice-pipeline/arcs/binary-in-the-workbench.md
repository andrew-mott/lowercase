# Voice Pipeline — Arc A10: Binary in the workbench (Change C15)

**Previous:** [The flows](./the-flows.md) (Change C14)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. Decoupled from `ArtifactIndex`'s own planned retirement (see "Retiring the `format` column" in `INITIATIVE.md`) — its own Change, not blocked on that timing.

## Change C15 - Audio playback in the workbench - merged (#407)

### Discussion

- **The read route this needed (C12) was already built.** `GET /api/artifacts/:hash/content` already serves an artifact's stored bytes under its own `Content-Type`, and is what the finish-line flows themselves use to serve their audio. The only missing piece was the panel, not the API.
- **`ArtifactContentPanel` had no way to know an artifact's real content type**, only its `format` bucket (`json`/`text`/`markdown`/`bytes`), which collapses every kind of binary artifact into one undifferentiated case. Fixing that meant threading the artifact's actual `contentType` through the existing "get one artifact" read path — ports, `ArtifactService.getArtifact`, the wire type, the HTTP route — rather than adding a new route or a schema field.
- **No check for whether the browser can actually play a given audio type.** The `<audio>` element is handed whatever content type is stored and left to its own native support/failure behavior; not something this Change tries to predict or test for.
- **Deliberately narrow.** `ArtifactContentPanel` is one of several read sites across the app that still branch on `format` instead of real content type (see "Retiring the `format` column" in `INITIATIVE.md`); this Change migrates that one site, not the others.

### What actually landed

- `AutoGetResult`'s `bytes` variant (`packages/ports`) and `GetArtifactRes`'s `bytes` variant (`packages/types`) both carry `contentType` now, alongside the byte length they already had.
- `ArtifactService.getArtifact` and the `GET /api/artifacts/:hash` route thread that content type through from the artifact store's own load result.
- `ArtifactContentPanel.tsx`: when a binary artifact's content type starts with `audio/`, it renders an `<audio controls>` element pointed at the existing content-bytes route; every other binary type keeps the prior "preview not supported" message unchanged.
- Verified by the full repo test suite (`pnpm verify`), including a new case confirming `ArtifactService.getArtifact` returns the content type alongside bytes.
