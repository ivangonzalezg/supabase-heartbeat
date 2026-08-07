import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { OverviewPage } from "./overview-page"

const { useSessionContextMock } = vi.hoisted(() => ({
  useSessionContextMock: vi.fn(),
}))

vi.mock("@/entities/session", () => ({
  useSessionContext: useSessionContextMock,
}))

const defaultWorkspaceSummary = { projects: [], workflows: [] }

function mockFetch(
  workspaceSummary: Response = new Response(
    JSON.stringify(defaultWorkspaceSummary),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
) {
  const fetchMock = vi.fn(() => Promise.resolve(workspaceSummary.clone()))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderOverviewPage() {
  const rootRoute = createRootRoute({ component: () => <OverviewPage /> })
  const createProjectStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/new",
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([createProjectStub])
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      user: { id: "user-1", email: "admin@example.com", name: "Admin" },
      role: "admin",
      isAuthenticated: true,
      signOut: vi.fn(),
    })
  })

  it("shows the page header", async () => {
    mockFetch()

    renderOverviewPage()

    expect(
      await screen.findByRole("heading", { name: "Overview" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Monitor your projects, workflows, and recent activity from one place."
      )
    ).toBeInTheDocument()
  })

  it("shows the empty state when there are no projects", async () => {
    mockFetch()

    renderOverviewPage()

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
  })

  it("renders the project and workflow counts once fetched", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          projects: [
            {
              id: "project-1",
              ownerId: "user-1",
              name: "Demo",
              description: null,
              supabaseUrl: "https://example.supabase.co",
              publishableKey: "sb_publishable_example",
              enabled: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          workflows: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    renderOverviewPage()

    const projectsCount = await screen.findByText("1")
    expect(projectsCount.nextSibling).toHaveTextContent("Projects")
    expect(screen.queryByText("No projects yet")).not.toBeInTheDocument()
  })
})
