# The deployment tasks image: Node and the bundled tasks, with nothing installed.
#
# Built by `pnpm deploy:build`, which bundles first, so the bundle copied here is
# never stale. All configuration arrives as environment variables at run time.

ARG NODE_VERSION=24
# Alpine's musl libc is safe here because the bundle carries no native code:
# the Redis client is plain JavaScript.
FROM node:${NODE_VERSION}-alpine

WORKDIR /app
COPY bundle/provision.mjs bundle/provision.mjs.map ./

USER node
CMD ["node", "--enable-source-maps", "provision.mjs"]
