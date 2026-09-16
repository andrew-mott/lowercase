# API reference

_Last updated: 2026-08-22_

Hand-written reference for `apps/http-server`'s REST API. Types, not schema —
nothing here is generated (yet); keep it in sync manually as routes change.

Almost every route responds `200` with a discriminated `{ ok: true, ... } | { ok: false, error }`
body (see `packages/types`) rather than varying by HTTP status code, so each
entry's "Response" section shows that union directly instead of a status-code
table. The two multipart file-upload routes (`POST /api/artifacts`,
`POST /api/flows/files`) are the real exception — they do send real `400`/`500`
codes — and are called out individually where that applies.

## Base URL

`http://localhost:3000/api` (default `http-server` port; see its own config for overrides)

---

## Artifacts

<details>
<summary><code>GET</code> <code><b>/api/artifacts</b></code> — list artifacts, optionally filtered</summary>
<br>

**Type:** `GetArtifactsReq` → `GetArtifactsRes` (`packages/types/src/api/artifacts/get-artifacts.ts`)<br>
**Service:** `ArtifactService.listArtifacts()`

##### Query parameters

| name            | type     | required | description                                                                                             |
| --------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `flowId`        | `string` | no       |                                                                                                         |
| `flowVersionId` | `string` | no       |                                                                                                         |
| `curated`       | `string` | no       | literal `"true"`/`"false"` — arrives as a querystring, parsed manually by the route, not a real boolean |
| `hash`          | `string` | no       |                                                                                                         |

##### Response

```ts
type GetArtifactsRes = Result<ArtifactListItem[], string>;
// same { ok: true; value } | { ok: false; error } shape as elsewhere,
// via the shared generic alias instead of writing the union out inline
type Result<V, E> = { ok: true; value: V } | { ok: false; error: E };

type ArtifactListItem = {
  artifact: Omit<ArtifactIndex, "flowId" | "flowVersionId" | "curated">;
  associations: {
    flowId?: string;
    flowVersionId?: string;
    curated: boolean;
    paramCurations: { flowVersionId: string; paramName: string }[];
  };
};

type ArtifactIndex = {
  time: string;
  hash: string;
  label?: string;
  id?: string;
  filename?: string;
  contentType?: string;
  size?: number;
  format?: "json" | "text" | "markdown" | "bytes";
};
```

##### Example response

```json
{
  "ok": true,
  "value": [
    {
      "artifact": {
        "time": "2026-08-20T14:03:11.000Z",
        "hash": "a1b2c3d4e5f6...",
        "label": "eval scoring result",
        "id": "art_9f2c1d",
        "filename": "score.json",
        "contentType": "application/json",
        "size": 842,
        "format": "json"
      },
      "associations": {
        "flowId": "flow_7e21a",
        "flowVersionId": "flowver_04",
        "curated": true,
        "paramCurations": [
          { "flowVersionId": "flowver_04", "paramName": "inputDoc" }
        ]
      }
    }
  ]
}
```

##### Example request

```bash
curl "http://localhost:3000/api/artifacts?curated=true"
```

</details>

<details>
<summary><code>POST</code> <code><b>/api/artifacts</b></code> — create an artifact, either authored (JSON body) or uploaded (multipart file)</summary>
<br>

**Type:** `PostArtifactReq` → `PostArtifactRes` (`packages/types/src/api/artifacts/post-artifact.ts`)<br>
**Service:** `ArtifactService.createArtifact()`

**Real exception to this doc's status-code note above**: on failure this route
sends `reply.code(400)` (bad input — invalid JSON, unsupported content type,
more than one file) or `reply.code(500)` (the underlying create call failed),
not a `200` with `ok: false` like the rest of the API.

Two distinct request shapes, chosen by whether the request `isMultipart()`:

##### Mode 1 — multipart file upload

A single file part, plus an optional `metadata` field (JSON-stringified
`ArtifactUpdateMetadata`, parsed server-side). Format is inferred from
filename extension + mimetype (`detectUploadFormat`); anything unrecognized
falls through to `"bytes"` rather than being rejected — a deliberate fix over
an earlier, stricter upload route that rejected arbitrary binary uploads
(e.g. images) outright.

##### Mode 2 — authored JSON body

| field         | type                     | required | description                                                                                                                |
| ------------- | ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `contentType` | `string`                 | yes      | must map to `json`/`text`/`markdown` (`detectAuthoredFormat`) — no `bytes` fallback here, an unmapped type is a real `400` |
| `value`       | `string`                 | yes      | always a raw string, even for JSON content — see the type's own comment below                                              |
| `metadata`    | `ArtifactUpdateMetadata` | no       |                                                                                                                            |

The type's own comment on why `value` is always a string, not `JsonValue \| string`, kept verbatim since it's the real reasoning:

> Always a raw string, even when contentType implies json... keeps `value` unambiguous: a `JsonValue \| string` type here couldn't distinguish "the artifact's real content is the string 'x'" from "a caller forgot to `JSON.parse` before sending", since both look identical on the wire.

##### `ArtifactUpdateMetadata` semantics (both modes)

```ts
type ArtifactUpdateMetadata =
  | {
      label?: string | null;
      flowId?: string | null;
      flowVersionId?: string | null;
      paramCurations?: undefined;
    }
  | {
      label?: string | null;
      flowId?: string | null;
      flowVersionId: string;
      paramCurations?: string[];
    };
```

`undefined`/omitted means "leave unchanged"; `null` means "explicitly clear."
`paramCurations` requires `flowVersionId` to be set in the same call — enforced
by the union, not a runtime check. `curated` isn't settable here at all — the
repository sets it unconditionally on every write.

##### Response

```ts
type PostArtifactRes = Result<ArtifactIndex, string>;

type ArtifactIndex = {
  time: string;
  hash: string;
  label?: string;
  id?: string;
  filename?: string;
  contentType?: string;
  size?: number;
  format?: "json" | "text" | "markdown" | "bytes";
  flowId?: string;
  flowVersionId?: string;
  curated?: boolean;
};
```

##### Example response

```json
{
  "ok": true,
  "value": {
    "time": "2026-08-22T10:15:00.000Z",
    "hash": "c3d4e5f6a1b2...",
    "id": "art_6b1e40",
    "filename": "score.json",
    "contentType": "application/json",
    "size": 842,
    "format": "json",
    "curated": false
  }
}
```

##### Example request

```bash
# authored JSON body
curl -X POST http://localhost:3000/api/artifacts \
  -H "Content-Type: application/json" \
  -d '{"contentType":"application/json","value":"{\"score\":0.92}"}'

# multipart upload
curl -X POST http://localhost:3000/api/artifacts \
  -F "file=@./result.json" \
  -F 'metadata={"label":"eval result"}'
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/artifacts/:hash</b></code> — fetch one artifact's content by hash</summary>
<br>

**Type:** `GetArtifactReq` → `GetArtifactRes` (`packages/types/src/api/artifacts/get-artifact.ts`)<br>
**Service:** `ArtifactService.getArtifact()`

##### Path parameters

| name   | type     | required | description             |
| ------ | -------- | -------- | ----------------------- |
| `hash` | `string` | yes      | validated with `isHash` |

##### Response

```ts
type GetArtifactRes =
  | { ok: true; format: "json"; value: JsonValue }
  | { ok: true; format: "text" | "markdown"; value: string }
  | { ok: true; format: "bytes"; byteLength: number }
  | { ok: false; error: string };
```

Note the `"bytes"` branch — it does **not** return the artifact's actual bytes over
this endpoint, only `byteLength`. Real binary artifact content-serving is deferred
until there's an actual use case for it (this engine's usage so far has been
text/JSON-shaped); this branch exists so callers can at least detect a binary
artifact exists without the route trying to JSON-encode raw bytes.

##### Example responses

```json
// format: "json"
{ "ok": true, "format": "json", "value": { "score": 0.92, "passed": true } }

// format: "text" (or "markdown" -- same shape, just prose instead of JSON)
{ "ok": true, "format": "text", "value": "Plain text artifact content." }

// format: "bytes" -- no `value` field, see the note above
{ "ok": true, "format": "bytes", "byteLength": 48213 }
```

##### Example request

```bash
curl http://localhost:3000/api/artifacts/<hash>
```

</details>

<details>
<summary><code>PATCH</code> <code><b>/api/artifacts/:hash</b></code> — update an artifact's metadata</summary>
<br>

**Type:** `PatchArtifactReq` → `PatchArtifactRes` (`packages/types/src/api/artifacts/patch-artifact.ts`)<br>
**Service:** `ArtifactService.updateArtifactMetadata()`

Content itself is immutable (CAS, hash-addressed) — this only ever touches metadata.
`PatchArtifactReq` is exactly `ArtifactUpdateMetadata`, same shape/semantics as
`POST /api/artifacts` above (`undefined` = leave unchanged, `null` = clear).
Response is the same `Result<ArtifactIndex, string>` as the other artifact routes.

##### Path parameters

| name   | type     | required | description             |
| ------ | -------- | -------- | ----------------------- |
| `hash` | `string` | yes      | validated with `isHash` |

##### Example response

```json
{
  "ok": true,
  "value": {
    "time": "2026-08-20T14:03:11.000Z",
    "hash": "a1b2c3d4e5f6...",
    "label": "renamed result",
    "id": "art_9f2c1d",
    "filename": "score.json",
    "contentType": "application/json",
    "size": 842,
    "format": "json"
  }
}
```

Note `flowId` isn't present here — clearing a field via `null` in the request
means it's simply absent in the response, not `flowId: null`; `ArtifactIndex`'s
own fields are typed `string | undefined`, never `| null`.

##### Example request

```bash
curl -X PATCH http://localhost:3000/api/artifacts/<hash> \
  -H "Content-Type: application/json" \
  -d '{"label":"renamed result","flowId":null}'
```

</details>

---

## Evals

<details>
<summary><code>GET</code> <code><b>/api/evals</b></code> — list eval results, by experiment or by target shape</summary>
<br>

**Type:** `GetEvalsReq` → `GetEvalsRes` (`packages/types/src/api/evals/get-evals.ts`)<br>
**Service:** `EvalService.listByExperimentId()` / `EvalService.listByTargetShape()`

Two mutually exclusive query modes, not a flat filter set — exactly one of them
must be satisfied or the route returns `ok: false`:

##### Query parameters

| name           | type     | required | description                 |
| -------------- | -------- | -------- | --------------------------- |
| `experimentId` | `string` | mode 1   |                             |
| `flowId`       | `string` | mode 2   | all three required together |
| `stepId`       | `string` | mode 2   |                             |
| `exportName`   | `string` | mode 2   |                             |

##### Response

```ts
type GetEvalsRes = Result<EvalResultRecord[], string>;

type EvalResultRecord = {
  id: string;
  targetRunId: string;
  targetStepId?: string;
  targetExportName?: string;
  // only populated when fetched via a query that joins the target run
  // (e.g. listByTargetShape) -- not stored on EvalResult itself
  targetFlowVersionId?: string;
  evalRunId: string;
  evalFlowId?: string;
  evalFlowVersionId?: string;
  experimentId?: string;
  overall: number;
  passed: boolean;
  payload: EvalScorePayload;
  createdAt: string;
};

// overall/passed appear both flattened on the record above and again nested
// here -- the record's copies are the summary, payload carries the detail
type EvalScorePayload = {
  overall: number;
  passed: boolean;
  dimensions: Record<string, { score: number; rationale?: string }>;
  rationale?: string;
};
```

##### Example response

```json
{
  "ok": true,
  "value": [
    {
      "id": "evalres_1a2b",
      "targetRunId": "run_3c4d",
      "targetStepId": "summarize",
      "targetExportName": "summary",
      "evalRunId": "evalrun_5e6f",
      "evalFlowId": "flow_judge01",
      "experimentId": "exp_quality-pass",
      "overall": 0.87,
      "passed": true,
      "payload": {
        "overall": 0.87,
        "passed": true,
        "dimensions": {
          "accuracy": { "score": 0.9, "rationale": "Covers all key points." },
          "conciseness": { "score": 0.8 }
        }
      },
      "createdAt": "2026-08-21T16:02:00.000Z"
    }
  ]
}
```

##### Example request

```bash
curl "http://localhost:3000/api/evals?experimentId=<experimentId>"
curl "http://localhost:3000/api/evals?flowId=<flowId>&stepId=<stepId>&exportName=<exportName>"
```

</details>

<details>
<summary><code>POST</code> <code><b>/api/evals</b></code> — request an eval run against one or more targets</summary>
<br>

**Type:** `PostEvalsReq` → `PostEvalsRes` (`packages/types/src/api/evals/post-evals.ts`)<br>
**Service:** `EvalService.startEvalRun()`

##### Request body

| field                   | type                   | required | description                    |
| ----------------------- | ---------------------- | -------- | ------------------------------ |
| `targets`               | `PostEvalsReqTarget[]` | yes      | must be non-empty; shape below |
| `evalFlowId`            | `string`               | yes      |                                |
| `evalFlowVersionId`     | `string`               | yes      |                                |
| `evalFlowDefHash`       | `string`               | yes      |                                |
| `judgeSystemPromptHash` | `string`               | yes      |                                |
| `experimentId`          | `string`               | no       |                                |

```ts
type PostEvalsReqTarget = {
  runId: string;
  stepId: string;
  exportName: string;
  paramName: string;
};
```

##### Response

```ts
{ ok: true; evalRunId: string } | { ok: false; error: string }
```

##### Example request

```bash
curl -X POST http://localhost:3000/api/evals \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [{"runId":"...", "stepId":"...", "exportName":"...", "paramName":"..."}],
    "evalFlowId":"...", "evalFlowVersionId":"...", "evalFlowDefHash":"...",
    "judgeSystemPromptHash":"..."
  }'
```

</details>

---

## Flows

<details>
<summary><code>GET</code> <code><b>/api/flows</b></code> — list all flows, each with its latest version summary</summary>
<br>

**Type:** `GetFlowsRes` (`packages/types/src/api/flows/get-flows.ts`) — no request type, no query params<br>
**Service:** `FlowService.getAllFlows()`

##### Response

```ts
type GetFlowsRes = Result<FlowListItem[], string>;

type FlowListItem = {
  flow: FlowRecord;
  latestVersion: FlowLatestVersionSummary;
};

type FlowRecord = {
  id: string;
  name: string;
  description?: string;
  kind: "business" | "eval";
  createdAt: string;
  updatedAt: string;
};

type FlowLatestVersionSummary = {
  id: string;
  flowId: string;
  sequence: number;
  definitionHash: string;
  versionLabel?: string;
  description?: string;
  createdAt: string;
};
```

##### Example response

```json
{
  "ok": true,
  "value": [
    {
      "flow": {
        "id": "flow_7e21a",
        "name": "summarize-document",
        "description": "Summarizes an uploaded document",
        "kind": "business",
        "createdAt": "2026-07-10T09:12:00.000Z",
        "updatedAt": "2026-08-15T11:40:00.000Z"
      },
      "latestVersion": {
        "id": "flowver_04",
        "flowId": "flow_7e21a",
        "sequence": 4,
        "definitionHash": "a1b2c3d4e5f6...",
        "versionLabel": "v4",
        "createdAt": "2026-08-15T11:40:00.000Z"
      }
    }
  ]
}
```

##### Example request

```bash
curl http://localhost:3000/api/flows
```

</details>

<details>
<summary><code>POST</code> <code><b>/api/flows</b></code> — add a flow from an authored JSON body</summary>
<br>

**Type:** `FlowDefinition` → `PostFlowRes` (`packages/types/src/api/flows/post-flow.ts`, `flow/flow-definition.ts`)<br>
**Service:** `FlowService.addFlow()`

**Naming trap, real, worth knowing**: `packages/types` also exports a
`PostFlowReq = { body: FlowDefinition }`, but the route itself types its body
as plain `FlowDefinition` directly (`app.post<{ Body: FlowDefinition }>`) —
`PostFlowReq` is never imported by the route at all. It's only used client-side,
as `apps/workbench/src/redux/api/flows-api.ts`'s `addJsonFlow` mutation's own
_argument_ shape (`builder.mutation<PostFlowRes, PostFlowReq>`) — its `query()`
callback unwraps `arg.body` before sending, so the real wire payload is still
plain `FlowDefinition`, matching the route. `PostFlowReq` describes a client-side
calling convention, not the request body — despite the name.

##### Request body

`FlowDefinition` — same shape as `GET /api/flows/:flowId`'s response below,
sent directly as the whole JSON body (not wrapped in `{ body: ... }`).

##### Response

```ts
type PostFlowRes = Result<CreateFlowRecordResult, string>;

type CreateFlowRecordResult = {
  flow: FlowRecord; // same shape as GET /api/flows above
  version: FlowVersionRecord; // same shape as GET /api/flows/:flowId/versions below
};
```

##### Example response

```json
{
  "ok": true,
  "value": {
    "flow": {
      "id": "flow_7e21a",
      "name": "summarize-document",
      "kind": "business",
      "createdAt": "2026-08-22T10:00:00.000Z",
      "updatedAt": "2026-08-22T10:00:00.000Z"
    },
    "version": {
      "id": "flowver_01",
      "flowId": "flow_7e21a",
      "sequence": 1,
      "definitionHash": "a1b2c3d4e5f6...",
      "createdAt": "2026-08-22T10:00:00.000Z"
    }
  }
}
```

##### Example request

```bash
curl -X POST http://localhost:3000/api/flows \
  -H "Content-Type: application/json" \
  -d '{"name":"summarize-document","version":"1.0.0","start":"summarize","steps":{"summarize":{"type":"httpjson","url":"https://api.example.com/summarize"}}}'
```

</details>

<details>
<summary><code>POST</code> <code><b>/api/flows/files</b></code> — add a flow by uploading a JSON file</summary>
<br>

**Type:** no dedicated request type — raw multipart, parsed manually with `for await (const part of req.parts())` — → `PostFlowFileRes` (`packages/types/src/api/flows/files/post-flow-file.ts`)<br>
**Service:** `FlowService.addFlow()` (same service call as `POST /api/flows` above, given the uploaded file's raw text instead of a parsed body)

Same real status-code exception as `POST /api/artifacts` — failures send
`reply.code(400)`, not a `200` with `ok: false`.

Takes the **first** multipart part where `part.type === "file"` and stops there
(no support for multiple files in one request); the field name itself isn't
checked, only that the part is a file — `flows-api.ts`'s client sends it under
a field named `files`, but the server would accept any field name. Validated
with `isJsonLikeFile`: mimetype must be in a small allowed set (`application/json`,
`text/json`, `application/octet-stream`) **and** the filename must end in `.json`.

##### Response

Same `PostFlowFileRes = Result<CreateFlowRecordResult, string>` shape as
`POST /api/flows` above.

##### Example response

```json
{
  "ok": true,
  "value": {
    "flow": {
      "id": "flow_7e21a",
      "name": "summarize-document",
      "kind": "business",
      "createdAt": "2026-08-22T10:00:00.000Z",
      "updatedAt": "2026-08-22T10:00:00.000Z"
    },
    "version": {
      "id": "flowver_01",
      "flowId": "flow_7e21a",
      "sequence": 1,
      "definitionHash": "a1b2c3d4e5f6...",
      "createdAt": "2026-08-22T10:00:00.000Z"
    }
  }
}
```

##### Example request

```bash
curl -X POST http://localhost:3000/api/flows/files \
  -F "file=@./my-flow.json;type=application/json"
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/flows/:flowId</b></code> — fetch a flow's latest definition</summary>
<br>

**Type:** `Result<FlowDefinition, string>` (no dedicated `GetFlowDefRes` type — the route returns `FlowService.getFlowDef()`'s own return type directly)<br>
**Service:** `FlowService.getFlowDef()`

Despite the param name, `:flowId` also accepts a flow **definition hash** —
`getFlowDef()` tries it as a flow id first (fetching that flow's latest
version), then falls back to treating it as a hash directly.

##### Path parameters

| name     | type     | required | description                                                                       |
| -------- | -------- | -------- | --------------------------------------------------------------------------------- |
| `flowId` | `string` | yes      | flow id, or a flow definition hash; validated with `isFlowId` (alphanumeric only) |

##### Response

```ts
type FlowDefinition = {
  name: string;
  version: string;
  description?: string;
  kind?: "business" | "eval";
  params?: Record<
    string,
    {
      type: "application/json" | "text/plain" | "text/markdown";
      optional?: true;
    }
  >;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  start: string;
  steps: Record<string, StepDefinition>;
};
```

`StepDefinition` (`packages/types/src/flow/step.type.ts`) is a 5-way union —
`StepMcp | StepHttpJson | StepParallel | StepJoin | StepBranch` — not expanded
here; the flow-definition spec itself isn't documented anywhere yet, which is
a real gap but a separate task from this one (see `docs/todo.md`).

##### Example response

```json
{
  "ok": true,
  "value": {
    "name": "summarize-document",
    "version": "1.0.0",
    "description": "Summarizes an uploaded document",
    "kind": "business",
    "params": {
      "inputDoc": { "type": "text/plain" }
    },
    "start": "summarize",
    "steps": {
      "summarize": {
        "type": "httpjson",
        "url": "https://api.example.com/summarize",
        "method": "POST",
        "exports": {
          "summary": { "ref": "summary", "type": "text/plain" }
        }
      }
    }
  }
}
```

(a real `StepHttpJson` shape, one of the five step types — shown as an
example, not a full spec walkthrough)

##### Example request

```bash
curl http://localhost:3000/api/flows/<flowId>
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/flows/:flowId/versions</b></code> — list a flow's versions</summary>
<br>

**Type:** `GetFlowVersionsRes` (`packages/types/src/api/flows/get-flows.ts`)<br>
**Service:** `FlowService.getFlowVersions()`

##### Path parameters

| name     | type     | required | description |
| -------- | -------- | -------- | ----------- |
| `flowId` | `string` | yes      |             |

##### Response

```ts
type GetFlowVersionsRes = Result<FlowVersionRecord[], string>;

type FlowVersionRecord = {
  id: string;
  flowId: string;
  sequence: number;
  definitionHash: string;
  versionLabel?: string;
  description?: string;
  createdAt: string;
};
```

##### Example response

```json
{
  "ok": true,
  "value": [
    {
      "id": "flowver_03",
      "flowId": "flow_7e21a",
      "sequence": 3,
      "definitionHash": "9f8e7d6c5b4a...",
      "versionLabel": "v3",
      "createdAt": "2026-08-01T10:00:00.000Z"
    },
    {
      "id": "flowver_04",
      "flowId": "flow_7e21a",
      "sequence": 4,
      "definitionHash": "a1b2c3d4e5f6...",
      "versionLabel": "v4",
      "createdAt": "2026-08-15T11:40:00.000Z"
    }
  ]
}
```

##### Example request

```bash
curl http://localhost:3000/api/flows/<flowId>/versions
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/flows/versions/:versionId</b></code> — fetch one specific flow version's definition</summary>
<br>

**Type:** `GetFlowVersionRes` (`packages/types/src/api/flows/get-flows.ts`)<br>
**Service:** `FlowService.getFlowVersionDef()`

Unlike `GET /api/flows/:flowId` above (always the _latest_ version), this pins
to one exact version by its own id, and wraps its `FlowDefinition` alongside
the version record itself.

##### Path parameters

| name        | type     | required | description |
| ----------- | -------- | -------- | ----------- |
| `versionId` | `string` | yes      |             |

##### Response

```ts
type GetFlowVersionRes = Result<FlowVersionDefinition, string>;

type FlowVersionDefinition = {
  version: FlowVersionRecord; // same shape as GET /api/flows/:flowId/versions above
  definition: FlowDefinition; // same shape as GET /api/flows/:flowId above
};
```

##### Example response

```json
{
  "ok": true,
  "value": {
    "version": {
      "id": "flowver_04",
      "flowId": "flow_7e21a",
      "sequence": 4,
      "definitionHash": "a1b2c3d4e5f6...",
      "versionLabel": "v4",
      "createdAt": "2026-08-15T11:40:00.000Z"
    },
    "definition": {
      "name": "summarize-document",
      "version": "1.0.0",
      "start": "summarize",
      "steps": {
        "summarize": {
          "type": "httpjson",
          "url": "https://api.example.com/summarize",
          "method": "POST"
        }
      }
    }
  }
}
```

##### Example request

```bash
curl http://localhost:3000/api/flows/versions/<versionId>
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/flows/versions/:versionId/params/:paramName/curated-artifacts</b></code> — list artifacts curated for one flow version's param</summary>
<br>

**Type:** `GetCuratedArtifactsRes` (`packages/types/src/api/flows/curated-artifacts.ts`)<br>
**Service:** `ArtifactService.listCuratedArtifacts()`

Curation itself is set via `PATCH /api/artifacts/:hash`'s `paramCurations` field
(see the Artifacts section above) — this is the read side, listing what's
already been curated for a specific param.

##### Path parameters

| name        | type     | required | description |
| ----------- | -------- | -------- | ----------- |
| `versionId` | `string` | yes      |             |
| `paramName` | `string` | yes      |             |

##### Response

```ts
type GetCuratedArtifactsRes = Result<ArtifactIndex[], string>;
// ArtifactIndex — same shape as GET /api/artifacts above
```

##### Example response

```json
{
  "ok": true,
  "value": [
    {
      "time": "2026-08-18T13:20:00.000Z",
      "hash": "b2c3d4e5f6a1...",
      "label": "reference input doc",
      "id": "art_4d8f21",
      "filename": "reference.txt",
      "contentType": "text/plain",
      "size": 310,
      "format": "text"
    }
  ]
}
```

##### Example request

```bash
curl http://localhost:3000/api/flows/versions/<versionId>/params/<paramName>/curated-artifacts
```

</details>

---

## Runs

<details>
<summary><code>GET</code> <code><b>/api/runs</b></code> — list runs, optionally filtered to one flow version</summary>
<br>

**Type:** `GetRunsReq` → `GetRunsRes` (`packages/types/src/api/runs/get-runs.ts`)<br>
**Service:** `RunService.listAllRuns()` / `RunService.listRunsByFlowVersionId()`

##### Query parameters

| name            | type     | required | description                                    |
| --------------- | -------- | -------- | ---------------------------------------------- |
| `flowVersionId` | `string` | no       | when omitted, lists every run across all flows |

##### Response

```ts
{ ok: true; runList: RunListItem[] } | { ok: false; error: string }

type RunListItem = {
  runId: string;
  flowName: string;
  flowVersion: string;
  flowDefHash: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  forkSpecHash?: string;
  parentId?: string;
};
```

##### Example

```bash
curl http://localhost:3000/api/runs
curl "http://localhost:3000/api/runs?flowVersionId=..."
```

</details>

<details>
<summary><code>POST</code> <code><b>/api/runs</b></code> — request a run of a flow (or fork of a sim)</summary>
<br>

**Type:** `PostRunsReq` → `PostRunsRes` (`packages/types/src/api/runs/post-runs.ts`)<br>
**Service:** `RunService.requestRun()`

##### Request body

| field           | type                     | required | description                          |
| --------------- | ------------------------ | -------- | ------------------------------------ |
| `flowId`        | `string`                 | yes      |                                      |
| `flowVersionId` | `string`                 | yes      |                                      |
| `flowDefHash`   | `string`                 | yes      | validated against `validateFlowHash` |
| `simId`         | `string`                 | no       | present when running a fork of a sim |
| `forkSpecHash`  | `string`                 | no       |                                      |
| `params`        | `Record<string, string>` | no       |                                      |

##### Response

```ts
{ ok: true; runId: string } | { ok: false; error: string }
```

##### Example

```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{"flowId":"...", "flowVersionId":"...", "flowDefHash":"..."}'
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/runs/:runId</b></code> — full detail for one run</summary>
<br>

**Type:** `GetRunDetailReq` → `GetRunDetailRes` (`packages/types/src/api/runs/get-run-detail.ts`)<br>
**Service:** `RunService.getRunDetail()`

##### Path parameters

| name    | type     | required | description              |
| ------- | -------- | -------- | ------------------------ |
| `runId` | `string` | yes      | validated with `isRunId` |

##### Response

```ts
{ ok: true; value: RunDetail } | { ok: false; error: string }

type RunDetail = {
  run: RunRecord;
  steps: RunStepProjectionRecord[];
  params?: RunParamSelection[];
  flow?: FlowRecord;
  flowVersion?: FlowVersionRecord;
};

type RunRecord = {
  id: string;
  traceId: string;
  status: "requested" | "started" | "completed" | "failed";
  source: string;
  flowId?: string;
  flowVersionId?: string;
  flowDefHash: string;
  simId?: string;
  parentRunId?: string;
  forkSpecHash?: string;
  experimentId?: string;
  targetRunId?: string;
  targetStepId?: string;
  targetExportName?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  createdAt: string;
  updatedAt: string;
};

type RunStepProjectionRecord = {
  runId: string;
  stepId: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  reusedTime?: string;
  wasReused?: boolean;
  outputHash?: string;
  exports?: RunStepExportRecord[];
};

type RunStepExportRecord = {
  name: string;
  artifactHash: string;
  artifact?: ArtifactIndex;
};

type RunParamSelection = {
  name: string;
  artifactHash: string;
  artifact?: ArtifactIndex;
};

type FlowRecord = {
  id: string;
  name: string;
  description?: string;
  kind: "business" | "eval";
  createdAt: string;
  updatedAt: string;
};

type FlowVersionRecord = {
  id: string;
  flowId: string;
  sequence: number;
  definitionHash: string;
  versionLabel?: string;
  description?: string;
  createdAt: string;
};

// shared by RunStepExportRecord.artifact and RunParamSelection.artifact
type ArtifactIndex = {
  time: string;
  hash: string;
  label?: string;
  id?: string;
  filename?: string;
  contentType?: string;
  size?: number;
  format?: "json" | "text" | "markdown" | "bytes";
  flowId?: string;
  flowVersionId?: string;
  curated?: boolean;
};
```

##### Example

```bash
curl http://localhost:3000/api/runs/<runId>
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/runs/:runId/params</b></code> — a run's param selections, name → artifact hash</summary>
<br>

**Type:** `GetRunParamsReq` → `GetRunParamsRes` (`packages/types/src/api/runs/get-run-params.ts`)<br>
**Service:** `RunService.getRunParams()`

##### Path parameters

| name    | type     | required | description              |
| ------- | -------- | -------- | ------------------------ |
| `runId` | `string` | yes      | validated with `isRunId` |

##### Response

```ts
{ ok: true; value: RunParamManifest } | { ok: false; error: string }

type RunParamManifest = Record<string, string>; // paramName -> artifactHash
```

Derivable from `GET /api/runs/:runId`'s own `params` field, so used only where a
panel hasn't already fetched full run detail — e.g. seeding a run-opened Flow
Graph panel's Run Input tab display (`use-flow-graph-panel.ts`, see
`arcs/run-input-params.md` Change C25) without pulling the whole `RunDetail` payload.

##### Example response

```json
{
  "ok": true,
  "value": {
    "inputDoc": "a1b2c3d4e5f6...",
    "modelConfig": "9f8e7d6c5b4a..."
  }
}
```

##### Example request

```bash
curl http://localhost:3000/api/runs/<runId>/params
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/runs/details</b></code> — full raw event history for one run</summary>
<br>

**Type:** `GetRunEventsReq` → `GetRunEventsRes` (`packages/types/src/api/runs/get-run-events.ts`)<br>
**Service:** `ReplayService.getAllEvents()`

Note the different base path — this route is registered under `/api/runs/details`,
not `/api/runs/:runId/...` like the rest of this section (`apps/http-server/src/http/routes/routes.ts`).

##### Query parameters

| name    | type     | required | description              |
| ------- | -------- | -------- | ------------------------ |
| `runId` | `string` | yes      | validated with `isRunId` |

##### Response

```ts
{ ok: true; events: AnyEvent[] } | { ok: false; error: string }

// every event shares this envelope; `data`/`domain`/`entity`/`action` vary
// by `type` (see packages/types/src/events/shared/cloud-event.ts)
type CloudEvent<T> = {
  id: string;
  source: string;
  specversion: "1.0";
  time: string;
  type: T;
  subject?: string;
  datacontenttype?: string;
  dataschema?: string;
  data: /* shape depends on `type` */ unknown;
  domain: string;
  entity?: string;
  action: string;
  traceparent: string;
  tracestate?: string;
  traceid: string;
  spanid: string;
  parentspanid?: string;
};
```

Not fully enumerated here — `AnyEvent` spans every domain's event catalog
(`packages/events`, one `*.event.schema.ts`/`*.data.schema.ts` pair per domain:
run, step, engine, job, tool, worker, scheduler, limiter, replay, system).
The schemas themselves aren't in question; it's the generation/boilerplate
around them (`EmitterFactory`'s repeated per-domain method pattern, see this
repo's `CLAUDE.md`) that's the acknowledged rough edge and active refactor
target — not worth pinning down the full per-domain shape list here either way.

##### Example

```bash
curl "http://localhost:3000/api/runs/details?runId=<runId>"
```

</details>

---

## Sims

<details>
<summary><code>GET</code> <code><b>/api/sims</b></code> — list sims (forks), optionally filtered to one flow version</summary>
<br>

**Type:** `GetSimsReq` → `GetSimsRes` (`packages/types/src/api/sims/get-sims.ts`)<br>
**Service:** `SimService.getAllSims()` / `SimService.getSimsByFlowVersionId()`

##### Query parameters

| name            | type     | required | description                                    |
| --------------- | -------- | -------- | ---------------------------------------------- |
| `flowVersionId` | `string` | no       | when omitted, lists every sim across all flows |

##### Response

```ts
type GetSimsRes = Result<SimListItem[], string>;

type SimListItem = {
  sim: SimRecord;
  flow: FlowRecord; // same shape as GET /api/flows above
  flowVersion: FlowVersionRecord; // same shape as GET /api/flows/:flowId/versions above
};

type SimRecord = {
  id: string;
  name: string;
  description?: string;
  flowId: string;
  flowVersionId: string;
  forkSpecHash: string; // CAS hash of the sim's ForkSpec -- see POST /api/sims below
  createdAt: string;
  updatedAt: string;
};
```

##### Example response

```json
{
  "ok": true,
  "value": [
    {
      "sim": {
        "id": "cljk2x9p10000abcd",
        "name": "reuse-summarize-step",
        "flowId": "flow_7e21a",
        "flowVersionId": "flowver_04",
        "forkSpecHash": "d4e5f6a1b2c3...",
        "createdAt": "2026-08-19T09:00:00.000Z",
        "updatedAt": "2026-08-19T09:00:00.000Z"
      },
      "flow": {
        "id": "flow_7e21a",
        "name": "summarize-document",
        "kind": "business",
        "createdAt": "2026-07-10T09:12:00.000Z",
        "updatedAt": "2026-08-15T11:40:00.000Z"
      },
      "flowVersion": {
        "id": "flowver_04",
        "flowId": "flow_7e21a",
        "sequence": 4,
        "definitionHash": "a1b2c3d4e5f6...",
        "createdAt": "2026-08-15T11:40:00.000Z"
      }
    }
  ]
}
```

##### Example request

```bash
curl "http://localhost:3000/api/sims?flowVersionId=<flowVersionId>"
```

</details>

<details>
<summary><code>POST</code> <code><b>/api/sims</b></code> — save a sim (a named, reusable fork of a run)</summary>
<br>

**Type:** `PostSimsReq` → `PostSimsRes` (`packages/types/src/api/sims/post-sims.ts`)<br>
**Service:** `SimService.saveSim()`

The `{ parentRunId, reuse }` pair is stored as its own CAS artifact (`ForkSpec`,
`packages/types/src/engine/fork-spec.type.ts`) — the sim record itself only
keeps the resulting `forkSpecHash`, not the spec inline. `ForkSpec`'s own doc
comment flags it as narrower than a general simulation spec today ("currently
has properties more specific to a Simulation Spec... may become a broader
simulation spec over time") — several fields are sketched out commented-out
(`flowDefMode`, `forceRerunSteps`, `cascade`, `stepOutputOverrides`), not real yet.

##### Request body

| field           | type       | required | description                           |
| --------------- | ---------- | -------- | ------------------------------------- |
| `name`          | `string`   | yes      |                                       |
| `flowId`        | `string`   | yes      | must match `flowVersionId`'s own flow |
| `flowVersionId` | `string`   | yes      |                                       |
| `parentRunId`   | `string`   | yes      | the run being forked                  |
| `reuse`         | `string[]` | yes      | step ids to reuse from the parent run |
| `description`   | `string`   | no       |                                       |

##### Response

```ts
type PostSimsRes = Result<SimRecord, string>;
// SimRecord -- same shape as GET /api/sims above
```

##### Example response

```json
{
  "ok": true,
  "value": {
    "id": "cljk2x9p10000abcd",
    "name": "reuse-summarize-step",
    "flowId": "flow_7e21a",
    "flowVersionId": "flowver_04",
    "forkSpecHash": "d4e5f6a1b2c3...",
    "createdAt": "2026-08-19T09:00:00.000Z",
    "updatedAt": "2026-08-19T09:00:00.000Z"
  }
}
```

##### Example request

```bash
curl -X POST http://localhost:3000/api/sims \
  -H "Content-Type: application/json" \
  -d '{"name":"reuse-summarize-step","flowId":"...","flowVersionId":"...","parentRunId":"...","reuse":["summarize"]}'
```

</details>

<details>
<summary><code>GET</code> <code><b>/api/sims/:simId</b></code> — fetch a sim's full spec (record + resolved ForkSpec)</summary>
<br>

**Type:** `GetSimSpecReq` → `GetSimSpecRes` (`packages/types/src/api/sims/get-sim.ts`)<br>
**Service:** `SimService.getSim()`

Looks up the sim record, then fetches its `forkSpecHash` back out of CAS and
inlines it as `spec`.

##### Path parameters

| name    | type     | required | description |
| ------- | -------- | -------- | ----------- |
| `simId` | `string` | yes      |             |

##### Response

```ts
type GetSimSpecRes = Result<SimDefinition, string>;

type SimDefinition = {
  sim: SimRecord; // same shape as GET /api/sims above
  spec: ForkSpec;
};

type ForkSpec = {
  parentRunId: string;
  reuse: string[];
};
```

##### Example response

```json
{
  "ok": true,
  "value": {
    "sim": {
      "id": "cljk2x9p10000abcd",
      "name": "reuse-summarize-step",
      "flowId": "flow_7e21a",
      "flowVersionId": "flowver_04",
      "forkSpecHash": "d4e5f6a1b2c3...",
      "createdAt": "2026-08-19T09:00:00.000Z",
      "updatedAt": "2026-08-19T09:00:00.000Z"
    },
    "spec": {
      "parentRunId": "run_3c4d",
      "reuse": ["summarize"]
    }
  }
}
```

##### Example request

```bash
curl http://localhost:3000/api/sims/<simId>
```

</details>

---
