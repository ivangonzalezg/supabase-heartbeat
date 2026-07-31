# @supabase-heartbeat/web

React frontend for Supabase Heartbeat.

## Responsibilities

Currently, the interface only renders a minimal page with a status card that
checks whether the API is reachable (`GET /api/health`) and displays
`Loading`, `API online`, or `API unavailable`. There is no dashboard,
authentication UI, routing, project/workflow management, or scheduler UI
yet — those are planned, not implemented.

## Stack

* React 19.
* Vite 8 (with the React Compiler enabled).
* TypeScript.
* Vitest.
* React Testing Library (`@testing-library/react`, `@testing-library/dom`,
  `@testing-library/user-event`, `@testing-library/jest-dom`).

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
  `StatusCard.tsx` and `StatusCard.test.tsx` live in the same directory).
* Avoid snapshot tests as the only assertion.

## Lint, type-check, and build

```bash
yarn workspace @supabase-heartbeat/web lint
yarn workspace @supabase-heartbeat/web typecheck
yarn workspace @supabase-heartbeat/web build
```

`build` outputs the compiled frontend to:

```text
apps/web/dist
```

## Current structure

```text
src/
├── main.tsx
├── App.tsx
├── App.test.tsx
├── index.css
├── components/
│   └── StatusCard/
│       ├── StatusCard.tsx
│       ├── StatusCard.css
│       └── StatusCard.test.tsx
└── test/
    └── setup.ts        # Vitest + jest-dom setup
```

This is a flat structure with a single shared component so far. No
feature-based or layered architecture (such as Feature-Sliced Design) has
been adopted yet.

### Planned architecture

Not implemented yet — noted here only so future structure decisions aren't
made blind:

* A dashboard for managing Supabase projects and workflows.
* Authentication UI wired to the API's Better Auth endpoints.
* Client-side routing.

## Conventions

* Use relative `/api/...` requests; no frontend API base URL.
* Keep markup accessible and semantic (headings, roles) rather than relying
  on ad hoc `div`s and test IDs.
* Colocate component tests with their components.
* Do not import API database models/schema into frontend code.
* Do not add a router, state-management library, UI component library, or
  data-fetching library without an explicit task to do so.
* Update this README whenever frontend commands, architecture, environment
  behavior, or testing conventions change.
