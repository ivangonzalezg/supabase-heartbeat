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
import { ProjectOverviewPage } from "./project-overview-page"

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
  description: "Production project for the Artemivo website.",
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "sb_publishable_example",
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const projectOverview = {
  ...project,
  metrics: {
    totalWorkflows: 1,
    activeWorkflows: 1,
    totalRuns: 28,
    failedRuns: 2,
    lastActivity: "2026-01-01T09:00:00.000Z",
    nextRun: "2026-01-01T10:00:00.000Z",
  },
  workflows: [
    {
      id: "workflow-1",
      name: "Daily activity",
      enabled: true,
      cronExpression: "0 * * * *",
      timezone: "UTC",
      lastRun: "2026-01-01T09:00:00.000Z",
      lastStatus: "success",
      nextRun: "2026-01-01T10:00:00.000Z",
    },
  ],
  recentRuns: [
    {
      id: "run-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      status: "success",
      triggerType: "scheduled",
      startedAt: "2026-01-01T09:00:00.000Z",
      finishedAt: "2026-01-01T09:00:34.600Z",
      durationMs: 34600,
      failedStepKey: null,
    },
  ],
}

function mockFetch({
  overviewResponse = Promise.resolve(jsonResponse(projectOverview)),
  workspaceProjects = [project],
}: {
  overviewResponse?: Promise<Response>
  workspaceProjects?: unknown[]
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("/api/workspace-summary")) {
      return Promise.resolve(
        jsonResponse({ projects: workspaceProjects, workflows: [] })
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
    path: "/projects/$projectId",
    component: () => <ProjectOverviewPage />,
  })
  const routeTree = rootRoute.addChildren([overviewStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/projects/project-1"],
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

describe("ProjectOverviewPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the project name, metrics, workflows, and recent activity once loaded", async () => {
    mockFetch()

    renderPage()

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Artemivo" })
      ).toBeInTheDocument()
    )

    await waitFor(() => expect(screen.getByText("28")).toBeInTheDocument())
    expect(screen.getByText("WORKFLOWS · 1")).toBeInTheDocument()
    expect(screen.getAllByText("Daily activity").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("table")).toHaveLength(2)
  })

  it("shows the project name/status instantly from the workspace-summary cache, before the overview fetch resolves", async () => {
    let resolveOverview: (response: Response) => void = () => {}
    const overviewResponse = new Promise<Response>((resolve) => {
      resolveOverview = resolve
    })
    mockFetch({ overviewResponse })

    renderPage()

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Artemivo" })
      ).toBeInTheDocument()
    )
    expect(screen.getByText("Enabled")).toBeInTheDocument()

    resolveOverview(jsonResponse(projectOverview))
  })

  it("shows the no-workflows empty state when the project has zero workflows", async () => {
    mockFetch({
      overviewResponse: Promise.resolve(
        jsonResponse({ ...projectOverview, workflows: [], recentRuns: [] })
      ),
    })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText("No workflows yet")).toBeInTheDocument()
    )
    expect(
      screen.getByRole("link", { name: /create your first workflow/i })
    ).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("shows a brief name/status skeleton only when neither source has data yet", async () => {
    mockFetch({ workspaceProjects: [] })

    renderPage()

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /new workflow/i })
      ).toBeInTheDocument()
    )
    expect(
      screen.queryByRole("heading", { name: "Artemivo" })
    ).not.toBeInTheDocument()

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Artemivo" })
      ).toBeInTheDocument()
    )
  })
})
