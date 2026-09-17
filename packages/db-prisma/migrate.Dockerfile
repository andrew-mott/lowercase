# The Postgres migration image: applies pending migrations and exits.
#
# Runs once per deployment, before any host starts, so no host carries the
# Prisma CLI and no replica ever migrates. Built by `pnpm image` after this
# package's `schema` step, because prisma/postgres/schema.prisma is derived at
# build time rather than checked in.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine

# Kept equal to the prisma version this package installs, so the image applies
# migrations with the same engine that generated them.
ARG PRISMA_VERSION=7.8.0

WORKDIR /migrate
RUN npm install --omit=dev prisma@${PRISMA_VERSION} && npm cache clean --force

COPY prisma.postgres.container.config.mjs ./
COPY prisma/postgres/schema.prisma prisma/postgres/schema.prisma
COPY prisma/postgres/migrations prisma/postgres/migrations

# Prisma otherwise checks npm for a newer version on every run.
ENV CHECKPOINT_DISABLE=1

USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy", "--config", "prisma.postgres.container.config.mjs"]
