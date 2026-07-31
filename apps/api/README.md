# @supabase-heartbeat/api

NestJS backend for Supabase Heartbeat.

## Responsibilities

Currently implemented:

* HTTP API (NestJS + Express).
* OpenAPI documentation via a single Scalar reference page, covering both
  the NestJS controllers and the Better Auth endpoints in one merged
  document.
* SQLite persistence via `better-sqlite3` and Drizzle ORM.
* Explicit, versioned Drizzle migrations.
* An authentication foundation using Better Auth (email/password sign-in,
  an admin plugin with `admin`/`viewer` roles, mounted under `/api/auth`),
  including its own generated OpenAPI document and reference UI.
* A Projects API (`/api/projects`) with application-level, ownership-scoped
  CRUD — see "Projects API" below.
* A development proxy that forwards non-API requests to the Vite dev
  server, so the browser only ever talks to this API.
* Production static hosting of the compiled frontend, with an SPA fallback.

**Planned / not yet implemented:**

* Workflow domain modules (CRUD, scheduling, execution).
* Project sharing / multi-user access to the same project.
* First-admin onboarding and any restriction on public sign-up.
* Business logic beyond the health check, authentication foundation, and
  Projects API.

## Current stack

* NestJS 11 on Express.
* TypeScript.
* Drizzle ORM + Drizzle Kit.
* `better-sqlite3`.
* `@nestjs/swagger` + `@scalar/express-api-reference` + `@scalar/api-reference` (merged `/api/docs` page, see "API documentation").
* Better Auth + `@thallesp/nestjs-better-auth`.
* `class-validator` + `class-transformer` (request DTO validation; see "Projects API").
* `dotenv` (loads `apps/api/.env` at startup).
* Jest (unit and e2e tests).

## Source architecture

```text
src/
├── database/   # Drizzle schema, migrations config, DatabaseService/Module
├── frontend/   # Vite dev proxy + production static-hosting integration
├── lib/        # Cross-cutting, domain-independent code
│   ├── load-env.ts        # Loads apps/api/.env at startup
│   ├── swagger/            # Merged OpenAPI document + Scalar page (see "API documentation")
│   └── authorization/      # AuthenticatedActor, ForbiddenResourceError, actor mapping (see "Row authorization")
└── modules/
    ├── auth/       # Better Auth configuration and NestJS wiring
    ├── health/     # GET /api/health
    └── projects/   # Projects API — CRUD with ownership authorization (see "Projects API")
```

`src/lib/` holds cross-cutting, domain-independent code with no dependency
on a specific module. Add to it only when new code genuinely fits that
description.

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

## Closed-set columns

Application-owned columns that only ever accept a fixed set of values
(`workflows.overlap_policy`, `workflow_steps.type`,
`workflow_runs.trigger_type`, `workflow_runs.status`, `step_runs.status`)
have their valid values declared once, as canonical readonly tuples, in
[`src/database/schema/types.ts`](src/database/schema/types.ts). Each tuple
is used in two places:

* **TypeScript** — Drizzle's SQLite `text('column', { enum: [...] })`
  inference narrows `$inferSelect`/`$inferInsert` to the tuple's union
  type, so an invalid literal fails to compile.
* **SQLite** — a named `CHECK` constraint (e.g.
  `workflow_steps_type_check`) enforces the same set at the database
  level, so an invalid value is rejected even through raw SQL or any other
  path that bypasses TypeScript.

Both layers are required: TypeScript inference alone is a compile-time
convenience with no runtime effect once a value reaches the database.

`workflow_steps.type` selects which step executor and configuration schema
applies; `workflow_steps.configuration` (`text(..., { mode: 'json' })`)
stores the parameters specific to that step instance. The database only
guarantees the column holds valid JSON and an allowed step type — it does
not validate the JSON's shape against the step type. Structural validation
of `configuration` belongs in the application layer (a shared validation
package, not yet initialized) and runs before a service passes the value
to Drizzle.

## Row authorization

SQLite has no PostgreSQL-style row-level security, and Better Auth does
not provide it either: Better Auth authenticates the HTTP request (who is
making it) but never injects that identity into SQLite, modifies Drizzle
queries, or filters rows by owner on its own. Authorization is therefore
enforced explicitly at the application level:

```text
HTTP request
  → Better Auth session validation
  → authenticated actor (userId + role)
  → controller passes the actor and input to a service
  → domain service applies ownership-scoped authorization
  → ownership-scoped Drizzle query
  → SQLite
```

Boundaries:

* **Controllers** receive the Better Auth actor, validate HTTP input, and
  pass the actor to services. They must not query Drizzle directly,
  encode ownership rules, trust a client-supplied owner ID, or perform an
  unscoped list/update/delete.
* **Services** receive the actor, scope every user-facing query by
  ownership (or explicit access), and reject resources the actor does not
  own — never an unscoped lookup followed by an unscoped mutation.
* **SQLite** enforces foreign keys, cascades, uniqueness, JSON validity,
  and the closed-set `CHECK` constraints above. None of that is
  authorization — it is data integrity.

Current ownership hierarchy: `projects.owner_id → users.id`. Every child
table (`workflows`, `workflow_steps`, `workflow_runs`, `step_runs`) derives
its owner by joining up to `projects`; `owner_id` is intentionally not
duplicated onto each child table. An `admin` role may get cross-owner
access, but only where a specific endpoint and service explicitly opt into
administrative behavior — an admin request is never treated as globally
unscoped by default. The `viewer` role has no implicit access to another
user's projects; there is no project-sharing model yet. A future
`project_members` table (project/user/access-level) will be needed before
sharing exists, but it is not part of the schema today.

A minimal reusable foundation lives in
[`src/lib/authorization/`](src/lib/authorization): `AuthenticatedActor`
(the actor shape services receive), `ForbiddenResourceError` (a
`ForbiddenException` for a service to throw when an actor lacks access),
and `toAuthenticatedActor` (maps a Better Auth session, obtained via
`@Session()`, into an `AuthenticatedActor`). It intentionally stays this
small — no policy engine, repository layer, or membership table.

The Projects API (below) is the first module built on this foundation.

## Projects API

`/api/projects` — the first ownership-protected domain module
(`src/modules/projects/`), demonstrating the row-authorization model above
end to end.

**Authentication:** every endpoint requires an authenticated Better Auth
session (enforced by the global `AuthGuard` from
`@thallesp/nestjs-better-auth`; there is no route-level opt-out here).
`@Session()` supplies the session to the controller, which converts it to
an `AuthenticatedActor` via `toAuthenticatedActor` and passes only that to
`ProjectsService` — the controller never queries Drizzle itself.

**Role matrix**, enforced server-side (`@Roles(['admin'])` on mutation
routes, plus a matching check inside `ProjectsService` as a defense-in-depth
backstop for any caller that reaches the service directly):

| Operation          | Admin | Viewer |
| ------------------ | ----: | -----: |
| List own projects   |   Yes |    Yes |
| Read own project     |   Yes |    Yes |
| Create project     |   Yes |     No |
| Update own project |   Yes |     No |
| Delete own project |   Yes |     No |

A viewer mutation attempt returns `403 Forbidden`. `admin` does **not**
bypass ownership on these endpoints — an admin can only act on projects
they own themselves; cross-owner administration is out of scope for this
module (see "Row authorization" above).

**Ownership scoping**, enforced in `ProjectsService`, never in the
controller:

* **List** (`GET /api/projects`) — `WHERE owner_id = actor.userId`, ordered
  by `created_at` descending (most recently created project first).
* **Create** (`POST /api/projects`) — `owner_id` is always
  `actor.userId`. Any client-provided ownership field is rejected outright
  (see validation below), not silently dropped.
* **Read** (`GET /api/projects/:projectId`) — `WHERE id = :projectId AND
  owner_id = actor.userId`.
* **Update** (`PATCH /api/projects/:projectId`) — a single scoped `UPDATE
  ... WHERE id = :projectId AND owner_id = actor.userId ... RETURNING`;
  never an unscoped lookup followed by an unscoped write.
* **Delete** (`DELETE /api/projects/:projectId`) — a single scoped `DELETE
  ... WHERE id = :projectId AND owner_id = actor.userId ... RETURNING`,
  relying on the existing database cascades for the owned hierarchy
  (workflows, steps, runs).

**Cross-owner and nonexistent resources are indistinguishable**: reading,
updating, or deleting a project ID that exists but is owned by another
user returns the same `404 Not Found` (`ProjectNotFoundError`) as a
nonexistent ID, so the API never discloses whether a given project ID
belongs to someone else.

**Validation:** request bodies are validated with `class-validator` DTOs
(`CreateProjectDto`, `UpdateProjectDto`) through a global `ValidationPipe`
(`whitelist: true, forbidNonWhitelisted: true, transform: true`) — this is
also what rejects `ownerId`, `id`, `createdAt`, `updatedAt`, or any other
unexpected body field with `400 Bad Request` rather than silently dropping
it. An empty `PATCH` body (`{}`) is rejected by `ProjectsService` with
`400 Bad Request`. `supabaseUrl` must be an `http`/`https` URL; `name` and
`publishableKey` must be non-empty after trimming.

**Response shape** — a stable, camelCase public representation, mapped by
hand in `ProjectsService` from the Drizzle row (never the raw row):

```ts
{
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  supabaseUrl: string;
  publishableKey: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

Returning `publishableKey` is intentional — Supabase's publishable (anon)
key is public by design, unlike a service-role key (never handled by this
API).

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
  in-memory SQLite database (`DATABASE_PATH=:memory:`), including
  `/api/docs`, `/api/openapi.json`, and the Better Auth documentation
  routes (`test/docs.e2e-spec.ts`). The documentation merge itself
  (`setupSwagger`) depends on the real `AuthService`, so it is only
  exercised here, not as an isolated unit test.
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
GET /api/health                          # { status, timestamp, uptime }
/api/docs                                # Scalar reference UI (single merged document)
/api/openapi.json                        # Merged OpenAPI document (NestJS + Better Auth)
/api/auth/*                              # Better Auth (sign-in, sign-up, session, admin plugin)
/api/auth/open-api/generate-schema       # Better Auth's own (unmerged) OpenAPI document
GET    /api/projects                     # List the authenticated actor's own projects
POST   /api/projects                     # Create a project (admin only)
GET    /api/projects/:projectId          # Read an owned project
PATCH  /api/projects/:projectId          # Partially update an owned project (admin only)
DELETE /api/projects/:projectId          # Delete an owned project (admin only)
```

See "Projects API" above for authentication, role, and ownership-scoping
details.

## API documentation

`/api/docs` is a single Scalar reference page backed by a single merged
OpenAPI document served at `/api/openapi.json`. The document merges two
independently generated sources:

* The NestJS document, generated by `@nestjs/swagger` from decorated
  controllers (`GET /api/health`, retagged `Health`).
* Better Auth's own document, generated by Better Auth's `openAPI()` plugin
  (`src/modules/auth/auth.config.ts`), covering every Better Auth endpoint
  (core, email/password, session, and the endpoints contributed by the
  admin plugin). Better Auth's endpoints are not decorated NestJS
  controllers — they are served through Better Auth's own request handler
  (`@thallesp/nestjs-better-auth`), so they never appear in the NestJS
  document on their own. Rather than hand-writing NestJS controllers to
  mirror them (which would drift out of sync), Better Auth's document is
  generated by Better Auth itself, in-process, via `AuthService.api
  .generateOpenAPISchema()` — the same function backing Better Auth's own
  `/api/auth/open-api/generate-schema` route — every time `/api/openapi.json`
  is requested, so it can never go stale.

The merge (`src/lib/swagger/swagger.config.ts`) prefixes Better Auth's paths
with `/api/auth` (they are relative to Better Auth's own base path) and
renames Better Auth's own tags (`Default` → `Authentication`, `Admin` →
`Authentication Admin`), so the single page groups endpoints by tag
(`Health`, `Authentication`, `Authentication Admin`) instead of needing a
document selector. Both the tag list and each tag's operations are sorted
alphabetically. Better Auth's document is OpenAPI 3.1-shaped (it uses the
`type: [T, "null"]` nullable form, invalid under 3.0), so the merged
document declares `openapi: 3.1.0`; the NestJS document's 3.0.0 content is
valid under 3.1 too, so nothing is lost.

Better Auth's own (unmerged) document remains available on its own at
`/api/auth/open-api/generate-schema`, for anyone who wants Better Auth's
endpoints in isolation. Its own Scalar reference page is disabled
(`openAPI({ disableDefaultReference: true })` in `auth.config.ts`) so
`/api/docs` is the only documentation UI — `/api/auth/reference` returns
404 rather than a second, redundant docs page.

`/api/docs` renders with `@scalar/express-api-reference`, using
`@scalar/api-reference`'s standalone browser bundle served directly from
this app (not the package's default jsDelivr CDN), so the page has no
runtime dependency on a third party.

All of the routes above are reachable without an authenticated session.
Generated documentation is the source of truth for exact endpoint
shapes — this README does not duplicate a full endpoint list.

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
