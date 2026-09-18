# @lcase/workbench

React frontend for the workflow engine's [`http-server`](../http-server) — the Workbench dockview workspace, plus Evals and System pages. See the [repo root README](../../README.md) for the overall project.

## Development

```bash
pnpm -F @lcase/workbench dev
```

or from this directory:

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

Runs `tsc -b && vite build`, producing a static production bundle in `dist/`. Preview it locally with `pnpm preview`.

That build is what [`apps/http-server`](../http-server) serves: `pnpm deploy:build` copies it beside the API bundle and the API image serves it at the same address as the API, so a deployment runs nothing else for the frontend. Development is unaffected — Vite still serves this app with hot reload against a separately running server.

## Pointing at a different server

A build talks to the server that served it, since that is where the API is when the HTTP server serves this app. In development Vite is a different origin from the API, so the app talks to `http://localhost:3000`. Override either with `VITE_SERVER_URL`:

```bash
VITE_SERVER_URL=https://example.com pnpm build
```

For local dev, drop the same variable in a gitignored `.env.local` in this directory instead:

```
VITE_SERVER_URL=http://localhost:4000
```

## Other commands

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## API reference

See [`docs/api-reference.md`](../../docs/api-reference.md) for the `http-server` endpoints this app calls.
