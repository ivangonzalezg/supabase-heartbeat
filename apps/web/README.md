# @supabase-heartbeat/web

React frontend for Supabase Heartbeat.

## Responsibilities

Two routes exist today: `/sign-in` (public) and `/` (protected overview,
showing the signed-in user's projects/workflows). Routing is handled by
TanStack Router with a single centralized auth guard — see "Routing
(TanStack Router)" below. There is no dashboard or scheduler UI yet —
those are planned, not implemented.

A cross-project summary of the authenticated user's projects and workflows
(the full field set, minus each workflow's `steps`) is fetched and cached
via TanStack Query, exposed through `entities/project` (`useProjects`) and
`entities/workflow` (`useWorkflows`, `useWorkflowsByProject`). This exists
ahead of the sidebar UI that will consume it, so that UI can render
instantly from cache instead of starting from a blank loading state.

## Stack

* React 19.
* Vite 8 (with the React Compiler enabled).
* TypeScript.
* Tailwind CSS v4.
* shadcn/ui (Radix UI primitives, `class-variance-authority`, `tailwind-merge`).
* Vitest.
* React Testing Library (`@testing-library/react`, `@testing-library/dom`,
  `@testing-library/user-event`, `@testing-library/jest-dom`).
* TanStack Query (`@tanstack/react-query`) for server-state fetching and
  caching. `QueryClientProvider` is mounted once in `main.tsx`, outermost
  among the app's providers.
* TanStack Router (`@tanstack/react-router`) for client-side routing —
  code-based route definitions (no file-based codegen), see `src/app/router/`.
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
├── app/          # global init: providers, root composition, routing (app/router/)
├── pages/        # one folder per route/screen
│   └── <page>/{api,model,ui}
├── widgets/      # composite blocks shared across pages (layouts)
│   └── <widget>/ui
├── features/     # user-action slices with their own logic
├── entities/     # business domain
│   └── <entity>/{api,model,ui}
└── shared/       # business-agnostic code
    ├── ui/       # shadcn components (barrel: src/shared/ui/index.ts)
    └── lib/      # utils, hooks, theme
```

Each slice follows the FSD `api / model / ui / lib` segment convention.
`features` is currently an empty placeholder — populated as the
corresponding functionality is built, not created speculatively.
`widgets/dashboard-layout` exists: the sidebar + layout shell wrapping
every dashboard-area page (see "Routing" below for how it's wired in).
`widgets/workflow-form` also exists: the workflow create/edit form,
shared by `pages/create-workflow` and `pages/edit-workflow` (see below).
`widgets/run-details-drawer` exists too: the right-side run-details
slide-over, deliberately built as a self-contained, data-props-only
component ahead of its second real caller — see below.
`entities/session`, `entities/project`, and `entities/workflow` exist;
`entities/project` and `entities/workflow` both read from the same
`/api/workspace-summary` endpoint (defined once in `shared/api`, since
`shared` cannot depend on `entities`) through a shared TanStack Query
cache key, so mounting both together triggers a single network request,
not two. Each hook takes an explicit `enabled: boolean` parameter rather
than reading auth status itself — `shared`/`entities` cannot import
`entities/session` (steiger forbids both upward and same-layer
cross-slice imports), so gating the fetch on authentication is the
composing widget/page's responsibility (`widgets/dashboard-layout`'s
sidebar and `pages/overview` both pass `isAuthenticated` from
`useSessionContext()` into the hooks independently).

`pages/workflow-overview` (route
`/projects/$projectId/workflows/$workflowId`, reached from the sidebar
or after creating a workflow) shows a single workflow's name, enabled
status, ordered steps, operational-summary metrics, and its 10 most
recent runs. It uses two hooks together: `entities/workflow`'s
`useWorkflows` (the same `/api/workspace-summary` cache the sidebar,
`widgets/dashboard-layout`, already populates) is read purely as a
prefill/instant-paint mechanism — whatever's already cached from
wherever the user navigated in from lets the header's name/enabled badge
render immediately, with zero extra network request — while
`useWorkflowOverview` (from the complete `GET
.../workflows/:workflowId/overview` endpoint) is the single source of
truth for everything else on the page: steps, operational-summary
metrics, and recent runs. The operational-summary card, configured-steps
panel, and recent-runs table each render their own skeleton
(`operational-summary-skeleton.tsx` / `configured-steps-panel-skeleton.tsx`
/ `recent-runs-table-skeleton.tsx`) while `useWorkflowOverview` is
pending — no `useTransition`, just each query's own
`isPending`/`isError`/success branch. `WorkflowHeader` itself never fully
hides: it renders its name/status as a skeleton only in the brief moment
neither data source has resolved yet, while its action buttons (`Run
now`, `Edit`, `Disable`/`Enable`, the delete dropdown) always render.
`Edit` links to `/projects/$projectId/workflows/$workflowId/edit`
(`pages/edit-workflow`, see below). `Disable`/`Enable` is fully wired:
clicking it opens a shadcn `AlertDialog` ("Disable/Enable this workflow?")
before anything happens — confirming either direction runs the mutation,
canceling does nothing. `WorkflowHeader` owns the mutation itself (via
`entities/workflow`'s `useUpdateWorkflow`, `PATCH
/api/projects/:projectId/workflows/:workflowId` with just `{ enabled }`),
and on success invalidates both the workspace summary and
`["workflow-overview", ...]` so the badge and every dependent query
(including the sidebar) reflect the new status; a failed toggle shows a
`sonner` error toast and leaves `enabled` unchanged.

`Delete workflow` (the `⋯` dropdown item) is also fully wired, with
extra friction since it's irreversible: selecting it opens a second,
independently-controlled `AlertDialog` (`open`/`onOpenChange` state in
`WorkflowHeader`, not nested as the dropdown item's own trigger — Radix's
`DropdownMenu` and `AlertDialog` fight over focus/unmount timing when an
`AlertDialogTrigger` is nested inside a `DropdownMenuItem`) stating that
the workflow, all of its steps, and its complete run history will be
permanently deleted. Its confirm button starts disabled with a 5-second
countdown in its label (`"Delete workflow (5)"` → ... → `"Delete
workflow"`), reset every time the dialog reopens, so a reflexive click
can't trigger deletion. Confirming calls `entities/workflow`'s
`useDeleteWorkflow` (`DELETE /api/projects/:projectId/workflows/:workflowId`
— already cascade-deletes steps, runs, and step-runs at the DB level, no
backend changes were needed here) and, on success, navigates to `/` since
the workflow being viewed no longer exists; a failure shows a `sonner`
error toast and leaves the dialog open. Duration and relative-timestamp
formatting (`"3.6s"`, `"Today, 09:00 AM"`) live in
`entities/workflow/lib/format-duration.ts` and `format-run-timestamp.ts`
(moved out of this page's own `lib/` since the run-details drawer below
also needs them) — shared between the summary card, the runs table, and
the drawer. The recent-runs table's per-status colored chip
(Success/Failed/Skipped/Running/...) is `entities/workflow`'s
`RunStatusBadge`, for the same reuse reason.

Each recent-runs row's "View details" action opens
`widgets/run-details-drawer`'s `RunDetailsDrawer` — a right-side
slide-over (`shared/ui/sheet.tsx`'s `Sheet`, `side="right"`, previously
unused anywhere in the app) showing one run's full detail: execution
metadata (run ID, trigger, duration), timing (started/finished), outcome
(status, failed step), and a "STEP EXECUTION SEQUENCE" list — one card
per attempted step with its status, duration, and type/outcome-dependent
detail rows (`Input`/`Output` on success, `Error` on the step that
failed). Data comes from `entities/workflow`'s `useWorkflowRunDetail`
(`GET .../workflows/:workflowId/runs/:runId`, a new backend endpoint —
`WorkflowRunsService.findRunDetail`, joining `step_runs` to
`workflow_steps` so each step run arrives already enriched with its
`stepKey`/`type`). Because execution stops at the first failure and the
backend never persists a `skipped` row for steps after it, the drawer
infers "skipped" client-side: given the workflow's currently configured
steps (passed in as `configuredSteps`, optional) and a failed run, any
configured step beyond the last persisted step run is rendered as a
synthetic skipped card ("Not executed after failure") — no backend
change was needed for this. `WorkflowOverviewPage` owns which run is
selected (`selectedRunId` state) and passes it down; the drawer itself
takes plain data props (`projectId`/`workflowId`/`runId`/`workflowName`/
`projectName`/`configuredSteps`) rather than reading route params, so it
has no dependency on this specific page and can be dropped into a future
project-level or workspace-level run-list page unmodified — the reason
it lives in `widgets/`, not `pages/workflow-overview/ui/`, despite
having only one caller today (an explicit `steiger.config.ts` override
suppresses the "insignificant slice" rule for this one slice, with a
comment explaining why).

`widgets/workflow-form` holds the workflow create/edit form (metadata
fields, drag-and-drop step list, and every per-step-type field
component under `ui/step-config-forms/`) as a single `WorkflowForm`
component taking `defaultValues`/`onSubmit`/`submitLabel`/`title`/
`description`/`cancelTo` props — it lives in `widgets/`, not either
page, because `pages/create-workflow` and `pages/edit-workflow` (route
`/projects/$projectId/workflows/$workflowId/edit`) both need it and
steiger's FSD rules forbid one page slice importing another. Both pages
are now thin wrappers: `create-workflow-page.tsx` supplies empty
`defaultValues` and calls `useCreateWorkflow`; `edit-workflow-page.tsx`
prefills `defaultValues` from `useWorkflowOverview` (including each
step's `id`, threaded through as a hidden field so the backend can tell
"update this step" from "create a new step" on submit) and calls the
new `useReplaceWorkflow` (`PUT
/api/projects/:projectId/workflows/:workflowId`) — a full replace of the
workflow's metadata and complete step list in one request, chosen over
reusing the many separate Workflow Steps API calls so the edit form's
submission stays symmetric with create's ("send the whole form state").

Cross-layer dependency rules (for example, `entities` must not import from
`pages`) are enforced by [steiger](https://github.com/feature-sliced/steiger)
with the official `@feature-sliced/steiger-plugin`, `recommended` preset
(`apps/web/steiger.config.ts`).

## Routing (TanStack Router)

`src/app/router/`:

* `root-route.tsx` — the root route and its component (`RootLayout`),
  which is the **single, centralized place auth is checked**. It reads
  `useSessionContext()` and redirects: unauthenticated users away from any
  route other than `/sign-in`, and authenticated users away from
  `/sign-in`. Individual pages/routes carry no guard logic of their own.
  While `status === "loading"`, it renders a loading state instead of
  `<Outlet />`.
* `dashboard-layout-route.tsx` — a **pathless layout route**
  (`createRoute({ id: "dashboard-layout", ... })`, no `path`) nested under
  `rootRoute`, rendering `widgets/dashboard-layout`'s `DashboardLayout`
  (sidebar + content shell). Contributes no URL segment; only wraps its
  children in the sidebar chrome.
* `routes/index-route.tsx` — `/`, nested under `dashboardLayoutRoute`,
  renders `pages/overview`.
* `routes/sign-in-route.tsx` — `/sign-in`, nested directly under
  `rootRoute` (outside the dashboard layout — no sidebar on the sign-in
  screen).
* `routes/create-workflow-route.tsx` — `/projects/$projectId/workflows/new`,
  renders `pages/create-workflow`.
* `routes/workflow-overview-route.tsx` —
  `/projects/$projectId/workflows/$workflowId`, renders
  `pages/workflow-overview`.
* `routes/edit-workflow-route.tsx` —
  `/projects/$projectId/workflows/$workflowId/edit`, renders
  `pages/edit-workflow`.
* `router.tsx` — builds the route tree: `rootRoute.addChildren([
  dashboardLayoutRoute.addChildren([indexRoute, createProjectRoute,
  createWorkflowRoute, workflowOverviewRoute, editWorkflowRoute]),
  signInRoute ])` and the `router` instance; also declares the TanStack
  Router module augmentation
  (`declare module "@tanstack/react-router" { interface Register { router:
  typeof router } }`) for type-safe navigation.
* `index.ts` — public API, exports `router`.

Routing uses **code-based route definitions** (`createRoute(...)` objects),
not file-based routing/codegen (`@tanstack/router-plugin`'s `src/routes/`
directory convention) — at this route count, file-based routing's
generated route tree would duplicate FSD's own `pages/<page>/` directory
convention for no benefit. Add new leaf routes as `createRoute` objects
under `app/router/routes/` (nested under `dashboardLayoutRoute` if they
belong inside the sidebar shell), following the existing ones as the
pattern; non-leaf/layout routes (like `dashboard-layout-route.tsx`) live
as siblings of `root-route.tsx` instead, not inside `routes/`.

Because the root route wraps every child route via `<Outlet />`, it stays
mounted across navigations, so sign-out/sign-in redirects happen
automatically as a side effect of the guard reacting to
`useSessionContext()` changing — no page needs to call `navigate()`
itself.

`RouterProvider` is mounted inside `SessionProvider` in `main.tsx` (the
root route's guard needs `useSessionContext()`, so it must render as a
descendant of the provider that supplies it).

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

**Before hand-writing any UI markup** — inside a screen, a feature, or a
shared component — check in this order:

1. `src/shared/ui/` for a component that already does the job.
2. The shadcn MCP tools (`search_items_in_registries`,
   `view_items_in_registries`) for a matching registry component.

Only fall back to raw markup (`<input>`, `<label>`, custom one-off
elements) when no shadcn component fits. If a shadcn component is found,
install it (`npx shadcn@latest add <component>`) and use it instead of
writing custom markup.

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

* A full dashboard for managing Supabase projects and workflows, under
  `pages/` — `pages/overview` today only shows a welcome message and
  project/workflow counts.
* A working "New project" action — the sidebar's button is rendered
  `disabled` today, with no route to navigate to.

## Conventions

* Use relative `/api/...` requests; no frontend API base URL.
* Keep markup accessible and semantic (headings, roles) rather than relying
  on ad hoc `div`s and test IDs.
* Colocate component tests with their components.
* Do not import API database models/schema into frontend code.
* Routing uses TanStack Router with code-based route definitions under
  `app/router/` (not file-based routing/codegen) — see "Routing (TanStack
  Router)" above; keep new routes as `createRoute` objects there rather
  than introducing a `src/routes/` directory convention. TanStack Query is
  the established data-fetching library (see "Stack" above) — reuse it
  for new server-state needs rather than introducing another one. UI
  components are added through shadcn/ui — see "UI components (shadcn/ui)"
  above for the required check-first flow.
* Respect FSD layer boundaries; let `steiger` catch violations rather than
  relying on manual review alone.
* File names use kebab-case (`session-provider.tsx`, `sign-in-form.tsx`,
  including `.test.tsx` files). Exported component identifiers stay
  PascalCase per React convention — only the file name changes.
* Update this README whenever frontend commands, architecture, environment
  behavior, or testing conventions change.
