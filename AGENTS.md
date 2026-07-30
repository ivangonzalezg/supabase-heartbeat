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
* Do not run migrations automatically on application startup unless
  explicitly requested.
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

## Web rules (`apps/web`)

* Use relative `/api/...` requests. Do not introduce a frontend API base
  URL by default.
* Do not hardcode API hosts (`localhost:3000` or otherwise).
* Colocate component tests with their components.
* Use semantic React Testing Library queries (`getByRole`, `getByText`)
  over test IDs.
* Do not add a router, state-management library, UI component library, or
  data-fetching library without an explicit task to do so.
* Do not import API database schema/models directly into frontend code.

Feature-Sliced Design (or any other layered frontend architecture) is not
mandatory — it has not been adopted in this repository. Do not assume or
introduce it without an explicit task.

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
