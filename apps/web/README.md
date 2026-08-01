# @supabase-heartbeat/web

React frontend for Supabase Heartbeat.

## Responsibilities

Currently, the interface only renders a minimal page with a status text that
checks whether the API is reachable (`GET /api/health`) and displays
`Loading`, `API online`, or `API unavailable`. There is no dashboard,
authentication UI, routing, project/workflow management, or scheduler UI
yet — those are planned, not implemented.

## Stack

* React 19.
* Vite 8 (with the React Compiler enabled).
* TypeScript.
* Tailwind CSS v4.
* shadcn/ui (Radix UI primitives, `class-variance-authority`, `tailwind-merge`).
* Vitest.
* React Testing Library (`@testing-library/react`, `@testing-library/dom`,
  `@testing-library/user-event`, `@testing-library/jest-dom`).
* [Feature-Sliced Design](https://feature-sliced.design/) (FSD) for source
  organization, enforced by `steiger`.

## Development

Recommended: from the repository root, start both applications together:

```bash
yarn dev
```

Normal browser entry point:

```text
http://localhost:3000
```

To iterate on the frontend in isolation instead:

```bash
yarn workspace @supabase-heartbeat/web dev
```

This starts only the Vite dev server directly (bound to `127.0.0.1:5173`).
It is useful for isolated frontend work, but the app's API requests
(`/api/...`) will not resolve unless the API is also running and proxying
requests — for the normal, fully working setup, use the integrated
`yarn dev` command above.

## API requests

Always use relative `/api/...` URLs:

```ts
fetch('/api/health');
```

* Do not introduce a frontend API base URL environment variable.
* Do not hardcode `localhost:3000` or any other host.
* Do not introduce a CORS-based development setup without an explicit
  decision to do so — the current architecture avoids CORS entirely by
  having NestJS proxy to Vite in development and serve the built frontend
  directly in production.

## Architecture: Feature-Sliced Design (FSD)

```text
src/
├── app/          # global init: providers, root composition
├── pages/        # one folder per route/screen
│   └── <page>/{api,model,ui}
├── widgets/      # composite blocks shared across pages (layouts, route guards)
│   └── <widget>/ui
├── features/     # user-action slices with their own logic
├── entities/     # business domain
│   └── <entity>/{api,model,ui}
└── shared/       # business-agnostic code
    ├── ui/       # shadcn components (barrel: src/shared/ui/index.ts)
    └── lib/      # utils, hooks, theme
```

Each slice follows the FSD `api / model / ui / lib` segment convention.
`pages`, `widgets`, `features`, and `entities` are currently empty
placeholders — they are populated as the corresponding functionality is
built, not created speculatively.

Cross-layer dependency rules (for example, `entities` must not import from
`pages`) are enforced by [steiger](https://github.com/feature-sliced/steiger)
with the official `@feature-sliced/steiger-plugin`, `recommended` preset
(`apps/web/steiger.config.ts`).

## UI components (shadcn/ui)

Configured in `components.json` with aliases remapped to the FSD
convention instead of shadcn's defaults:

* `components` / `ui` → `@/shared/ui`
* `utils` / `lib` / `hooks` → `@/shared/lib`

To add a new component, run:

```bash
npx shadcn@latest add <component>
```

This places the component under `src/shared/ui/`. All installed
components are re-exported from a single barrel file,
`src/shared/ui/index.ts` — code outside `shared/ui` must import
components via the barrel, not a component file directly:

```tsx
import { Button } from "@/shared/ui"
```

## Path aliases

`tsconfig.json`, `tsconfig.app.json`, and `vite.config.ts` all define the
same FSD-layer aliases: `@/app`, `@/pages/*`, `@/widgets/*`,
`@/features/*`, `@/entities/*`, `@/shared/*`. All three must be updated
together — Vite's resolver and TypeScript's checker will silently diverge
otherwise.

## Testing

```bash
yarn workspace @supabase-heartbeat/web test
yarn workspace @supabase-heartbeat/web test:watch
```

Component tests use Vitest with the `jsdom` environment and React Testing
Library. Conventions already in use in this codebase:

* Test visible behavior (rendered text, roles), not implementation details.
* Prefer semantic queries (`getByRole`, `getByText`) over test IDs.
* Colocate tests with the component they cover (for example,
  `button.tsx` and `button.test.tsx` live in the same directory).
* Avoid snapshot tests as the only assertion.

## Lint, format, type-check, and validation

```bash
yarn workspace @supabase-heartbeat/web lint
yarn workspace @supabase-heartbeat/web format        # writes changes
yarn workspace @supabase-heartbeat/web format:check   # CI-safe, no writes
yarn workspace @supabase-heartbeat/web typecheck
yarn workspace @supabase-heartbeat/web steiger        # FSD layer rules
yarn workspace @supabase-heartbeat/web tailwind       # canonical Tailwind class suggestions
yarn workspace @supabase-heartbeat/web build
```

`validate` chains lint, typecheck, format, steiger, and tailwind into a
single command — this is what CI should run:

```bash
yarn workspace @supabase-heartbeat/web validate
```

Notes on the underlying tools:

* **ESLint**: flat config — `js.recommended` + `typescript-eslint.recommended`
  + `react-hooks` + `react-refresh` (vite preset). `react-refresh/only-export-components`
  is disabled specifically for `src/shared/ui/**` because shadcn components
  legitimately co-export `variants` (cva) alongside the component.
* **Prettier**: no semicolons, double quotes, `printWidth: 80`,
  `prettier-plugin-tailwindcss` pointed at `src/index.css` as the
  stylesheet, `tailwindFunctions: ["cn", "cva"]` so class sorting also
  applies inside those helpers.
* **`tailwind-suggest-canonical-classes`**
  (`@laststance/tailwind-suggest-canonical-classes`): scans all `.tsx`
  files and suggests canonical Tailwind class names using `src/index.css`
  as the token source.

`build` outputs the compiled frontend to:

```text
apps/web/dist
```

### Planned architecture

Not implemented yet — noted here only so future structure decisions aren't
made blind:

* A dashboard for managing Supabase projects and workflows, under `pages/`.
* Authentication UI wired to the API's Better Auth endpoints, under
  `entities/session` and related slices.
* Client-side routing, under `app/router`.

## Conventions

* Use relative `/api/...` requests; no frontend API base URL.
* Keep markup accessible and semantic (headings, roles) rather than relying
  on ad hoc `div`s and test IDs.
* Colocate component tests with their components.
* Do not import API database models/schema into frontend code.
* Do not add a router or state-management/data-fetching library without an
  explicit task to do so. UI components are added through shadcn/ui as
  needed.
* Respect FSD layer boundaries; let `steiger` catch violations rather than
  relying on manual review alone.
* Update this README whenever frontend commands, architecture, environment
  behavior, or testing conventions change.
