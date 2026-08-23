import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { WorkflowOverviewPage } from "./workflow-overview-page"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const project = {
  id: "project-1",
  ownerId: "user-1",
  name: "Artemivo",
  description: null,
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "sb_publishable_example",
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const workflowSummary = {
  id: "workflow-1",
  projectId: "project-1",
  name: "Daily activity",
  description: null,
  cronExpression: "0 9 * * *",
  timezone: "America/Bogota",
  enabled: true,
  overlapPolicy: "skip",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const workflowOverview = {
  ...workflowSummary,
  steps: [
    {
      id: "step-1",
      workflowId: "workflow-1",
      stepKey: "wait_step",
      type: "wait",
      position: 0,
      configuration: { seconds: 30 },
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  metrics: {
    totalRuns: 12,
    successRate: 83.3,
    failedRuns: 1,
    avgDurationMs: 3600,
    lastRun: "2026-01-01T09:00:00.000Z",
    nextRun: "2026-01-01T10:00:00.000Z",
  },
  recentRuns: [
    {
      id: "run-1",
      status: "success",
      triggerType: "scheduled",
      startedAt: "2026-01-01T09:00:00.000Z",
      finishedAt: "2026-01-01T09:00:03.800Z",
      durationMs: 3800,
      failedStepKey: null,
    },
  ],
}

function mockFetch({
  overviewResponse = Promise.resolve(jsonResponse(workflowOverview)),
  workspaceWorkflows = [workflowSummary],
}: {
  overviewResponse?: Promise<Response>
  workspaceWorkflows?: unknown[]
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("/api/workspace-summary")) {
      return Promise.resolve(
        jsonResponse({ projects: [project], workflows: workspaceWorkflows })
      )
    }
    return overviewResponse
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderPage() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const overviewStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/$workflowId",
    component: () => <WorkflowOverviewPage />,
  })
  const routeTree = rootRoute.addChildren([overviewStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/projects/project-1/workflows/workflow-1"],
    }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe("WorkflowOverviewPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the workflow name, steps, metrics, and recent runs once loaded", async () => {
    mockFetch()

    renderPage()

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Daily activity" })
      ).toBeInTheDocument()
    )

    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument())
    expect(screen.getByText("CONFIGURED STEPS · 1")).toBeInTheDocument()
    expect(screen.getByText("wait")).toBeInTheDocument()
    expect(screen.getByText("83.3%")).toBeInTheDocument()
    expect(screen.getByRole("table")).toBeInTheDocument()
  })

  it("shows the workflow name/status instantly from the workspace-summary cache, before the overview fetch resolves", async () => {
    let resolveOverview: (response: Response) => void = () => {}
    const overviewResponse = new Promise<Response>((resolve) => {
      resolveOverview = resolve
    })
    mockFetch({ overviewResponse })

    renderPage()

    // The name/status prefill comes from `/api/workspace-summary` (the
    // same cache the sidebar already populates) — no separate
    // single-workflow fetch is involved, and no skeleton is shown for
    // this part while only the overview fetch is still pending.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Daily activity" })
      ).toBeInTheDocument()
    )
    expect(screen.getByText("Enabled")).toBeInTheDocument()

    resolveOverview(jsonResponse(workflowOverview))
  })

  it("shows a skeleton for metrics, steps, and recent runs while the overview fetch is pending, without hiding the header", async () => {
    let resolveOverview: (response: Response) => void = () => {}
    const overviewResponse = new Promise<Response>((resolve) => {
      resolveOverview = resolve
    })
    mockFetch({ overviewResponse })

    renderPage()

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Daily activity" })
      ).toBeInTheDocument()
    )

    // Header is already visible from the workspace-summary prefill,
    // while the overview fetch (steps/metrics/recent runs) is still
    // pending — the table skeleton renders its own `<table>` shell, but
    // no real run data.
    expect(screen.queryByText("CONFIGURED STEPS · 1")).not.toBeInTheDocument()
    expect(screen.queryByText("12")).not.toBeInTheDocument()
    expect(screen.queryByText("83.3%")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument()

    resolveOverview(jsonResponse(workflowOverview))

    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument())
    expect(screen.getByText("CONFIGURED STEPS · 1")).toBeInTheDocument()
    expect(screen.getByText("83.3%")).toBeInTheDocument()
  })

  it("shows a brief name/status skeleton only when neither source has data yet", async () => {
    mockFetch({ workspaceWorkflows: [] })

    renderPage()

    // Nothing in workspace-summary matches this workflow ID, and the
    // overview fetch has not resolved yet either — `WorkflowHeader`
    // still renders (action buttons included), just with a skeleton for
    // the name/status portion instead of hiding itself.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /run now/i })
      ).toBeInTheDocument()
    )
    expect(
      screen.queryByRole("heading", { name: "Daily activity" })
    ).not.toBeInTheDocument()

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Daily activity" })
      ).toBeInTheDocument()
    )
  })
})
