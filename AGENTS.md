# Agent Instructions

This file is the authoritative repository-wide instruction file for coding
agents working on Supabase Heartbeat.

## Required reading

Before analyzing, planning, or modifying the repository, read:

1. `AGENTS.md` (this file)
2. the root [`README.md`](README.md)
3. the README inside every application or package affected by the task
   ([apps/api/README.md](apps/api/README.md),
   [apps/web/README.md](apps/web/README.md))

Documentation can go stale. Inspect the actual repository (source files,
`package.json` scripts, configuration) rather than assuming these documents
are perfectly current — if you find a discrepancy, trust the code and
report the discrepancy.

## Language

Use English for:

* source code;
* comments;
* test descriptions;
* documentation;
* filenames;
* commit messages;
* implementation/completion reports.

## Scope discipline

* Implement only the work requested.
* Avoid speculative abstractions built for hypothetical future needs.
* Avoid unrelated refactors.
* Avoid placeholder modules, fake scripts, or unused dependencies.
* If you discover an out-of-scope issue, report it instead of silently
  expanding the task to fix it.

## Tooling and commands

* Use Yarn through Corepack (`corepack enable`, then `yarn ...`).
* Run workspace-aware commands from the repository root
  (`yarn workspace <name> <script>`), not by `cd`-ing into a workspace.
* Do not use `npm install`, `pnpm`, `bun`, or create a nested lockfile.
  `npm view` is fine for inspecting package metadata only.
* Do not install any CLI globally.
* Inspect the current CLI `--help` output before using a generator or
  migration command — do not rely on remembered flags.
* Prefer official generators and migration tools (Nest CLI, Drizzle Kit,
  the Better Auth CLI) over hand-writing what they would produce.
* For version-sensitive work, check current official documentation and
  installed package versions rather than assuming.

## Repository integrity

Do not create:

* nested Git repositories;
* nested lockfiles;
* duplicate package-manager configuration;
* unrelated root-level configuration.

## API architecture (`apps/api`)

* Organize business code under `apps/api/src/modules/<domain>/`.
* Keep database infrastructure under `apps/api/src/database/`.
* Keep frontend hosting integration (dev proxy, production static serving)
  under `apps/api/src/frontend/`.
* Reserve `apps/api/src/lib/` for domain-independent, cross-cutting code.
  Do not create it speculatively — only when such code actually exists.
* Do not create global `controllers/`, `services/`, `routes/`, or
  `repositories/` directories.
* Controllers handle HTTP concerns and delegate to services.
* Services contain business logic and access Drizzle directly.
* Do not add a repository layer by default.
* Colocate unit tests with the code they test (`*.spec.ts`).
* Keep e2e tests under `apps/api/test/`.
* Use explicit NestJS module registration (`imports: [...]`); do not use
  route auto-discovery.

## Database rules

* Use Drizzle Kit for migrations.
* Workflow: `db:check` → `db:generate` → review the generated SQL →
  `db:migrate`.
* `db:push` is not the normal project workflow.
* Do not add automatic migration behavior to a new runtime without explicit
  approval. Supabase Heartbeat has two approved, idempotent startup paths:
  `apps/api/src/main.ts` applies pending migrations for `yarn dev`, and
  [`docker-entrypoint.sh`](docker-entrypoint.sh) applies them before the
  self-hosted production container starts. Both only apply committed Drizzle
  migrations; generating migrations remains an explicit review step.
* Keep SQLite foreign keys enabled (`PRAGMA foreign_keys = ON`).
* Use full cascade deletion for data owned through the project/workflow
  hierarchy — no soft deletes, no orphaned rows after a parent deletion.
* Do not hand-edit migration SQL unless Drizzle Kit genuinely cannot
  express the required change; document the reason if this happens.
* Never use a real database file in tests. Tests use `:memory:` or another
  isolated database.

Do not describe or add tables/behavior for features that are not yet
implemented (for example, do not invent Better Auth behavior beyond what
actually exists in `apps/api/src/modules/auth/`).

Application-owned columns with a fixed set of valid values (statuses, step
types, trigger types, policies) must define a canonical readonly tuple in
`apps/api/src/database/schema/types.ts`, use Drizzle's SQLite `text({
enum: [...] })` inference for the TypeScript type, and enforce the same set
at runtime with a named SQLite `CHECK` constraint. TypeScript inference
alone is not runtime enforcement — both layers are required.

SQLite does not provide PostgreSQL-style row-level security. It cannot
determine the Better Auth user for a request. Never describe SQLite as
supporting native RLS, and never emulate it with shared-connection global
state (mutable current-user variables, AsyncLocalStorage query filtering,
triggers, or monkey-patched Drizzle default scopes).

Row authorization is enforced at the application level, in domain
services:

* Controllers pass the authenticated Better Auth actor to services; they
  must not query Drizzle directly, implement ownership rules, or trust a
  client-supplied owner/user ID.
* Services scope every user-facing list, update, and delete query by the
  authenticated actor's ownership (or explicit access) — never look up a
  resource unscoped and then mutate it.
* SQLite-level constraints (foreign keys, cascades, uniqueness, `CHECK`)
  enforce data integrity; they do not replace authorization.

## Agent task reports

Substantial implementation tasks (schema changes, new modules, migrations,
multi-file features) must maintain a persistent report under
`.agent-reports/YYYY-MM-DD-<task-slug>/`, with `report.md`, `commands.md`,
`inspection.md`, and `validation.md` updated progressively while the work
happens, not reconstructed from memory afterward. Redact secrets,
credentials, and tokens as `[REDACTED]`. Never commit `.agent-reports/`
(it is gitignored). Return only a concise terminal summary plus the report
path — trivial edits (e.g. a one-line typo fix) do not need a report unless
explicitly requested.

## Web rules (`apps/web`)

* Use relative `/api/...` requests. Do not introduce a frontend API base
  URL by default.
* Do not hardcode API hosts (`localhost:3000` or otherwise).
* Colocate component tests with their components.
* Use semantic React Testing Library queries (`getByRole`, `getByText`)
  over test IDs.
* Do not add a router or a state-management/data-fetching library without
  an explicit task to do so. UI components are added through shadcn/ui as
  needed (see the component rule below).
* Do not import API database schema/models directly into frontend code.
* File names use kebab-case (`session-provider.tsx`, `sign-in-form.tsx`),
  including test files (`sign-in-form.test.tsx`). Exported component
  identifiers still use PascalCase per React convention — only the file
  name changes. `App.tsx`/`App.test.tsx` at the composition root are the
  sole documented exception (Vite's own scaffold convention).
* Before building any UI component — inside a screen or as a shared
  piece — check in this order: (1) `apps/web/src/shared/ui/` for an
  existing component, (2) the shadcn MCP tools
  (`search_items_in_registries`, `view_items_in_registries`) for a
  matching registry component. Only hand-write custom markup (e.g. raw
  `<input>`/`<label>`) when no shadcn component fits. When a shadcn
  component is found, install and use it instead of hand-rolled markup.

`apps/web/src` follows Feature-Sliced Design (`app/`, `pages/`,
`widgets/`, `features/`, `entities/`, `shared/`), enforced by `steiger`
(`apps/web/steiger.config.ts`). See `apps/web/README.md` for the layer
breakdown and shadcn alias configuration.

## Tests and validation

Run the relevant commands before claiming a task is complete.

For workspace-specific changes, run that workspace's:

```bash
yarn workspace <name> lint
yarn workspace <name> typecheck
yarn workspace <name> test
yarn workspace <name> build
```

For cross-workspace changes, run from the root:

```bash
yarn lint
yarn typecheck
yarn test
yarn build
```

Do not claim that a command passed unless it was executed successfully.
If a pre-existing failure is found that is unrelated to the current task,
report it separately rather than silently fixing or ignoring it.

## Documentation maintenance

Update the relevant README whenever a task changes:

* commands;
* dependencies that affect setup;
* environment variables;
* routes;
* architecture;
* database workflow;
* testing workflow;
* runtime behavior;
* development behavior;
* build outputs.

Update `AGENTS.md` itself when repository-wide agent rules change.

## Completion reports

Every completion report should include:

* commands executed;
* dependencies added, removed, or changed;
* files created, modified, moved, or deleted;
* tests and validations run, and their results;
* documentation updated;
* deviations from the request and the exact technical reason for each;
* unresolved issues.

## Instruction priority

1. Explicit user instructions
2. `AGENTS.md` (this file)
3. The README for the affected application or package
4. The root README

Even with this priority order, inspect the actual code and configuration
when documentation appears stale — do not follow a document you know
contradicts the real implementation without flagging it.
