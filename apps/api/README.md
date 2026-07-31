# @supabase-heartbeat/api

NestJS backend for Supabase Heartbeat.

## Responsibilities

Currently implemented:

* HTTP API (NestJS + Express).
* Swagger / OpenAPI documentation.
* SQLite persistence via `better-sqlite3` and Drizzle ORM.
* Explicit, versioned Drizzle migrations.
* An authentication foundation using Better Auth (email/password sign-in,
  an admin plugin with `admin`/`viewer` roles, mounted under `/api/auth`).
* A development proxy that forwards non-API requests to the Vite dev
  server, so the browser only ever talks to this API.
* Production static hosting of the compiled frontend, with an SPA fallback.

**Planned / not yet implemented:**

* Project and workflow domain modules (CRUD, scheduling, execution).
* First-admin onboarding and any restriction on public sign-up.
* Business logic beyond the health check and authentication foundation.

## Current stack

* NestJS 11 on Express.
* TypeScript.
* Drizzle ORM + Drizzle Kit.
* `better-sqlite3`.
* `@nestjs/swagger`.
* Better Auth + `@thallesp/nestjs-better-auth`.
* `dotenv` (loads `apps/api/.env` at startup).
* Jest (unit and e2e tests).

## Source architecture

```text
src/
├── database/   # Drizzle schema, migrations config, DatabaseService/Module
├── frontend/   # Vite dev proxy + production static-hosting integration
├── lib/        # Cross-cutting, domain-independent code (currently: load-env.ts)
└── modules/
    ├── auth/     # Better Auth configuration and NestJS wiring
    └── health/   # GET /api/health
```

`src/lib/` holds cross-cutting, domain-independent code with no dependency
on a specific module — currently just the `.env` loader. Add to it only
when new code genuinely fits that description.

Domain-based module convention, under `src/modules/<domain>/`:

* Controllers handle HTTP concerns and delegate to services.
* Services contain business logic and access Drizzle directly — there is
  no repository layer by default.
* Unit tests are colocated next to the code they test (`*.spec.ts`).
* End-to-end tests live under `test/` at the workspace root, not colocated.
* Database infrastructure (the Drizzle connection, schema, migrations
  config) belongs in `src/database/`, not inside a domain module.
* Frontend hosting integration (the dev proxy and production static
  serving) belongs in `src/frontend/`.

There are no global `controllers/`, `services/`, `routes/`, or
`repositories/` directories, and none should be added.

## Development

```bash
yarn workspace @supabase-heartbeat/api dev
```

This starts only the API (`nest start --watch`), proxying non-API requests
to Vite only if a Vite dev server happens to already be running separately.
For the normal integrated workflow — API and web together, proxy included —
run from the repository root instead:

```bash
yarn dev
```

## Environment variables

Copy [`.env.example`](.env.example) to `.env` in `apps/api/` and fill in
real values. `main.ts` loads it automatically at startup via `dotenv`
(`src/lib/load-env.ts`), before any other module reads `process.env`. Real
environment variables (CI, production, shell exports, test setup files)
always take precedence over `.env` — `dotenv` never overwrites a variable
that is already set.

| Variable | Required | Default | Example | Controls |
|---|---|---|---|---|
| `DATABASE_PATH` | No | `./data/supabase-heartbeat.db` (relative to the process's working directory, which is `apps/api` for every normal entry point) | `./data/supabase-heartbeat.db` | Path to the SQLite database file. The parent directory is created automatically if missing. |
| `BETTER_AUTH_URL` | Yes | none — throws a startup error if unset | `http://localhost:3000` | The base URL Better Auth uses to construct absolute links (e.g. in emails, redirects). |
| `BETTER_AUTH_SECRET` | Yes | none — throws a startup error if unset or shorter than 32 characters | a random string of 32+ characters | Secret used by Better Auth for signing/encryption. Never commit a real value. |
| `PORT` | No | `3000` | `3000` | Port the HTTP server listens on. |
| `NODE_ENV` | No | unset (behaves as development) | `production` | When set to `production`, disables the Vite dev proxy and instead serves the compiled frontend from `apps/web/dist`. |

`DATABASE_PATH` resolution: the API never derives this path from the
compiled file's own location — it resolves purely against
`process.env.DATABASE_PATH` or, if unset, a path relative to the process's
current working directory. Every real entry point (`nest start`,
`node dist/main`, and the test scripts run via
`yarn workspace @supabase-heartbeat/api ...`) launches with that working
directory set to `apps/api`, so the effective default is
`apps/api/data/supabase-heartbeat.db`.

## Database

* **Driver:** `better-sqlite3` (synchronous, file-backed SQLite).
* **ORM:** Drizzle ORM.
* **Migration tool:** Drizzle Kit, with explicit, versioned migrations
  committed under [`drizzle/`](drizzle).
* **Database file behavior:** created automatically at `DATABASE_PATH` (or
  the default described above) the first time the API starts; the parent
  directory is created if it does not exist yet.
* **Test isolation:** unit and e2e tests set `DATABASE_PATH=:memory:` (see
  `src/database/database.service.spec.ts` and
  `test/jest-e2e.setup.ts`) so they never touch a real database file.
* **Enabled PRAGMAs** (set in `DatabaseService`):
  * `foreign_keys = ON` — SQLite disables foreign-key enforcement by
    default; this turns it on so schema-level cascades actually run.
  * `journal_mode = WAL` — lets reads continue while a write is in
    progress, which suits a long-running server process better than
    SQLite's default rollback journal.

## Database commands

```bash
yarn workspace @supabase-heartbeat/api db:check
yarn workspace @supabase-heartbeat/api db:generate
yarn workspace @supabase-heartbeat/api db:migrate
yarn workspace @supabase-heartbeat/api db:studio
```

Workflow:

1. Update the Drizzle schema under `src/database/schema/`.
2. Run `db:check` to validate the configuration.
3. Run `db:generate` to produce a new SQL migration file under `drizzle/`.
4. Review the generated SQL.
5. Run `db:migrate` to apply pending migrations to the configured database.

`db:push` is intentionally not part of this workflow. Migrations are never
run automatically when the application starts — `db:migrate` must be run
explicitly. Always review generated SQL before migrating.

The API also provides `auth:generate`, which regenerates
`src/database/schema/auth.ts` from the Better Auth configuration using the
official Better Auth CLI. Run it again after changing
`src/modules/auth/auth.config.ts` in a way that affects the Better Auth
schema (for example, adding a plugin that requires new columns or tables).

## Tests

```bash
yarn workspace @supabase-heartbeat/api test
yarn workspace @supabase-heartbeat/api test:e2e
yarn workspace @supabase-heartbeat/api test:e2e:prod
```

* `test` — unit tests, colocated with the code under `src/` (health
  controller, database service, Drizzle schema/cascades, Better Auth
  configuration).
* `test:e2e` — boots the real NestJS application (via
  `Test.createTestingModule`) and exercises it over HTTP with an
  in-memory SQLite database (`DATABASE_PATH=:memory:`).
* `test:e2e:prod` — verifies production routing behavior (static assets,
  SPA fallback, API 404s not falling back to HTML). This script **builds
  the web app automatically first**
  (`yarn workspace @supabase-heartbeat/web build`) before running the
  suite, so no manual build step is required.

## Lint, type-check, and build

```bash
yarn workspace @supabase-heartbeat/api lint
yarn workspace @supabase-heartbeat/api typecheck
yarn workspace @supabase-heartbeat/api build
```

`build` compiles the application to `dist/`.

## Routes

```text
GET /api/health      # { status, timestamp, uptime }
/api/docs            # Swagger UI
/api/openapi.json    # OpenAPI document
/api/auth/*          # Better Auth (sign-in, sign-up, session, admin plugin)
```

## Frontend integration

Development:

```text
NestJS :3000 → Vite :5173
```

Every request other than `/api/*` is proxied to the Vite dev server
(including the HMR WebSocket), so the browser only ever needs to visit
`http://localhost:3000`.

Production:

```text
NestJS :3000
  /api/*       → API
  static files → apps/web/dist
  SPA routes   → index.html
```

Unknown `/api/*` routes always return a JSON `404` from NestJS — they are
never handled by the SPA fallback, in either environment.

## Conventions

* Organize business code under `src/modules/<domain>/`.
* No global `controllers/`, `services/`, `routes/`, or `repositories/`
  directories.
* Colocate unit tests next to the code they test.
* No repository layer by default — services use Drizzle directly.
* No handwritten migration SQL unless Drizzle Kit genuinely cannot express
  the required change; document the reason if this happens.
* No migration-on-startup behavior unless explicitly introduced later.
* Update this README whenever API commands, routes, environment variables,
  architecture, or runtime behavior change.
