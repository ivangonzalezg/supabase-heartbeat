import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
import { OverviewPage } from "./overview-page"

const { useSessionContextMock } = vi.hoisted(() => ({
  useSessionContextMock: vi.fn(),
}))

vi.mock("@/entities/session", () => ({
  useSessionContext: useSessionContextMock,
}))

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

const workflow = {
  id: "workflow-1",
  projectId: "project-1",
  name: "Daily activity",
  description: null,
  cronExpression: "0 * * * *",
  timezone: "UTC",
  enabled: true,
  overlapPolicy: "skip",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const overview = {
  metrics: {
    totalProjects: 1,
    activeWorkflows: 1,
    totalRuns: 28,
    failedRuns: 2,
    lastActivity: "2026-01-01T09:00:00.000Z",
    nextRun: "2026-01-01T10:00:00.000Z",
    nextRunWorkflowName: "Database Keepalive",
    nextRunProjectName: "Production",
  },
  projects: [
    {
      id: "project-1",
      name: "Artemivo",
      enabled: true,
      totalWorkflows: 1,
      activeWorkflows: 1,
      lastActivity: "2026-01-01T09:00:00.000Z",
      nextRun: "2026-01-01T10:00:00.000Z",
    },
  ],
  recentRuns: [
    {
      id: "run-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      projectId: "project-1",
      projectName: "Artemivo",
      status: "success",
      triggerType: "scheduled",
      startedAt: "2026-01-01T09:00:00.000Z",
      finishedAt: "2026-01-01T09:00:34.600Z",
      durationMs: 34600,
      failedStepKey: null,
    },
  ],
  upcomingRuns: [
    {
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      projectId: "project-1",
      projectName: "Artemivo",
      nextRun: "2026-01-01T10:00:00.000Z",
      cronExpression: "0 * * * *",
    },
  ],
}

function mockFetch({
  workspaceProjects = [project],
  workspaceWorkflows = [workflow],
  overviewResponse = Promise.resolve(jsonResponse(overview)),
}: {
  workspaceProjects?: unknown[]
  workspaceWorkflows?: unknown[]
  overviewResponse?: Promise<Response>
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("/api/workspace-summary")) {
      return Promise.resolve(
        jsonResponse({
          projects: workspaceProjects,
          workflows: workspaceWorkflows,
        })
      )
    }
    return overviewResponse
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderPage() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <OverviewPage />,
  })
  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
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

describe("OverviewPage", () => {
  beforeEach(() => {
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      isAuthenticated: true,
      user: { id: "user-1", name: "Test User", email: "test@example.com" },
      role: "admin",
      signOut: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders global summary, projects, recent activity, and upcoming runs once loaded", async () => {
    mockFetch()

    renderPage()

    await waitFor(() => expect(screen.getByText("28")).toBeInTheDocument())

    expect(screen.getByText("PROJECTS · 1")).toBeInTheDocument()
    expect(screen.getByText("RECENT ACTIVITY")).toBeInTheDocument()
    expect(screen.getByText("UPCOMING RUNS")).toBeInTheDocument()
    expect(screen.getAllByText("Artemivo").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Daily activity").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("table")).toHaveLength(3)
    expect(
      screen.getByRole("link", { name: /new project/i })
    ).toBeInTheDocument()
  })

  it("shows the no-projects empty state and hides the New project button", async () => {
    mockFetch({ workspaceProjects: [], workspaceWorkflows: [] })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText("No projects yet")).toBeInTheDocument()
    )
    expect(
      screen.queryByRole("link", { name: "New project" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /create your first project/i })
    ).toBeInTheDocument()
  })

  it("shows the no-workflows empty state and keeps the New project button visible", async () => {
    mockFetch({ workspaceWorkflows: [] })

    renderPage()

    await waitFor(() =>
      expect(
        screen.getByText("Choose a project to create its first workflow")
      ).toBeInTheDocument()
    )
    expect(
      screen.getByRole("link", { name: "New project" })
    ).toBeInTheDocument()
  })

  it("shows the recent-activity empty state while other sections stay populated", async () => {
    mockFetch({
      overviewResponse: Promise.resolve(
        jsonResponse({ ...overview, recentRuns: [] })
      ),
    })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText("No runs yet")).toBeInTheDocument()
    )
    expect(
      screen.getByText("Runs will appear after a workflow executes.")
    ).toBeInTheDocument()
    expect(screen.getByText("PROJECTS · 1")).toBeInTheDocument()
  })

  it("shows the upcoming-runs empty state while other sections stay populated", async () => {
    mockFetch({
      overviewResponse: Promise.resolve(
        jsonResponse({ ...overview, upcomingRuns: [] })
      ),
    })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText("No upcoming runs")).toBeInTheDocument()
    )
    expect(
      screen.getByText(
        "Enable a scheduled workflow to see its next execution here."
      )
    ).toBeInTheDocument()
  })
})
