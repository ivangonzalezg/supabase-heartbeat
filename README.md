# Supabase Heartbeat

Supabase Heartbeat is an early-stage, self-hosted application for configuring
and executing scheduled activity against Supabase projects.

**Current status:** the project has a working NestJS API (with SQLite
persistence, Drizzle migrations, a Better Auth authentication foundation,
and ownership-scoped Projects and Workflows APIs). Workflows are created
together with their complete ordered step list transactionally, and
steps can be managed afterward through a dedicated, ownership-protected
API. A workflow's enabled steps can be executed manually and
synchronously via a dedicated endpoint; scheduled/cron-triggered
execution is not implemented yet — see the
[API README](apps/api/README.md) for the exact current scope.

## Repository structure

```text
supabase-heartbeat/
├── apps/
│   ├── api/            # NestJS backend: HTTP API, SQLite/Drizzle persistence, auth
│   └── web/            # React + Vite frontend
├── packages/
│   ├── contracts/      # Reserved for shared types/contracts — placeholder only
│   └── validation/      # Shared, browser-compatible Zod validation (workflow steps) — see apps/api/README.md
├── package.json
├── yarn.lock
├── .yarnrc.yml
├── tsconfig.base.json
└── README.md
```

`packages/contracts` currently contains only a minimal `package.json` —
no shared code has been added to it yet. `packages/validation` is an
active workspace; see "Shared validation package" in
[apps/api/README.md](apps/api/README.md) for what it provides.

## Requirements

* **Node.js** — the workspaces target Node 24.x (see `@types/node` in
  [apps/api/package.json](apps/api/package.json) and
  [apps/web/package.json](apps/web/package.json)). No `.nvmrc` or
  `.node-version` file is committed yet, so install a current Node 24
  release manually.
* **Yarn** — version is pinned via the `packageManager` field in
  [package.json](package.json) (currently `yarn@4.10.3`). Do not install a
  different Yarn version manually; let Corepack manage it.
* **Corepack** — ships with Node.js; used to activate the pinned Yarn
  version.

## Installation

```bash
corepack enable
yarn install
```

Do not use `npm install`, `pnpm`, or `bun` — this repository uses a single
Yarn 4 lockfile with the `node-modules` linker (see
[.yarnrc.yml](.yarnrc.yml)).

## Integrated development

```bash
yarn dev
```

This starts both the API and the web app together. The normal browser entry
point is:

```text
http://localhost:3000
```

Development request flow:

```text
Browser → NestJS :3000
  /api/* → NestJS
  /*     → Vite :5173
```

Vite's dev server on port `5173` is an internal implementation detail: the
NestJS process proxies everything else there, so the browser never needs to
visit it directly.

## Workspace development

Each application can also be started on its own:

```bash
yarn workspace @supabase-heartbeat/api dev
yarn workspace @supabase-heartbeat/web dev
```

This is useful when you only need to iterate on one side (for example,
restarting just the API without also restarting Vite), or when debugging an
issue isolated to a single workspace. When run this way, the API's
development proxy and the frontend's dev server are no longer wired
together automatically — use the integrated `yarn dev` for the normal
`http://localhost:3000` workflow.

## Repository commands

Run from the repository root:

```bash
yarn dev        # start API + web together (see above)
yarn build      # build web, then build the API (see "Production build")
yarn lint       # lint every workspace
yarn typecheck  # type-check every workspace
yarn test       # run unit/component tests in every workspace
```

Each of these fans out to the same-named script in every workspace that
defines it (`apps/api`, `apps/web`; the placeholder packages define none of
these yet, so they are silently skipped).

## Testing

* **Unit tests** (API and web): `yarn test` from the root, or
  `yarn workspace <name> test` for a single workspace.
* **API e2e tests**: `yarn workspace @supabase-heartbeat/api test:e2e` —
  exercises the real NestJS app (health endpoint, routing) against an
  in-memory SQLite database.
* **API production-routing e2e tests**:
  `yarn workspace @supabase-heartbeat/api test:e2e:prod` — builds the web
  app and verifies NestJS serves it correctly in production mode (static
  assets, SPA fallback, API 404 behavior).
* **Frontend tests**: `yarn workspace @supabase-heartbeat/web test` (Vitest
  + React Testing Library).
* **Watch mode**: `yarn workspace @supabase-heartbeat/api test:watch` or
  `yarn workspace @supabase-heartbeat/web test:watch`.

See [apps/api/README.md](apps/api/README.md) and
[apps/web/README.md](apps/web/README.md) for full details on what each
suite covers.

## Production build

```bash
yarn build
```

This builds, in order:

1. `apps/web/dist` — the compiled frontend.
2. `apps/api/dist` — the compiled NestJS application.

In production, NestJS serves the compiled frontend directly (static assets
plus an SPA fallback to `index.html`) instead of proxying to Vite. Docker
packaging is not part of this repository yet.

## Environment

The API reads its configuration from environment variables. See
[apps/api/.env.example](apps/api/.env.example) for the current list and
[apps/api/README.md](apps/api/README.md#environment-variables) for what
each one controls.

The web application does not currently require its own environment file —
it only ever makes relative `/api/...` requests, which the API's dev proxy
and production static hosting both handle.

Public sign-up is disabled. To create the first administrator, set
`FIRST_ADMIN_EMAIL` and `FIRST_ADMIN_PASSWORD` before starting the API —
see [apps/api/README.md](apps/api/README.md#first-administrator-bootstrap)
for details.

## Database

The API persists data to a local SQLite file using `better-sqlite3` and
Drizzle ORM, with explicit, versioned migrations (Drizzle Kit). Migrations
are **not** run automatically when the application starts — they must be
applied explicitly. Database files (`*.db`, `*.db-shm`, `*.db-wal`, and the
`data/` directory) are ignored by Git.

See [apps/api/README.md](apps/api/README.md#database) for the full database
workflow and commands.

## API documentation

Once the API is running, interactive documentation is available at:

```text
/api/docs           # Scalar reference UI — single merged document
/api/openapi.json   # Merged OpenAPI document (NestJS + Better Auth)
```

See [apps/api/README.md](apps/api/README.md#api-documentation) for how the
Better Auth endpoints are documented alongside the NestJS ones.

## Documentation links

* [API documentation](apps/api/README.md)
* [Web documentation](apps/web/README.md)
* [Agent instructions](AGENTS.md)

## License

License: To be determined.
