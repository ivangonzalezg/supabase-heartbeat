# syntax=docker/dockerfile:1

# Builds and runs Supabase Heartbeat behind a single port: the compiled web
# app is served as static files by the NestJS API (see
# apps/api/src/frontend/), so only the API process runs at container
# runtime. Build context is the repository root (Yarn workspaces monorepo).

FROM node:24-trixie-slim AS base
WORKDIR /repo
RUN corepack enable

# ---------------------------------------------------------------------------
# deps: install every workspace's dependencies once, cached by lockfile.
# better-sqlite3 needs to compile a native addon, hence the build toolchain.
# ---------------------------------------------------------------------------
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN yarn install --immutable

# ---------------------------------------------------------------------------
# build: compile the shared validation package, the web app, then the API.
# Mirrors the root `yarn build` script.
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN yarn workspace @supabase-heartbeat/validation build \
  && yarn workspace @supabase-heartbeat/web build \
  && yarn workspace @supabase-heartbeat/api build

# ---------------------------------------------------------------------------
# runtime: production node_modules, plus drizzle-kit (needed by the
# entrypoint to apply pending migrations on every container start — see
# docker-entrypoint.sh) and the compiled output.
# apps/api and apps/web are kept as sibling directories so
# getFrontendBuildPath()'s `resolve('..', 'web', 'dist')` still resolves
# correctly with cwd=apps/api.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN yarn workspaces focus @supabase-heartbeat/api --production \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && yarn cache clean

# drizzle-kit is a devDependency (excluded by --production above), but the
# entrypoint needs its CLI to apply pending migrations on container start
# (see docker-entrypoint.sh). Installed as its own step, pinned to the same
# version apps/api/package.json's devDependencies declares.
RUN yarn workspace @supabase-heartbeat/api add --exact drizzle-kit@0.31.10

COPY --from=build /repo/packages/validation/dist packages/validation/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
COPY apps/api/drizzle.config.ts apps/api/drizzle.config.ts
COPY --from=build /repo/apps/web/dist apps/web/dist

COPY docker-entrypoint.sh /repo/docker-entrypoint.sh
RUN chmod +x /repo/docker-entrypoint.sh

WORKDIR /repo/apps/api
EXPOSE 7854
ENTRYPOINT ["/repo/docker-entrypoint.sh"]
