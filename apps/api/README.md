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
  including its own generated OpenAPI document and reference UI. Public
  account creation is disabled — see "First-administrator bootstrap"
  below.
* A Projects API (`/api/projects`) with application-level, ownership-scoped
  CRUD — see "Projects API" below.
* A Workflows API (`/api/projects/:projectId/workflows`), nested under
  Projects, with the same ownership model — see "Workflows API" below.
  Configuration CRUD only; steps, scheduling, and execution are not
  implemented yet.
* A development proxy that forwards non-API requests to the Vite dev
  server, so the browser only ever talks to this API.
* Production static hosting of the compiled frontend, with an SPA fallback.

**Planned / not yet implemented:**

* Workflow steps, step reordering, manual/scheduled execution, workflow
  runs, step runs.
* Project sharing / multi-user access to the same project.
* Frontend administration UI for creating additional users.
* Business logic beyond the health check, authentication foundation,
  Projects API, and Workflows API.

## Current stack

* NestJS 11 on Express.
* TypeScript.
* Drizzle ORM + Drizzle Kit.
* `better-sqlite3`.
* `@nestjs/swagger` + `@scalar/express-api-reference` + `@scalar/api-reference` (merged `/api/docs` page, see "API documentation").
* Better Auth + `@thallesp/nestjs-better-auth`.
* `class-validator` + `class-transformer` (request DTO validation; see "Projects API").
* `cron` (validates workflow cron expressions using the same parser
  `@nestjs/schedule` will use once scheduling is implemented — see
  "Workflows API").
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
    ├── auth/        # Better Auth config, permissions, first-admin bootstrap (see "First-administrator bootstrap")
    ├── health/      # GET /api/health
    ├── projects/    # Projects API — CRUD with ownership authorization (see "Projects API")
    └── workflows/   # Workflows API — nested under Projects (see "Workflows API")
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
| `FIRST_ADMIN_EMAIL` | No, but required together with `FIRST_ADMIN_PASSWORD` | none | `admin@example.com` | Bootstraps the first administrator at startup. See "First-administrator bootstrap" below. |
| `FIRST_ADMIN_PASSWORD` | No, but required together with `FIRST_ADMIN_EMAIL` | none | a strong initial password | Bootstrap secret — see "First-administrator bootstrap" below for secret-management guidance. |
| `FIRST_ADMIN_NAME` | No | `Admin` | `Admin` | Display name for the bootstrapped administrator. Alone (without the two variables above), it has no effect. |

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

## First-administrator bootstrap

Public account creation is disabled
(`emailAndPassword.disableSignUp: true` in `auth.config.ts`).
`POST /api/auth/sign-up/email` remains registered and documented in the
generated OpenAPI schema (Better Auth's `disableSignUp` is a runtime
guard, not a route removal), but every call to it now fails with
`400 Bad Request` and `{ "code": "EMAIL_PASSWORD_SIGN_UP_DISABLED" }`.
**Email/password sign-in (`POST /api/auth/sign-in/email`) is unaffected**
and remains the normal way to authenticate.

With public signup gone, the only way to get an initial account is the
optional first-administrator bootstrap
(`FirstAdminBootstrapService`, `src/modules/auth/`), which runs once at
startup (`OnApplicationBootstrap`, after every module's `onModuleInit` has
completed — including the database connection check and Better Auth's own
initialization) and creates exactly one administrator from
`FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` / `FIRST_ADMIN_NAME`, using
Better Auth's server-side admin API (`auth.api.createUser`) — never a
direct Drizzle insert, never manual password hashing, never the public
signup endpoint, and never a created session.

**Configuration matrix:**

| `FIRST_ADMIN_EMAIL` | `FIRST_ADMIN_PASSWORD` | Result |
|---|---|---|
| absent | absent | Bootstrap skipped cleanly; the API starts normally. `FIRST_ADMIN_NAME` alone does **not** activate bootstrap. |
| present | absent | **Startup fails** with a configuration error naming the missing variable. |
| absent | present | **Startup fails** with a configuration error naming the missing variable. |
| present | present | Bootstrap is validated and attempted (see below). |

When both are present, the email is trimmed and lowercased, and the
password is validated against Better Auth's configured minimum/maximum
password length (defaults: 8–128 characters; not overridden in
`auth.config.ts`) — **but is never trimmed**, since whitespace is a valid
password character. `FIRST_ADMIN_NAME` is trimmed and defaults to `Admin`
if unset or blank after trimming.

**Bootstrap algorithm**, once configuration is valid:

1. If an administrator (`role = 'admin'`) already exists anywhere in the
   database, log a concise skip message and return — this makes restarts
   idempotent even if `FIRST_ADMIN_EMAIL` changes between runs.
2. Otherwise, check whether the configured email already belongs to a
   user:
   * **No existing user** — create the administrator.
   * **Existing user with role `admin`** — treat bootstrap as already
     satisfied and skip (idempotent restart with the exact same
     configuration).
   * **Existing user with any other role** — **fail startup** with an
     actionable error naming the conflicting email. The existing account
     is never automatically promoted — silently turning an arbitrary
     pre-existing account into an administrator because deployment
     configuration happened to reuse its email would be a serious
     privilege-escalation trap.
3. After creation, the returned user's email and role are verified to
   match what was requested; if not, startup fails rather than silently
   claiming success.

If the database has no Better Auth tables (migrations were never
applied), bootstrap fails startup with a message pointing at `db:migrate`
— it never creates or migrates schema itself.

**Idempotency and concurrency:** bootstrap runs once, synchronously,
per process startup. This is a single-instance, self-hosted SQLite
deployment; cross-process races (e.g. two API processes starting against
the same database file simultaneously) are not defended against with a
lock table — the `users.email` unique constraint is the actual last line
of defense, and a duplicate-creation error from Better Auth is surfaced
clearly rather than crashing uninformatively.

**Removing the variables is safe** once the administrator has been
created: the account persists in SQLite, and the API continues to start
normally without `FIRST_ADMIN_EMAIL`/`FIRST_ADMIN_PASSWORD` set. Leaving
them configured across restarts is idempotent but keeps a plaintext
password in your deployment configuration. `FIRST_ADMIN_PASSWORD` is a
bootstrap secret — supply it through container secrets, your deployment's
secret store, or another protected configuration mechanism, and remove it
after the administrator has been created and verified unless your
secret-management workflow intentionally retains it. Never commit a real
value to `.env.example` or anywhere else in the repository.

**Creating additional users**: the admin plugin's own user-management
endpoint (`POST /api/auth/admin/create-user`, i.e. `auth.api.createUser`
with a real authenticated session) remains the way an authenticated
administrator creates further accounts — no separate custom endpoint was
added for this. It is unauthenticated-rejected, viewer-rejected, and
admin-only, and only accepts the two application roles (`admin`,
`viewer`) — an unsupported role value is rejected with `400 Bad Request`.
There is no frontend UI for this yet.

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

## Workflows API

`/api/projects/:projectId/workflows` (`src/modules/workflows/`) — nested
under Projects, inheriting its authorization from the parent project's
ownership rather than carrying its own `owner_id`. This task covers
workflow **configuration** CRUD only: steps, scheduling, and execution are
not implemented.

**Authentication and role matrix** — identical model to the Projects API:
every endpoint requires an authenticated session; both `admin` and
`viewer` may list/read; only `admin` may create/update/delete
(`@Roles(['admin'])` on mutation routes, plus a matching
`WorkflowsService` defense-in-depth check). `admin` does not bypass
project ownership.

| Operation                           | Admin | Viewer |
| ------------------------------------ | ----: | -----: |
| List workflows in an owned project   |   Yes |    Yes |
| Read workflow in an owned project    |   Yes |    Yes |
| Create workflow in an owned project  |   Yes |     No |
| Update workflow in an owned project  |   Yes |     No |
| Delete workflow in an owned project  |   Yes |     No |

**Authorization derives entirely from the parent project**:
`workflow → project → owner_id → actor`. Every operation proves
`projects.id = :projectId AND projects.owner_id = actor.userId`; every
operation on an existing workflow additionally proves
`workflows.id = :workflowId AND workflows.project_id = :projectId`. List
and create verify project ownership with a standalone query
(`WorkflowsService.assertOwnedProject`) since there is no workflow row yet
to correlate against; read scopes by `id` and `project_id` after that same
check; update and delete prove both facts in a **single** statement via a
correlated `EXISTS` subquery against `projects` (verified against the
actual generated SQL — see the persistent report for this task), never an
unscoped lookup followed by an unscoped mutation.

**A single `404 Not Found`** covers every one of: nonexistent project,
project owned by another user, nonexistent workflow, workflow belonging
to a different project, and workflow whose project is owned by another
user — the route parameters and the actor's ownership are never enough
information, on their own, to tell which case applies. A viewer mutation
attempt is the one behavior that returns `403 Forbidden` instead, since
that failure is about role, not about which resource exists.

**List ordering**: `created_at` descending (most recently created
workflow first), matching the Projects API's own convention.

**Cron expression validation** (`IsCronExpression`,
`src/modules/workflows/validation/cron-expression.validator.ts`): uses the
`cron` package (npm name `cron`, the `kelektiv/node-cron` project) — the
exact library `@nestjs/schedule` depends on, installed at the same
version (`4.4.0`) so that whenever a scheduler is added later, it parses
every currently-accepted expression identically. Both the 5-field
(`minute hour day-of-month month day-of-week`) and 6-field (leading
`second`) forms are accepted, along with the macros this library itself
supports (`@daily`, `@hourly`, ...). The expression is trimmed before
validation and storage; no normalization is applied beyond that.

**IANA time-zone validation** (`IsIanaTimeZone`,
`src/modules/workflows/validation/time-zone.validator.ts`): a value is
accepted if it is exactly `"UTC"` or appears in
`Intl.supportedValuesOf('timeZone')` (Node-native, no time-zone database
dependency). This combination was chosen and verified deliberately:
`Intl.supportedValuesOf('timeZone')` alone does not include `"UTC"` even
though it is a universally recognized canonical identifier, while
`Intl.DateTimeFormat`'s own constructor validation is *more* permissive
than intended — it also accepts legacy fixed-offset names like `"EST"` and
`"GMT"`, which must be rejected. Accepted: `UTC`, `America/Bogota`,
`America/New_York`, `Europe/Madrid`, `Asia/Tokyo`. Rejected: `Bogota`,
`EST`, `UTC-5`, `Invalid/Zone`, `GMT`. The value is trimmed and stored
exactly as given — no normalization.

**Overlap policy**: reuses the canonical `WorkflowOverlapPolicy` union and
`workflowOverlapPolicies` tuple from `src/database/schema/types.ts` — no
duplicate literal. Only `'skip'` is currently implemented, matching the
database's own `CHECK` constraint.

**`description` update semantics**: omit the field to leave it unchanged,
send `null` to clear it, send a string to replace it — same convention as
create.

**Response shape**:

```ts
{
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  overlapPolicy: WorkflowOverlapPolicy;
  createdAt: Date;
  updatedAt: Date;
}
```

Never exposes the parent project's owner.

**Swagger**: documented under the `Workflows` tag. Uses
`@ApiCookieAuth('better-auth.session_token')` rather than
`@ApiBearerAuth()` — the application authenticates exclusively through
Better Auth's HTTP-only session cookie
(`better-auth.session_token`, added as a global cookie security scheme in
`src/lib/swagger/swagger.config.ts`), never a bearer token. (Note: the
existing `ProjectsController` still uses `@ApiBearerAuth()`, which does
not reflect actual runtime behavior — left unchanged here as out of
scope for this task; worth correcting in a follow-up.)

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
GET    /api/projects/:projectId/workflows                # List workflows in an owned project
POST   /api/projects/:projectId/workflows                # Create a workflow (admin only)
GET    /api/projects/:projectId/workflows/:workflowId     # Read a workflow in an owned project
PATCH  /api/projects/:projectId/workflows/:workflowId     # Partially update a workflow (admin only)
DELETE /api/projects/:projectId/workflows/:workflowId     # Delete a workflow (admin only)
```

See "Projects API" and "Workflows API" above for authentication, role, and
ownership-scoping details.

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
