# UI Workspace Initiative — Arc: Server API reference docs (Change C51)

**Previous:** [Theme logic + visual polish](./theme-and-visual-polish.md) (Change C50) · **Next:** [Web app API usage audit](./api-usage-audit.md) (Change C52)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log. Named in `docs/todo.md` on 2026-08-14 while pruning old pages — `docs/request-flow-map.md` (a page→component→hook→route→service quick-reference) was useful for confirming what a couple of old pages still uniquely provided, which surfaced the idea of rebuilding it as something more substantial.

## Change C51 — Server API reference — merged (PR #334)

### Discussion

**What this actually is, clarified 2026-08-22.** Two originally-conflated ideas, deliberately split into two Changes:

1. **This Change**: a hand-written, swagger-style reference for `apps/http-server`'s REST API — request/response shapes, one file, `docs/api-reference.md`. Purely additive, docs-only.
2. **Change C52**: an audit of what the web app actually consumes from those responses vs. what's available — done as a separate look _after_ this Change exists, since having the real API surface written down first is what makes that comparison possible. Not scoped yet.

**Not real OpenAPI/Swagger generation, and not blocked on becoming that.** Checked the routes directly (`apps/http-server/src/routes/`) — none attach Fastify `schema` objects; validation is hand-rolled per-handler and types come from `@lcase/types` without being wired to Fastify's schema layer. Generating a real spec would mean adding schema to every route first, a code-touching precursor task, not a docs Change. Explicitly deferred — the user's own framing: "I'm not trying to build all of the schemas right now. That's a later problem, and I do want that. At that point, maybe it becomes generated, actually." This Change is hand-written from real TypeScript types (`packages/types`), not schema, and is expected to be kept up to date manually until that later point.

**`docs/request-flow-map.md` is stale and not this Change's job.** Still describes the pre-Explorer page structure (`Runs.tsx`/`Flows.tsx`/`Sims.tsx` as standalone routed pages) and is missing the `evals` routes entirely. Its fate — retired, folded into the new doc, or left as a distinct frontend-side reference — is deliberately left open until after Change C52's audit makes it obvious what (if anything) still needs it.

**Format, settled 2026-08-22 after two rounds of reference examples + one live prototype.** The user supplied two examples (gitignored scratch files, `apps/web-app/swagger-{1,2}.temp.md`) — a stubby4j-style doc and a rougher hand-written one. Neither used as-is; synthesized instead:

- Collapsible `<details>`/`<summary>` per endpoint (accordion pattern) — summary line shows method + path + one-line description only, full request/response detail stays collapsed until expanded. Explicit user framing: "the headline of the accordion piece should give you the minimum, and then you expand it to actually see it when you wanna reference it."
- A `Type:`/`Service:` line naming the real `packages/types` type and the service method backing the route — keeps the doc traceable to real code without schema. Confirmed useful, not noise, once seen in the live prototype.
- **Real correction over both reference examples**: their own "Responses" tables carried zero information ("200 → `application/json` → JSON"), all real content lived only in a separate example block. Since this app's routes don't vary meaningfully by HTTP status — everything returns `200` with a discriminated `{ ok: true, ... } | { ok: false, error }` body (`packages/types`' established envelope shape, see memory `user_result_envelope_philosophy`) — the Response section here shows that union directly as a type block, not a status-code table.
- Base URL header (from example 2), grouped by resource area under `##` headings with `---` dividers (from example 1).

Prototyped against one real route (`POST /api/runs`) directly in chat first, then written to a real file once the shape was approved, per the user's explicit ask to review on disk/in an editor rather than judge markdown rendering inside the chat transcript. First real entry: `POST /api/runs`.

**Pace: one endpoint reviewed at a time**, not a single mechanical pass over all ~19 routes. User's own framing: "we take this one input at a time that I can review one at a time."

**Already paying off before Change C52 even starts.** Writing out `GET /api/runs/:runId`'s full `RunDetail` shape (2026-08-22) made it immediately visible how far that response has grown — five nested record types plus a shared `ArtifactIndex`. User's own reaction: "this endpoint has sort of expanded way beyond what I wanted it to... this exposes it very cleanly, which is why I wanted to do this." Explicitly not chasing that now — real signal to revisit once Change C52's audit looks at what the UI actually reads from it, not a mid-Change-51 detour.

**Editorial boundary, settled 2026-08-22: request/response shape and caller-relevant behavior belong in this doc; internal implementation trivia doesn't, even when true and interesting.** Surfaced when `GET /api/sims/:simId`'s entry noted that `isHash` doesn't actually verify anything hash-shaped and a sim's `id` is really a Prisma `cuid()` — accurate, but the user pulled it back out: "parts of this doc have touched on some internals, and sometimes I let it go... but also some of this is supposed to be a reference doc." Moved to `docs/todo.md` instead (part of a broader future validator-naming cleanup). The line isn't "no internal detail ever" — things like `getFlowDef()` silently also accepting a hash where the param is named `:flowId`, or a route taking only the first multipart file part, stayed in, because they change what a caller can actually send or expect. The line is whether it's caller-relevant, not whether it's true or interesting.

### What actually landed

`docs/api-reference.md` — a new, hand-written reference covering the full `apps/http-server` route set: 21 endpoints across five resource sections (Artifacts, Evals, Flows, Runs, Sims). Format settled iteratively and applied consistently across every entry once each piece was approved:

- `<details>`/`<summary>` accordion per endpoint, `Type:`/`Service:` line naming the real `packages/types` type and service method.
- Request shape as a markdown table when it flattens (field/type/required/description), a nested `type` block below it when it doesn't (e.g. `PostEvalsReqTarget`) — both together, not one instead of the other.
- Response shown as a real TypeScript type block (not a status-code table — see the Discussion section above on why), followed by a concrete **Example response** (realistic fake JSON) and an **Example request** (curl). Every entry ended up with an example response, even simple ones — the user's own reasoning: turning a type into a concrete shape is sometimes easy, sometimes hard, and the example does that work so the reader doesn't have to.
- Large/actively-evolving nested types (`AnyEvent`'s per-domain catalog, `FlowDefinition`'s `StepDefinition` union) deliberately not fully expanded — referenced by name/path instead, with a short note on why, rather than bloating an endpoint entry with a different subsystem's whole spec.
- Sections ordered alphabetically (Artifacts, Evals, Flows, Runs, Sims); routes within a section ordered by same literal path first, then method convention (GET → POST → PATCH) within that path — except `POST /api/flows/files`, kept next to `POST /api/flows` by intent despite its different literal path, per explicit user call.
- A top-of-file `_Last updated: <date>_` line as a coarse freshness signal; real per-entry staleness is a `git blame`/`git log -p` job, not something a single stamp can carry.

Real findings surfaced while writing it, all routed to `docs/todo.md` rather than re-explained here (see that file for the full detail on each): `RunListItem`'s missing `status`/`simId`/`flowId` fields vs. what `RunRecord` actually has; `GET /api/runs/:runId/params`'s full derivability from `GET /api/runs/:runId`; the `AnyEvent` narrowing gap and a matching `Result<V, E>` key-naming idea, both real hand-designed-TypeScript refactors the user wants to revisit together later, not now; `PostFlowReq`'s misleading name; a broader route-validator naming looseness (`isHash` et al.); `ArtifactUpdateMetadata`'s null/undefined-vs-absent asymmetry and `POST /api/artifacts`'s dual-mode complexity, both flagged as "might not need fixing" rather than confirmed problems; and the flow-definition spec itself having no documentation home anywhere yet.

`docs/request-flow-map.md` was deliberately left untouched — still stale, its fate handed off to Change C52 once the audit makes clear what (if anything) still needs it.
