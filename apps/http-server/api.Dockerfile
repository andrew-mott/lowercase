# The API host image: Node, one bundled file and the workbench it serves, with
# nothing installed.
#
# Built by `pnpm image`, which bundles first, so the bundle copied here is never
# stale. All configuration arrives as environment variables at run time.

ARG NODE_VERSION=24
# Alpine's musl libc is safe here because the bundle carries no native code:
# Prisma runs through its WebAssembly query compiler, and pg and redis are
# plain JavaScript.
FROM node:${NODE_VERSION}-alpine

WORKDIR /app
COPY bundle/api.mjs bundle/api.mjs.map ./
# The frontend, served by this host at the same address as the API, so a
# deployment needs nothing else running. Built by the workbench's own vite
# build and copied beside the bundle.
COPY bundle/workbench ./workbench
ENV WORKBENCH_DIR=/app/workbench

# The replay sink writes per-run logs under the working directory, and replay
# reads them back from there, so the process runs in a directory it owns and a
# deployment mounts a volume here to keep replay history across containers.
RUN mkdir /data && chown node:node /data
WORKDIR /data

# The host's own default is 127.0.0.1, which nothing outside a container reaches.
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000

USER node
CMD ["node", "--enable-source-maps", "/app/api.mjs"]
