# The Worker host image: Node and one bundled file, with nothing installed.
#
# Built by `pnpm image`, which bundles first, so the bundle copied here is never
# stale. All configuration arrives as environment variables at run time.

ARG NODE_VERSION=24
# Alpine's musl libc is safe here because the bundle carries no native code:
# Prisma runs through its WebAssembly query compiler, and pg and redis are
# plain JavaScript.
FROM node:${NODE_VERSION}-alpine

WORKDIR /app
COPY bundle/worker-host.mjs bundle/worker-host.mjs.map ./

USER node
CMD ["node", "--enable-source-maps", "worker-host.mjs"]
