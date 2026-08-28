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
  Workflows are created together with their complete ordered step list in
  one transactional request; cron-triggered execution is implemented —
  see "Scheduler" below.
* A Workflow Steps API
  (`/api/projects/:projectId/workflows/:workflowId/steps`), nested under
  Workflows, for managing steps after creation, including a complete-order
  transactional reorder endpoint for the frontend's future drag-and-drop
  editor — see "Workflow Steps API" below.
* A Workspace Summary API (`/api/workspace-summary`) — a single-request,
  cross-project summary of the actor's own projects and workflows, for the
  frontend to render sidebar-style switching without an N+1 request
  pattern — see "Workspace Summary API" below.
* A browser-compatible shared validation package
  (`packages/validation`, `@supabase-heartbeat/validation`) providing Zod
  schemas and inferred types for workflow step configuration, reused by
  this API and intended for a future frontend — see "Shared validation
  package" below.
* An internal workflow-execution foundation
  (`src/modules/workflow-execution/`) — a `StepExecutor` contract, a
  NestJS-discovery-based executor registry, a per-run Supabase client
  factory/execution context, and a working executor for every one of the
  8 current MVP step types (`signin`, `signout`, `wait`, `insert`,
  `read`, `update`, `delete`, `invoke_function`) — see "Workflow
  execution foundation" below.
* A workflow-run orchestration engine shared by two triggers:
  synchronous, admin-only manual execution
  (`POST /api/projects/:projectId/workflows/:workflowId/runs`) and a
  real, timer-backed cron scheduler that fires the same orchestration
  automatically (`src/modules/workflows/runs/`,
  `src/modules/workflows/scheduler/`), with `workflow_runs`/`step_runs`
  persistence — see "Workflow Runs API" and "Scheduler" below.
* Workflow-step output references
  (`${steps.<step_key>.output.<path>}`, `src/modules/workflows/references/`)
  — a step's configuration may reference an earlier, enabled step's
  output by its stable snake_case `stepKey`, resolved and type-preserved
  at execution time, with preflight structural validation across
  aggregate creation, individual step create/update, reordering, and
  manual execution — see "Output references" under "Workflow Runs API"
  below.
* A development proxy that forwards non-API requests to the Vite dev
  server, so the browser only ever talks to this API.
* Production static hosting of the compiled frontend, with an SPA fallback.

**Planned / not yet implemented:**

* Retries, cancellation, and timeouts for a running workflow. Overlap
  prevention (`overlapPolicy: 'skip'`) is implemented for scheduled
  triggers — see "Scheduler" below.
* Partial string interpolation (a reference embedded inside a larger
  string) and expressions/arithmetic/fallback values built on top of
  output references — only whole-value references are implemented.
* A dedicated run-history *list* endpoint with pagination/filtering —
  the bounded last-10-runs list is only available bundled into `GET
  .../workflows/:workflowId/overview` (see "Workflow Runs API" below).
  Single-run detail (`GET .../runs/:runId`) is implemented.
* Remote-operation compensation/rollback — a later step's failure never
  reverses an earlier step's already-committed Supabase side effects.
* Project sharing / multi-user access to the same project.
* Frontend administration UI for creating additional users.
* Business logic beyond the health check, authentication foundation,
  Projects API, Workflows API, Workflow Steps API, the
  workflow-execution foundation, and manual workflow runs.

## Current stack

* NestJS 11 on Express.
* TypeScript.
* Drizzle ORM + Drizzle Kit.
* `better-sqlite3`.
* `@nestjs/swagger` + `@scalar/express-api-reference` + `@scalar/api-reference` (merged `/api/docs` page, see "API documentation").
* Better Auth + `@thallesp/nestjs-better-auth`.
* `class-validator` + `class-transformer` (request DTO validation; see "Projects API").
* `cron` (validates workflow cron expressions, computes `nextRun` for
  display, and powers the real scheduler — see "Scheduler" below).
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
    ├── workflows/   # Workflows API — nested under Projects (see "Workflows API")
    │   └── steps/   # Workflow Steps API — nested under Workflows (see "Workflow Steps API")
    ├── workflow-execution/ # Executor contract, registry, context, signin/signout/wait executors (see "Workflow execution foundation")
    └── workspace-summary/ # GET /api/workspace-summary — cross-project projects+workflows summary (see "Workspace Summary API")
```

`packages/validation` (`@supabase-heartbeat/validation`) is a separate,
browser-compatible workspace outside `apps/api` — see "Shared validation
package" below.

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
| `SCHEDULER_ENABLED` | No | `false` | `true` | Enables the real cron scheduler — see "Scheduler" below. Accepts `1`/`true`/`yes`/`on` (case-insensitive) as truthy; anything else (including unset) is disabled. |

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

`GET /api/projects/:projectId/overview` (both admin and viewer) returns
everything a single-page project overview UI needs in one request: the
same fields as `GET :projectId` plus a `metrics` object, a `workflows`
array (one summary row per workflow in the project), and a `recentRuns`
array (the 10 most recently created runs across every workflow in the
project). Unlike the workflow-overview endpoint's `metrics` (computed
over a workflow's entire run history), `metrics.totalRuns` and
`metrics.failedRuns` here are windowed to the last 7 days;
`metrics.totalWorkflows`/`metrics.activeWorkflows` are plain counts;
`metrics.lastActivity` is the most recent run's `startedAt` across every
workflow in the project, unwindowed; `metrics.nextRun` is the earliest
`nextRun` among the project's enabled workflows. Each `workflows` entry
carries its own `lastRun`/`lastStatus` (from that workflow's most
recently created run, if any) and `nextRun` (computed the same way as
the workflow-overview endpoint's `metrics.nextRun`, via the `cron`
package, `null` when disabled). Each `recentRuns` entry has the same
shape as the workflow-overview endpoint's `recentRuns` entries, plus
`workflowId`/`workflowName`, since this list spans every workflow in the
project.

## Workflows API

`/api/projects/:projectId/workflows` (`src/modules/workflows/`) — nested
under Projects, inheriting its authorization from the parent project's
ownership rather than carrying its own `owner_id`. Scheduling and
execution are not implemented.

**Transactional creation with steps**: `POST` requires a nonempty `steps`
array — a workflow cannot be created without at least one step through
this endpoint. The workflow row and every step are inserted together in
a single Drizzle/SQLite transaction (`this.db.transaction(...)` in
`WorkflowsService.create`): if any step fails to insert, the workflow
insert (and any earlier step inserts in the same request) is rolled back
— nothing is left half-persisted. See `WorkflowsService.create` and its
tests (`workflows.service.spec.ts`, `describe('create')`, in particular
"rolls back the workflow and all earlier steps when a later step insert
fails") for the verified behavior, and the persistent report for this
task for the actual generated SQL.

Step **position is always server-assigned** from array order —
`steps[0]` becomes position `0`, `steps[1]` position `1`, and so on.
Client-supplied `position` (or any other unexpected field) on a step is
rejected with `400` by the DTO's own `whitelist: true` validation, not
silently ignored. Up to `MAX_STEPS_PER_WORKFLOW` (100) steps are accepted
per request; duplicate `stepKey` values within the array are rejected
before the transaction opens.

Every step's `type` and `configuration` are validated together (a
discriminated pairing), using the shared
`@supabase-heartbeat/validation` package — see "Shared validation
package" below for the schema and "Workflow Steps API" below for the
full field reference. All aggregate input (workflow metadata, array
bounds, duplicate keys, every step's type/configuration pairing) is
validated before the transaction begins.

The create/read responses return the workflow together with its full
ordered `steps` array in one payload (`WorkflowDetailResponse`), so a
single-page workflow editor can load everything — and the aggregate
create endpoint can confirm exactly what was persisted — in one request.
The list endpoint (`GET /api/projects/:projectId/workflows`) intentionally
stays lightweight and does **not** include step configurations.

**Authentication and role matrix** — identical model to the Projects API:
every endpoint requires an authenticated session; both `admin` and
`viewer` may list/read; only `admin` may create/update/delete
(`@Roles(['admin'])` on mutation routes, plus a matching
`WorkflowsService` defense-in-depth check). `admin` does not bypass
project ownership.

| Operation                            | Admin | Viewer |
| ------------------------------------ | ----: | -----: |
| List workflows in an owned project   |   Yes |    Yes |
| Read workflow in an owned project    |   Yes |    Yes |
| Create workflow in an owned project  |   Yes |     No |
| Update workflow in an owned project  |   Yes |     No |
| Replace workflow + steps (owned)     |   Yes |     No |
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

**Full replace with steps** (`PUT /api/projects/:projectId/workflows/:workflowId`,
`WorkflowsService.replace`): unlike `PATCH` (metadata-only, partial), this
replaces the workflow's metadata **and** its complete step list together
in a single transaction — the same atomicity guarantee as `POST`, but for
an existing workflow. Exists so a frontend "edit workflow" form that
reuses the create form's full shape (metadata + drag-and-drop step list)
can submit its entire state in one call, rather than diffing client-side
and issuing the many separate calls the Workflow Steps API below would
otherwise require (one `POST`/`PATCH`/`DELETE` per changed step, plus
`PUT .../steps/order` for reordering).

Request body mirrors `POST`'s shape (`name`, `cronExpression`, `timezone`
required; `description`, `enabled`, `overlapPolicy` optional; `steps`
required, nonempty, at most `MAX_STEPS_PER_WORKFLOW`), except each step
entry may also carry an optional `id`:

* An entry **with** an `id` matching one of the workflow's current steps
  updates that row in place — its `id` and `createdAt` are preserved.
* An entry **without** an `id` (or whose `id` matches no current step)
  is inserted as a new step.
* Any current step whose `id` is **absent** from the submitted array is
  deleted.

Array order is, as with `POST`, the proposed final execution order:
`steps[0]` becomes position `0`, and so on. `validateWorkflowReferences`
runs against the full proposed order before the transaction opens, so an
invalid step-output reference leaves the workflow completely untouched —
same rollback guarantee `POST` provides (verified in
`workflows.service.spec.ts`, `describe('replace')`, "rolls back
everything when a step in the diff violates a constraint"). Position
rewrites use the same collision-safe two-pass temporary-offset technique
as `applyContiguousPositions` in the Workflow Steps API (below), since
`(workflow_id, position)` is uniquely constrained.

**`id` is not validated as part of a step's shape**: `IsWorkflowStepArray`
and `IsWorkflowStepInput` only ever inspect
`stepKey`/`type`/`configuration`/`enabled` (the shared Zod schema's own
fields), so an extra `id` property never affects per-step validation.

**Response shape** (list — lightweight, no step configurations):

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

**Response shape** (create and read — includes the full ordered step
list):

```ts
{
  // ...all fields above, plus:
  steps: {
    id: string;
    workflowId: string;
    stepKey: string;
    type: WorkflowStepType;
    position: number;
    configuration: Record<string, unknown>;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[]; // ordered by position ascending
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

## Workspace Summary API

`GET /api/workspace-summary` (`src/modules/workspace-summary/`) — a
single-request, cross-project summary of the actor's own projects and
workflows, purpose-built for frontend sidebar-style project/workflow
switching without an N+1 request pattern (`GET /api/projects` plus one
`GET /api/projects/:projectId/workflows` per project). Not a substitute
for the Projects/Workflows list or detail endpoints above — it reuses
their exact response shapes (`ProjectResponse[]`, `WorkflowResponse[]`)
rather than a reduced one, minus each workflow's `steps` array (fetched
separately, per workflow, only once a specific workflow is opened).

**Authentication:** requires an authenticated session, same as every other
module. No `@Roles(['admin'])` — both `admin` and `viewer` may call this,
identical to `GET /api/projects` and `GET /api/projects/:projectId/workflows`.

**Ownership scoping**, enforced in `WorkspaceSummaryService.get`, two
independent read queries run with `Promise.all` (no shared transaction
needed for reads):

* Projects — `WHERE owner_id = actor.userId`, the full row (same as
  `ProjectsService.list`).
* Workflows — joined to `projects` (`INNER JOIN projects ON projects.id =
  workflows.project_id`) and filtered by `projects.owner_id =
  actor.userId`, selecting every `WorkflowResponse` field except `steps`.
  This is the one cross-project aggregate query in the API — every other
  workflow query is scoped to a single `:projectId` route parameter.

**Response shape** — reuses `ProjectResponse` and `WorkflowResponse` (see
"Projects API" and "Workflows API" above) as-is:

```ts
{
  projects: ProjectResponse[];
  workflows: WorkflowResponse[]; // no `steps`
}
```

An empty result (`{ projects: [], workflows: [] }`) for a user with no
projects is a valid, non-error response.

## Workflow Steps API

`/api/projects/:projectId/workflows/:workflowId/steps`
(`src/modules/workflows/steps/`) — nested under Workflows, for managing a
workflow's steps after the initial atomic creation described above.

| Operation                            | Admin | Viewer |
| ------------------------------------- | ----: | -----: |
| List steps in an owned workflow       |   Yes |    Yes |
| Read a step in an owned workflow      |   Yes |    Yes |
| Append a step to an owned workflow    |   Yes |     No |
| Update a step in an owned workflow    |   Yes |     No |
| Delete a step in an owned workflow    |   Yes |     No |
| Reorder an owned workflow's steps     |   Yes |     No |

**Ownership** is proven through the full hierarchy on every operation:
`projects.id = :projectId AND projects.owner_id = actor.userId AND
workflows.id = :workflowId AND workflows.project_id = :projectId`, plus,
for single-step operations, `workflow_steps.id = :stepId AND
workflow_steps.workflow_id = :workflowId`. A step is never looked up
globally by ID and then "trusted" against the route — see
`WorkflowStepsService.assertOwnedWorkflow` and `findOwnedStep`. A
mismatched project, workflow, or step ID all return the identical
`404 Not Found`, disclosing nothing about which part of the hierarchy
exists.

**Create step** (`POST`, body: `{ stepKey, type, configuration,
enabled? }`): `position` is never accepted — the new step is always
appended at `MAX(existing position) + 1` (or `0` for the first step),
computed and inserted inside a transaction so a concurrent append cannot
race past the read. The database's own unique
`(workflow_id, position)` constraint is the final safety net. A
`stepKey` already used by another step in the same workflow is rejected
with `409 Conflict`. Because append always places the new step last, its
`configuration` may reference any enabled *existing* step
(`${steps.<step_key>.output.<path>}` — see "Output references" under
"Workflow Runs API" below); a malformed or otherwise invalid reference
(unknown key, forward/self reference, disabled-step reference, partial
interpolation) is rejected with `409 Conflict` and no step is created.

**Update step** (`PATCH`, body: any of `stepKey, type, configuration,
enabled`): `position` is never accepted here — use `PUT .../steps/order`
(below) to change step order; arbitrary position changes via `PATCH` are
intentionally rejected. If `type` or `configuration` changes, the
**merged** result (the existing step, overridden by the patch) is
re-validated as a whole pair through the shared validation package — so
changing only `type` while an old, now-incompatible `configuration`
remains from before is rejected unless a valid `configuration` for the
new `type` is supplied in the same request. Renaming `stepKey` to a value
already used by another step in the same workflow returns
`409 Conflict`. The resulting complete ordered workflow (this step's
merged result, every other step unchanged) is also validated for
step-output references as a whole, before anything is written:
**renaming** a `stepKey` that another enabled step still references by
its old key is rejected with `409 Conflict` (references are never
automatically rewritten); **disabling** a step another enabled step
references is rejected; **enabling** a step whose own references are no
longer valid is rejected; adding a new reference that is unknown,
forward, self-referencing, or targets a disabled step is rejected.
Changing a referenced step's `type` does not by itself invalidate a
reference (the runtime output path is not known until execution).

**Delete step** (`DELETE`, `204 No Content` on success): deletes the step
and **compacts** the remaining steps' positions to stay contiguous in the
same transaction (e.g. deleting position `1` from `[0,1,2,3]` yields
`[0,1,2]`, not `[0,2,3]`). Because `(workflow_id, position)` is uniquely
constrained, compaction uses a collision-safe two-pass rewrite: every
remaining step is first moved to a large temporary offset, then rewritten
to its final `0..n-1` position — the unique constraint itself is never
relaxed. **Deleting the last remaining step of a workflow is rejected
with `409 Conflict`** — a workflow without any steps cannot be created
through the aggregate endpoint, and for consistency the same floor
applies to deletion; delete the workflow itself instead (this cascades to
all of its steps). **Deleting a step that another enabled step still
references is rejected with `409 Conflict`** (`ReferencedStepDeletionConflictError`)
— the target step and all positions are left unchanged; deleting an
unreferenced step still compacts positions normally.

**Reorder steps** (`PUT .../steps/order`, body: `{ stepIds: string[] }`,
admin only): replaces the workflow's **complete** step order in one
request — the primary way the frontend's future drag-and-drop workflow
editor will persist a new order. `PUT` is used, not `PATCH`, because the
request body replaces the entire ordering representation rather than
describing a partial change; there is no insert-before/insert-after
endpoint and no way to move a single step in isolation. `stepIds` must
contain **every** one of the workflow's current step IDs exactly once —
array order defines the final position (`stepIds[0]` becomes position
`0`, and so on):

* a missing current ID, an extra/unknown ID, an ID belonging to another
  workflow, or a count mismatch is rejected with `409 Conflict`
  (`WorkflowStepOrderConflictError`) and a single generic message —
  which specific ID was missing, foreign, or extra is never disclosed;
* a structurally malformed body (missing `stepIds`, not an array, empty,
  non-string or empty-after-trim entries, a duplicate ID, more than
  `MAX_STEPS_PER_WORKFLOW` entries, or an unexpected body property such
  as `positions`, `workflowId`, `projectId`, `ownerId`, or `steps`) is
  rejected with `400 Bad Request` before the database is touched at all
  — duplicate IDs are never silently deduplicated;
* submitting the current order is valid and is a no-op — it returns
  `200 OK` with the current step list and performs zero database writes
  (see "Timestamp policy" below);
* a structurally valid order that would turn an existing valid
  step-output reference into a forward reference (the referenced step no
  longer appears earlier) is rejected with `409 Conflict`, validated
  against the *proposed* order before any temporary position is written
  — the original order and timestamps are left completely unchanged, and
  no partial reorder is ever possible.

The entire operation — ownership verification, loading the current
steps, validating the submitted ID set exactly matches, validating
step-output references against the proposed order, and the position
rewrite — runs inside a single Drizzle/SQLite transaction
(`WorkflowStepsService.reorder`). The rewrite reuses the same
collision-safe two-pass strategy as delete compaction, extracted into a
shared module-local helper (`applyContiguousPositions`, in
`workflow-steps.service.ts`) used by both `delete()` and `reorder()`:
every row whose position actually changes is first moved to a temporary
position derived from `max(every row's current position,
stepIds.length - 1) + 1` — strictly higher than both the final `0..n-1`
range and every row's current position, so a temporary write can never
collide with a real, not-yet-touched row — then rewritten to its final
position. The database's unique `(workflow_id, position)` constraint
remains the final safety net and is never relaxed.

**Timestamp policy**: only steps whose position actually changes have
their `updatedAt` bumped; a step already at its submitted target position
is left completely untouched (including its own `updatedAt`). This was
chosen over unconditionally touching every row so that a no-op reorder
(submitting the current order) performs zero writes, and a partial
reshuffle only reports the steps that actually moved as recently updated.

**Swagger**: documented under the `Workflow Steps` tag, same
`@ApiCookieAuth('better-auth.session_token')` convention as the rest of
the API. The reorder endpoint's description explicitly states the
complete-list requirement.

## Workflow execution foundation

`src/modules/workflow-execution/` (`WorkflowExecutionModule`) is the
internal architecture for executing workflow steps: the `StepExecutor`
contract, the executor registry, and the per-run execution context.
Actual run orchestration (creating `workflow_runs`/`step_runs`) lives in
`src/modules/workflows/runs/` and is documented below in "Workflow Runs
API". Two triggers drive it today: the manual-run HTTP endpoint, and the
real cron scheduler in `src/modules/workflows/scheduler/` — see
"Scheduler" below.

**One Supabase client per workflow run.** `WorkflowRunsService` calls
`WorkflowExecutionContextFactory.create({ projectId, workflowId,
supabaseUrl, publishableKey })` exactly once per run, producing a
`WorkflowExecutionContext` that every step executor invoked during that
run receives. `supabaseUrl` and `publishableKey` come from the owning
project (`ProjectsService`, unchanged by this task) — the context
factory does no database access itself; the caller is responsible for
loading the project first. The Supabase client is constructed by
`SupabaseClientFactory` with backend-appropriate auth options
(`persistSession: false`, `autoRefreshToken: false`,
`detectSessionInUrl: false` — no browser session storage, no background
refresh timer, no URL-based session detection) and using the project's
**publishable key only**, never a service-role key. A fresh client is
created for every context — clients are never cached or reused across
runs or projects.

**Signin credentials remain in each `signin` step**, not centralized at
the project or workflow level (this was decided and implemented in an
earlier task — see "Workflow Steps API" and "Shared validation package"
above for the `signin` configuration schema). All executors invoked
within one workflow run share the same context, and therefore the same
Supabase client: a `signin` step authenticates that shared client
(`context.supabase.auth.signInWithPassword`), and every later step in
the same run sees that authenticated state. A later `signin` step is
allowed and simply re-authenticates the same client as a different
Supabase user — there is no restriction on multiple `signin` steps in
one workflow. A `signout` step clears that client's authentication state
(`context.supabase.auth.signOut`). `wait` performs a non-blocking delay
(via an injectable `Delay` abstraction, never `setTimeout` called
directly by the executor) and never touches Supabase.

**All 8 current MVP step types now have a registered executor:**
`signin`, `signout`, `wait`, `insert`, `read`, `update`, `delete`,
`invoke_function`. `StepExecutorRegistry` discovers every NestJS
provider decorated with `@WorkflowStepExecutor(type)` during application
bootstrap (via `@nestjs/core`'s `DiscoveryModule`/`DiscoveryService` and
`Reflector` — no manually maintained switch statement or executor
array) and exposes a single `get(type): StepExecutor` lookup. There is
no remaining canonical type that throws `StepExecutorNotFoundError`
today; that error remains the registry's behavior for any future
unimplemented type, and is never silently skipped or substituted. A
duplicate registration for the same type, or a decorated provider that
does not actually implement a callable `execute`, fails application
bootstrap immediately (`DuplicateStepExecutorError` /
`InvalidStepExecutorProviderError`), not later during an eventual
workflow run.

**Executor results intentionally exclude credentials and tokens.**
`signin` returns only `{ authenticated: true, userId }` — never the
password, access token, refresh token, or full session. `signout`
returns only `{ signedOut: true }`. Failures on both become a
`StepExecutionError` carrying only step identity (`stepId`, `stepKey`,
`stepType`) and a safe message derived from the SDK's own
`AuthError.message` (e.g. "Invalid login credentials") — never the
submitted email/password or any token value. `signOut()` on a client
with no active session succeeds (`{ error: null }`, confirmed by reading
the installed SDK's implementation) rather than raising an artificial
error — this executor never manufactures a failure the SDK itself
wouldn't report.

### Data and function executors (`insert`, `read`, `update`, `delete`, `invoke_function`)

All five use `context.supabase` — the same per-run client every other
executor uses — and never construct a client of their own. Because it
is the same authenticated client a `signin` step established, **Row
Level Security is enforced by Supabase exactly as it would be for that
session**; nothing in these executors bypasses RLS or uses a
service-role key.

**Stable output contracts**, which are exactly what a later, enabled
step's `${steps.<step_key>.output.<path>}` reference resolves against
(see "Output references" under "Workflow Runs API" below):

* `insert`, `read`, `update`, `delete` → `{ rows: JsonObject[], count:
  number }`. `count` is always `rows.length`, never a separately
  reported count. Zero returned/affected rows is a **valid, successful**
  result (`{ rows: [], count: 0 }`), never a technical failure. `insert`
  always reports `{ rows: [], count: 0 }` — see below for why.

* `invoke_function` → `{ data: JsonValue }`. A function that returns no
  body is valid, successful `{ data: null }` — never coerced to `{}`.

**Table selection behavior**: `update`/`delete` always call `.select()`
after the mutation so the response contains the affected row(s) — the
shared validation schemas for these two types have no `select`/
`returning` configuration field of their own to honor instead. `read`
calls `.select(configuration.columns ?? '*')`, where `columns` is
already the PostgREST-ready comma-separated string the shared schema
produces — no array-to-string translation happens here. `read.limit` is
applied via `.limit()` only when present; no default limit is invented
when it is absent.

**`insert` deliberately never calls `.select()`.** Chaining `.select()`
after `.insert()` makes `supabase-js` send `Prefer:
return=representation`, which requires PostgREST to also evaluate the
table's `SELECT` RLS policy in order to build the response — a table
that only grants `INSERT` to a role (a common, deliberate "write-only"
shape, e.g. a public waitlist form accepting anonymous submissions) then
has every insert rejected with a `42501` RLS error, even though the
insert itself was allowed by its own policy. `InsertStepExecutor` calls
a bare `.insert(configuration.values)` and only checks `.error` — it
never asks PostgREST to return the inserted row(s), so it only ever
requires `INSERT` privileges. The trade-off: the inserted row (including
any DB-generated value, such as a serial `id`) is never returned, so
`insert.output` is always `{ rows: [], count: 0 }` and no later step can
reference `${steps.<key>.output...}` for an `insert` step. A workflow
that needs to reference a just-created row's data should follow the
`insert` with a `read` step (which does call `.select()`, and therefore
does require a `SELECT` policy) instead.

**Filter translation (`update`/`delete`)**: the shared validation
package's `updateFilterOperators` closed set currently contains exactly
one operator, `'eq'` (see `packages/validation/src/workflow-steps/
update.schema.ts`) — broader operators such as `neq`/`gt`/`like` are
**not yet implemented** in the shared schema and are therefore not
implemented here either, per this task's "preserve current
configuration contracts" scope. A single, explicit,
allowlisted-`switch`-based translator
(`filters/apply-postgrest-filter.ts`) maps `'eq'` to
`query.eq(column, value)` — there is no dynamic method lookup
(`query[operator](...)`), no raw PostgREST filter string, and no
silent fallback to `eq` for an unrecognized operator. `update.filter`
and `delete.filter` are both required by the shared schema (not
optional) — there is no code path in either executor that performs a
mutation without first applying a filter, so an unfiltered update or
delete is structurally impossible, not merely avoided by convention.

**JSON-safety validation**: every row returned by
`insert`/`read`/`update`/`delete` must normalize to a JSON object — a
primitive row, or a row containing `undefined`, a `bigint`, a symbol, a
function, a non-finite number (`NaN`/`Infinity`), a cyclic reference, or
an unsupported class instance fails that step safely with
`InvalidStepExecutionOutputError` rather than persisting a corrupted or
partial value. The same check applies to `invoke_function`'s `data`,
which additionally may be a `Blob`, a raw `Response`, or `FormData`
depending on the invoked function's `Content-Type` (per the installed
`@supabase/functions-js` SDK) — none of those are JSON-safe and all are
rejected the same way. This validator is a narrow, hand-written
recursive check (`execution-output/normalize-step-output.ts`), not
`JSON.stringify`/`JSON.parse`.

**Supabase/PostgREST/Functions error handling**: an SDK-reported
`{ error }` on a table operation, or a thrown exception during the
request, becomes a `StepExecutionError` with a **fixed,
operation-specific message** (e.g. "Supabase rejected the insert
operation.") — never the PostgREST error's own `message`/`details`/
`hint` text, since the installed SDK's own `PostgrestError` source
documents that `details`/`hint` "often" carry the offending value, key,
or row. `invoke_function` failures (`FunctionsHttpError`/
`FunctionsRelayError`/`FunctionsFetchError`, or a thrown network
exception) become a single fixed message, "Supabase function invocation
failed." — these error classes' own `context` can be the raw `Response`
object, so no part of it is ever read. The original error is preserved
only as the standard `Error` `cause`, for internal diagnosis, never
persisted or returned.

**Adding a future built-in executor**: implement `StepExecutor<T>` for
the new canonical type, decorate the class with
`@WorkflowStepExecutor('the_type')` and `@Injectable()`, add it to
`WorkflowExecutionModule`'s `providers` array, and add its configuration
type to `ConfigurationForStepType` in `contracts/step-executor.ts` — the
registry picks up the new executor automatically on the next
application bootstrap, and a compile-time exhaustiveness check
(`ConfigurationForStepTypeIsExhaustive`) fails the build if the mapped
type is forgotten. There is no external plugin system; only executors
compiled into this codebase can be registered. A future executor should
always: use `context.supabase` (never construct its own client); return
a stable, JSON-safe output; wrap every expected failure as a safe
`StepExecutionError`; and never expose a raw SDK error, response
headers, or authentication material in a persisted or returned message.

## Workflow Runs API

`POST /api/projects/:projectId/workflows/:workflowId/runs`
(`src/modules/workflows/runs/`, admin only) is the only way to *manually*
execute a workflow: a synchronous, HTTP-triggered run. There is no
background worker or queue for this endpoint specifically — the HTTP
request itself performs the run and the connection stays open until it
finishes. (A workflow can also run automatically on its schedule — see
"Scheduler" below, which reuses the same orchestration via
`triggerType: 'scheduled'`.) The response is `201 Created` whenever a run record was
successfully created and completed its execution attempt, **regardless
of whether the run itself ended in `success` or `failed`** — check
`body.status`, not the HTTP status code, to know whether the workflow
logic succeeded. A `404` or `403` means no run was created at all
(ownership/role failure before execution began); a `5xx` means an
unexpected server error, not a failed workflow.

`GET /api/projects/:projectId/workflows/:workflowId/overview`
(`src/modules/workflows/`, both admin and viewer) returns everything a
single-page workflow overview UI needs in one request: the same fields
as `GET :workflowId` (name, schedule, ordered steps, ...) plus a
`metrics` object and a `recentRuns` array. `metrics.totalRuns` and
`metrics.failedRuns` are plain counts over every `workflow_runs` row for
the workflow. `metrics.successRate` is the percentage (0-100, one
decimal) of *concluded* runs — every run whose status has left the
active `pending`/`running` lifecycle (`success`, `failed`, `cancelled`,
or `skipped`) — that ended `success`; `null` if no run has concluded
yet, so in-flight runs never distort the ratio. `metrics.avgDurationMs`
averages `finishedAt - startedAt` only over runs where both timestamps
are set; `null` if none qualify. `metrics.lastRun` is the most recent
run's `startedAt`, `null` if the workflow has never run.
`metrics.nextRun` is the next cron occurrence, computed on the fly from
`cronExpression`/`timezone` via the `cron` package, used purely as a
date-math utility here (this particular `CronJob` is never started —
distinct from the real, started `CronJob` instances the scheduler
maintains per workflow, see "Scheduler" below); it is always `null` when
the workflow is disabled, since scheduling does not apply to a disabled
workflow.
`recentRuns` holds the 10 most recently created runs, most recent first;
each entry's `failedStepKey` is the `stepKey` of the step that failed
(resolved via `workflow_steps`), `null` for a non-failed run or a failed
run with no resolvable failed step.

`GET /api/projects/:projectId/workflows/:workflowId/runs/:runId`
(`src/modules/workflows/runs/`, both admin and viewer) returns one run's
full detail: the same fields as a `recentRuns` entry (id, status,
triggerType, timestamps) plus its complete ordered `stepRuns` array,
each step run enriched with the executed step's `stepKey`/`type` (via a
join to `workflow_steps`) so a run-details UI can render every step's
title without a second request. Only steps that were actually attempted
appear — if execution stopped early due to a failure, steps after the
failed one are absent (they were never attempted, and — see "Execution
order and scope" below — no `skipped` row is ever persisted for them).
A run that does not exist, or belongs to a different workflow than the
one in the route, is reported as `404`, identically to every other
ownership/existence failure in this API.

**Ownership** is proven through the same hierarchy pattern as the rest
of the Workflows API (`projects.id = :projectId AND projects.owner_id =
actor.userId AND workflows.id = :workflowId AND workflows.project_id =
:projectId`) — a mismatched project or workflow ID returns
`404 Not Found`, disclosing nothing about which part of the hierarchy
is wrong.

**Disabled workflows can still be run manually.** `workflows.enabled`
controls scheduled execution (see "Scheduler" below); it has no effect
on this endpoint — an admin can always trigger a manual run regardless
of `enabled`. **Only enabled steps execute.** Disabled
steps are skipped entirely: no `step_run` row is created for them, they
never cause a failure, and they do not affect the relative execution
order of the steps around them. A workflow with zero enabled steps
still produces a successful run with an empty `stepRuns` array.

**Execution order and scope**: enabled steps run sequentially in
ascending `position` order. Exactly one `WorkflowExecutionContext` (and
therefore exactly one Supabase client) is created per run and reused by
every step executor in that run — see "Workflow execution foundation"
above. There is no implicit `signOut()` at the end of a run; the
Supabase client is simply discarded. Only an explicit, enabled
`signout` step ever signs out.

**Stop on first failure.** Any technical failure — an unimplemented
executor type (`StepExecutorNotFoundError`), an invalid persisted step
configuration, a Supabase auth/signout error, a network exception, a
`wait`-provider failure, or any other unexpected exception —
immediately stops the run. Steps after the failed one are never
attempted and never get a `step_run` row. There is no continue-on-error
mode and no retry.

**`workflow_runs` lifecycle**: a row is inserted with `status:
'running'`, `triggerType` (`'manual'` for this endpoint), and
`startedAt` set, inside the same transaction that verifies ownership and
loads the project, workflow, and ordered steps. After the step loop
finishes (successfully
or on first failure), the run is updated to a final `status` of
`'success'` or `'failed'`, with `finishedAt` set and, on failure, a
safe, human-readable `error` summary (see "Error serialization"
below). This final update is a best-effort write outside any
transaction (see "Transaction boundaries" below); if it fails after one
retry, the run can be left in `'running'` — a known, documented gap,
since there is no background reconciliation job in this task's scope.

**`step_runs` lifecycle**: for every *attempted* enabled step (in
executor-resolution order, which matches position order), exactly one
row is written: created with `status: 'running'` and an `inputSnapshot`
before the executor runs, then updated in place to either `'success'`
(with `output`) or `'failed'` (with `error`) once the executor settles.
A step that is never reached because an earlier step failed gets no row
at all — the absence of a row, not a `'skipped'` status, is how
"never attempted" is represented for steps *after* a failure (disabled
steps use the same "no row" representation, for a different reason —
see above).

**Internal structure.** `WorkflowRunsService` splits this orchestration
into two trigger-agnostic private methods: `prepareRun` (resolves the
project/workflow/ordered-steps hierarchy — optionally proving actor
ownership — and inserts the initial `workflow_runs` row for a given
`triggerType`) and `runSteps` (runs the enabled steps, persists
`step_runs` rows, and finalizes the run). Two thin public wrappers call
both: `executeManual` adds the admin-role check and passes `actor`/
`triggerType: 'manual'`; `executeScheduled` (called by
`WorkflowSchedulerService` — see "Scheduler" below) adds overlap-policy
enforcement and passes `actor: null`/`triggerType: 'scheduled'`. Neither
duplicates the orchestration — both reuse the exact same
`prepareRun`/`runSteps` pair.

**Transaction boundaries.** Only the run-creation phase — ownership
verification, loading the project/workflow/ordered steps, and inserting
the initial `workflow_runs` row — runs inside one Drizzle/SQLite
transaction (`better-sqlite3` transactions are synchronous, so nothing
that awaits, including every Supabase call and the `wait` step, can run
inside one). Each `step_runs` insert/update is its own separate,
non-transactional write, committed immediately, so a concurrent reader
can observe a step's result as soon as that step finishes — no lock is
held for the duration of a run. The final `workflow_runs` status update
is likewise a separate, non-transactional write.

**Secret-safe persistence**: `inputSnapshot` is a sanitized copy of the
step's persisted configuration — currently only `signin.password` is
redacted, to `"[REDACTED]"`; every other field is copied as-is (see
`execution-snapshot.ts`). `output` is exactly the executor's
`StepExecutionResult.output`, which is already designed to exclude
credentials and tokens (see "Workflow execution foundation" above — a
`signin` step's output is `{ authenticated: true, userId }`, never a
password, access token, or session). **Error serialization** uses an
explicit allowlist, not a blanket pass-through: only errors of a
recognized, individually audited internal type — `StepExecutionError`
(persisted as its own safe `.message` verbatim), `StepExecutorNotFoundError`,
`InvalidPersistedStepConfigurationError`, `InvalidStepExecutionOutputError`
(a data/function executor produced output that cannot be stored as
JSON), and `UnsupportedPersistedFilterOperatorError` (a persisted
`update`/`delete` filter uses an operator outside the shared schema's
current closed set) — ever have their `.message` read at all. Every
other thrown value — an unrecognized `Error` subclass, a plain `Error`
from an unanticipated SDK exception, or a non-Error thrown value — is
reduced to a fixed, generic sentence, `Step "<key>" (<type>) failed: An
unexpected execution error occurred.` (or `Workflow run failed: An
unexpected execution error occurred.` for the run-level summary),
because an arbitrary error's message, stack, enumerable properties, or
`cause` chain could otherwise carry a credential, token, or request
payload straight into persisted/returned data. Every built-in executor
already wraps its own failures into a safe `StepExecutionError` (or one
of the two output/filter errors above) before they ever reach this
layer — the allowlist is defense-in-depth for a future or third-party
executor that does not (see `execution-error-serializer.ts`).

**Remote side effects and rollback semantics.** A `insert`/`update`/
`delete`/`invoke_function` step that succeeds has already committed its
effect on the remote Supabase project — an `insert` really created a
row, an `update`/`delete` really changed rows, a function invocation
really ran. **If a later step in the same run then fails, none of these
already-committed remote effects are reversed.** SQLite persistence in
`workflow_runs`/`step_runs` records what happened; it is not a
distributed transaction spanning the local database and the remote
Supabase project, and this task does not implement any compensation or
automatic rollback logic. A workflow that needs cleanup after a partial
failure should include explicit cleanup steps (e.g. a `delete` step
targeting rows an earlier `insert` step created) — output references
(below) make this practical: a `delete` step's filter can target
`${steps.create_record.output.rows.0.id}`, the exact row an earlier
`insert` step just created, without hardcoding an ID the workflow
author cannot know in advance.

### Output references

A workflow step's `configuration` may reference the output of an
earlier, enabled step in the same workflow, using the step's stable
`stepKey` (`src/modules/workflows/references/`):

```text
${steps.<step_key>.output.<path>}
```

Example — a `delete` step's filter value referencing the row an earlier
`insert` step just created:

```json
{
  "table": "heartbeat_records",
  "filter": {
    "column": "id",
    "operator": "eq",
    "value": "${steps.create_record.output.rows.0.id}"
  }
}
```

`<path>` is one or more dot-separated segments addressing an object
property or a zero-based array index into the referenced step's output
(`rows.0.id`, `data.status`, `count`). Every reference must include the
literal `output` segment — there is no way to reference a step's raw
input/configuration, another namespace, or a step from a different
workflow or a previous run.

**Whole-value only, for now.** A reference is resolved only when the
entire string value is exactly one reference — `"${steps.a.output.id}"`
is supported, `"id: ${steps.a.output.id}"` (partial interpolation) is
not, and is rejected during validation (aggregate creation, individual
step create/update, and reorder) rather than left unresolved. Partial
string interpolation may be added in a later task; it is out of scope
here.

**Type preservation.** The resolved value replaces the reference string
entirely and keeps its original JSON type — a referenced number stays a
number, a referenced object stays an object, `null` stays `null`. Values
are never coerced to strings, and an object/array is never stringified.

**Only earlier, enabled steps** may be referenced — a step cannot
reference itself, a later step, or a disabled step. Because only
strictly earlier steps are ever allowed, a structurally valid workflow
can never contain a reference cycle by construction (see
`validateWorkflowReferences` in
`references/validate-workflow-references.ts`).

**Preflight (structural) validation** happens before any Supabase side
effect: for aggregate workflow creation, individual step create/update,
and reordering, the proposed complete ordered step list is validated
(syntax, unique/known `stepKey`, order, enabled state) before anything
is written — an invalid reference creates or changes nothing. For
manual execution, the same structural validation runs inside the same
transaction that verifies ownership and inserts the initial
`workflow_runs` row, *before* that row is inserted — a structurally
invalid workflow creates no run at all. This validation only checks
structure (does the key exist, is it earlier, is it enabled); it never
attempts to prove a reference's `<path>` will exist in a future
execution's actual output, since that depends on remote data unknowable
until the referenced step actually runs.

**Runtime resolution.** During one manual run, a run-local, in-memory
map (`stepKey -> output`, never a database field, never shared across
runs or cached by workflow) records every enabled step's successful
output as it completes. For each subsequent enabled step, before it
runs: its persisted configuration is recursively cloned, every reference
is replaced with the resolved value from that map, the resolved
`type`/configuration pair is re-validated against the same shared schema
enforced at write time (a reference resolving to the wrong type — e.g. a
number where a string is required — fails safely without ever calling
the executor), and the resulting **resolved** configuration becomes both
what the executor actually receives and what is persisted in that step
run's `inputSnapshot`. **The persisted `workflow_steps.configuration`
itself is never modified** — it still contains the original
`${steps...}` reference string; only the separate `step_runs` row
reflects the resolved value. `signin.password` continues to be redacted
to `"[REDACTED]"` in the snapshot exactly as before, including when a
password field happens to be (unusually) populated via a reference.

A path that cannot be resolved against the referenced step's actual
output (a missing property, a missing array index, indexing a
non-array, or property access on a primitive) fails the **current**
step safely — the workflow run becomes `failed`, exactly like any other
technical step failure, and later steps are never attempted. This is a
`201` response with `status: "failed"`, not a `5xx` — see "request
failure versus failed-run response" above.

A path segment naming a dangerous property (`__proto__`/`constructor`/
`prototype`) is instead rejected earlier, during parsing — which is
also preflight-validation time — so a reference containing one never
passes structural validation at all: it is refused during workflow
creation/update/reordering, or during a manual run's own preflight
check, before any `workflow_runs` row exists. The runtime resolver
keeps its own independent denylist and `hasOwnProperty` check as a
second, defense-in-depth layer regardless, but under normal operation
that layer is unreachable via an ordinary reference string, since the
parser already refuses to produce a parsed reference containing such a
segment.

**Execution consistency.** A manual run executes the exact ordered step
snapshot loaded during its own preflight transaction; the orchestration
loop never re-reads `workflow_steps` mid-run, so a concurrent edit to
the workflow after the run has started cannot change that run's already
in-progress sequence or configuration.

**Not implemented**: partial string interpolation, expressions,
arithmetic, fallback/default values, optional references, reference
aliases, cross-workflow references, and references to a previous run or
to project/environment variables. Output references are intended
primarily for cleanup flows within one run (create → act → delete), not
as a general data-passing mechanism. Reference resolution works
identically for a scheduled run (`executeScheduled`) as for a manual one
— both call the same `runSteps`.

**Not implemented by this endpoint**: overlap prevention (nothing stops
two concurrent *manual* runs of the same workflow — only a *scheduled*
trigger checks for an active run, see "Scheduler" below), distributed
locks, automatic retries, cancellation, timeouts, and preflight/dry-run
validation of remote execution outcomes. The response body of the
`POST` call is the only way to see one run's full detail (including its
step-by-step `stepRuns`) — `GET :workflowId/overview` (below) covers
only a fixed last-10 summary view (aggregate metrics plus a bounded run
list), not arbitrary pagination or a single-run detail-by-ID lookup.

## Scheduler

`src/modules/workflows/scheduler/` (`WorkflowSchedulerService`, a
provider inside `WorkflowsModule`, not a separate module) keeps one
real, timer-backed `CronJob` (from the `cron` package) per workflow with
`enabled: true`, firing scheduled runs through
`WorkflowRunsService.executeScheduled` — the same orchestration manual
execution uses, with `triggerType: 'scheduled'` instead of `'manual'`.

**Opt-in via `SCHEDULER_ENABLED`** (see "Environment variables"):
disabled by default. When disabled, `WorkflowSchedulerService` registers
nothing at startup and every one of its public methods is a no-op —
manual execution is completely unaffected either way.

**Registration lifecycle.** At `onApplicationBootstrap`, every
`enabled: true` workflow row gets a `CronJob` built from its
`cronExpression`/`timezone` and started immediately. After that, the
registry is kept in sync only by `WorkflowsService` calling
`registerOrReplace(workflowId)` after every successful create/update/
replace, and `unregister(workflowId)` after every successful delete —
`registerOrReplace` always re-reads the row itself (never trusts a
caller-passed snapshot) and registers, replaces, or removes the job
based on the row's current `enabled` value, so toggling `enabled`
through `PATCH`, changing `cronExpression`/`timezone`, or deleting a
workflow all converge to the correct registered/unregistered state
through this same entry point. There is no periodic re-sync: if the
registry and the database ever disagree (e.g. a row edited directly,
bypassing the API), the discrepancy persists until the next mutation
through `WorkflowsService` or the next process restart. On
`onApplicationShutdown`, every registered job is stopped and the
registry is cleared.

**Overlap policy.** `executeScheduled` enforces `overlapPolicy: 'skip'`
(the only value in the closed set today, but the check is gated on
`overlapPolicy === 'skip'` rather than unconditional, so it stays
forward-compatible if more policies are added later): immediately before
`prepareRun`, it checks for an existing `pending`/`running`
`workflow_runs` row for the workflow; if one exists, the scheduled
trigger is skipped entirely — no new `workflow_runs` row is created, and
`executeScheduled` returns `null`. This check is a plain `SELECT`, not
itself locked, so there is a small, accepted TOCTOU gap: the only
realistic race (a single cron expression cannot fire the same job twice
at once) is a scheduled tick overlapping a concurrent *manual* run of
the same workflow started moments earlier. This is a documented
limitation, not solved with distributed locking here, matching the
existing best-effort-retry precedent in `finalizeWorkflowRun`.

**Error isolation.** A tick that fails is logged via Nest's `Logger` and
never affects other workflows' jobs or the scheduler's own lifecycle.
Two layers guard this: `handleTick` (the actual tick handler, a
directly callable method rather than an inline closure, so it can be
tested without waiting for a real cron fire) wraps its own body in a
try/catch; `CronJob`'s own `errorHandler` option is also set as a
backstop for anything `cron` itself would otherwise consider unhandled.
`waitForCompletion: true` is set on every job so at most one execution
of a given workflow's job is ever in flight at a time, consistent with
the overlap-policy enforcement above.

**Per-tick logging.** Every real fire of a registered `CronJob` logs
`Scheduled tick fired for workflow <id>.` from `handleTick`, and once
`executeScheduled` returns, a second line logs the outcome:
`Scheduled run <runId> for workflow <id> finished with status
"<status>".` for a run that was actually created (`success` or
`failed`), or nothing further when the trigger was skipped by the
overlap check — that case already logs its own line from
`executeScheduled` (`Skipping scheduled run for workflow <id>: run
<runId> is still active.`, see above), so it is not duplicated here.
Registration/deregistration itself is unlogged per-event (only the
bootstrap summary — `Scheduler enabled: registered N job(s).` — is
logged); an unexpected error before a run could even be attempted (e.g.
a DB error while re-reading the workflow row) logs via the "Error
isolation" path above instead of a tick-result line.

**Visibility.** A scheduled run is persisted and returned identically to
a manual run everywhere in the Workflow Runs API — `GET
:workflowId/overview`'s `recentRuns`, `GET .../runs/:runId` — the only
difference is `triggerType: 'scheduled'` instead of `'manual'`.

**Timezone/DST.** `timeZone` is passed straight through to `CronJob`
(Luxon-backed internally), the same way `metrics.nextRun`'s date-math
`CronJob` already does — DST transitions are handled by `cron`/Luxon,
not by any code in this codebase.

## Shared validation package

`packages/validation` (`@supabase-heartbeat/validation`) is a separate
Yarn workspace, deliberately kept **browser-compatible**: no NestJS, no
database, no Node-only imports. It exports Zod v4 schemas and their
inferred TypeScript types, so both this API and a future frontend can
validate workflow step input identically without duplicating rules.

Key exports:

* `jsonValueSchema` / `jsonObjectSchema` (and `safeParseJsonValue` /
  `safeParseJsonObject` wrappers) — a reusable JSON-value type that
  rejects functions, class instances, `undefined`, symbols, and cyclic
  structures. The `safeParse*` wrappers exist because Zod's own
  `safeParse` does not catch the `RangeError` thrown by a cyclic object
  — verified directly and covered by tests.
* The canonical closed-set tuples/types shared with the database schema:
  `workflowStepTypes`, `workflowOverlapPolicies`, `workflowRunTriggerTypes`,
  `workflowRunStatuses`, `stepRunStatuses` (re-exported, not duplicated,
  from `apps/api/src/database/schema/types.ts` — moving them here
  required no migration, confirmed via `db:check`).
* Per-step-type configuration schemas for all 8 MVP step types:
  `signin` (`{ email, password }` — see below), `signout` (`{}`), `wait`
  (`{ seconds: integer >= 1, <= 300 }`), `insert` (`{ table, values:
  nonempty JSON object }`), `read` (`{ table, columns?, limit? <= 1000
  }`), `update` (`{ table, values, filter: { column, operator: 'eq',
  value } }`), `delete` (`{ table, filter }` — `filter` is required,
  never optional), and `invoke_function` (`{ functionName, body? }`).
  Every schema rejects unknown properties.
* `workflowStepConfigurationSchema` / `parseWorkflowStepConfiguration` —
  validates a `type`/`configuration` pair alone (used when merging an
  update's patch onto an existing step for re-validation).
* `workflowStepCreateSchema` / `WorkflowStepCreateInput` — the full
  create-step input (`stepKey`, `enabled?`, `type`, `configuration`),
  validated as one discriminated union so an invalid pairing (e.g.
  `type: 'wait'` with a `read`-shaped `configuration`) is structurally
  rejected. `stepKey` is trimmed, 1–100 characters, **strict snake_case**:
  `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$` — starts with a lowercase letter,
  contains only lowercase letters/digits/single underscores between
  words; hyphens, a leading digit, a leading/trailing underscore, and
  consecutive underscores are all rejected (never silently stripped or
  normalized). This is stricter than a "lowercase letters, digits,
  hyphens, underscores" rule because `stepKey` is also the stable
  identifier embedded inside other steps' step-output reference strings
  — see "Output references" under "Workflow Runs API" below.

**`signin` requires Supabase credentials**: its configuration is
`{ email: string, password: string }` — the specific Supabase user this
step authenticates as. `email` is trimmed and must be a valid email
address; `password` must be nonempty, is **not** trimmed (leading/
trailing whitespace is a valid password character and is preserved
exactly), and is bounded by `SIGNIN_PASSWORD_MAX_LENGTH` (128). No
password-complexity rule is enforced. Unknown properties (e.g.
`username`) are rejected, and the previously-accepted empty `{}`
configuration is now rejected.

An invalid step configuration — for `signin` or any other type — is
rejected with `400 Bad Request` and an error message that identifies a
useful nested field path (e.g. `steps.0.step configuration.password:
Invalid input: expected string, received undefined` for the aggregate
create endpoint, or `configuration.email` for individual step
create/update), never a raw Zod internal, a stack trace, or the
submitted value itself — a password is never echoed back in a
validation error, whether it is invalid, too long, or simply missing.

Credentials are stored **exactly as submitted** inside
`workflow_steps.configuration` — the same JSON column every step type's
configuration lives in. There is no separate project-level credential
table: each `signin` step carries its own credentials independently, so
different `signin` steps (even within the same workflow) may
authenticate as different Supabase users. This API does **not**
encrypt, hash, or mask these credentials, and does not currently return
a redacted value — reading a `signin` step back (via list/read/detail
endpoints) returns the stored `email`/`password` unchanged. The internal
`signin` executor (see "Workflow execution foundation" below) can call
Supabase with these credentials, but there is no orchestration loop, run
persistence, or HTTP/scheduler trigger that actually invokes it yet —
workflow execution is not reachable by a user of this API.

**OpenAPI documentation of step configuration shapes**: `configuration`
is not documented as a generic object. Each of the 8 step types has a
dedicated, documentation-only Swagger model
(`apps/api/src/modules/workflows/steps/dto/step-configurations/`, e.g.
`SigninStepConfigurationDto`, `WaitStepConfigurationDto`) mirroring its
shared Zod schema's shape, description, and examples — these classes
carry no `class-validator` decorators and are never used to validate a
request; the shared Zod schemas above remain the sole runtime source of
truth. `CreateWorkflowStepDto.configuration`,
`UpdateWorkflowStepDto.configuration`, and
`WorkflowStepResponseDto.configuration` all document `configuration` as
an OpenAPI `oneOf` referencing every one of the 8 models (via
`@ApiExtraModels` + `getSchemaPath`), and each property's description
spells out the `type` → configuration-model mapping in plain text. A
single flat DTO class cannot express "this specific shape applies only
when `type` equals this specific value" as a true correlated
discriminator without hand-written custom schema code that would risk
producing an invalid or Swagger-UI-breaking document — this `oneOf` +
mapping-table approach was chosen after inspecting the generated
`/api/openapi.json` and confirming it renders correctly, is valid
OpenAPI 3.1, and communicates the type/configuration relationship
clearly, without duplicating any validation logic. `CreateWorkflowDto.steps`
(the aggregate creation endpoint) references `CreateWorkflowStepDto`
directly, so it inherits the same `configuration` documentation
automatically. The password field on `SigninStepConfigurationDto` is
marked `format: 'password'` (a UI hint, not a validation rule); it is
**not** marked `writeOnly`, since the API's actual response behavior
does not omit or redact it — the OpenAPI document describes the real
current behavior, not an aspirational one.

Commands (run from the repository root, or via
`yarn workspace @supabase-heartbeat/validation <script>`):

```bash
yarn workspace @supabase-heartbeat/validation lint
yarn workspace @supabase-heartbeat/validation typecheck
yarn workspace @supabase-heartbeat/validation test
yarn workspace @supabase-heartbeat/validation build
```

`apps/api` depends on it via `workspace:*` and resolves it through its
built `dist/` output (`main`/`types` in `packages/validation/package.json`),
not directly from `src/` — the root `build` script builds
`@supabase-heartbeat/validation` before `apps/api`, so a clean install
followed by `yarn build` produces a consistent `dist/` before the API is
compiled. When iterating on both packages locally, rebuild
`@supabase-heartbeat/validation` (`yarn workspace @supabase-heartbeat/validation build`)
after changing its source so `apps/api` picks up the change.

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
GET    /api/projects/:projectId/overview # Project + aggregate metrics + per-workflow summaries + last 10 runs across the project
PATCH  /api/projects/:projectId          # Partially update an owned project (admin only)
DELETE /api/projects/:projectId          # Delete an owned project (admin only)
GET    /api/projects/:projectId/workflows                                 # List workflows in an owned project (lightweight, no steps)
POST   /api/projects/:projectId/workflows                                 # Create a workflow with its complete ordered steps, transactionally (admin only)
GET    /api/projects/:projectId/workflows/:workflowId                     # Read a workflow and its ordered steps in an owned project
GET    /api/projects/:projectId/workflows/:workflowId/overview            # Workflow detail + operational summary metrics + last 10 runs
PATCH  /api/projects/:projectId/workflows/:workflowId                     # Partially update a workflow (admin only)
PUT    /api/projects/:projectId/workflows/:workflowId                     # Replace a workflow and its complete step list, transactionally (admin only)
DELETE /api/projects/:projectId/workflows/:workflowId                     # Delete a workflow and its steps (admin only)
GET    /api/projects/:projectId/workflows/:workflowId/steps               # List a workflow's steps
POST   /api/projects/:projectId/workflows/:workflowId/steps               # Append a step (admin only)
PUT    /api/projects/:projectId/workflows/:workflowId/steps/order         # Replace the complete step order, transactionally (admin only)
GET    /api/projects/:projectId/workflows/:workflowId/steps/:stepId       # Read a step
PATCH  /api/projects/:projectId/workflows/:workflowId/steps/:stepId       # Partially update a step, excluding position (admin only)
DELETE /api/projects/:projectId/workflows/:workflowId/steps/:stepId       # Delete a step and compact positions (admin only)
POST   /api/projects/:projectId/workflows/:workflowId/runs                # Synchronously execute a workflow's enabled steps in order (admin only)
GET    /api/projects/:projectId/workflows/:workflowId/runs/:runId         # Read one run's full detail, including its ordered step runs
```

See "Projects API", "Workflows API", "Workflow Steps API", and
"Workflow Runs API" above for authentication, role, and
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
