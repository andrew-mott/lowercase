# @lcase/desktop

Electron shell that reuses the `workbench` UI in a desktop window rather than a
browser tab. One of the two intended delivery targets, alongside the HTTP server
plus browser.

## Status: dormant

Nothing in CI verifies this app. It has no `typecheck`, `lint` or `test` script,
so it is the one workspace package that can stop compiling without anything
noticing. Its Electron IPC bootstrap and root React shell live in
[`packages/archive/`](../../packages/archive/) as `controller` and `ui` — real
dependencies, kept as reference scaffolding for a rebuild rather than deleted.

Treat it as a placeholder holding the target open. A revival would start by
deciding how much of `archive/` survives, not by building on it as it stands.
