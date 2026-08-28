import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { NavProjects } from "./nav-projects"
import { SidebarProvider } from "@/shared/ui"

vi.mock("@/entities/session", () => ({
  useSessionContext: () => ({ isAuthenticated: true }),
}))

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
  cronExpression: "0 9 * * *",
  timezone: "UTC",
  enabled: true,
  overlapPolicy: "skip",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ projects: [project], workflows: [workflow] }),
          { status: 200 }
        )
      )
    )
  )
}

function renderAt(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <SidebarProvider>
        <NavProjects />
      </SidebarProvider>
    ),
  })
  const workflowStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/$workflowId",
    component: () => (
      <SidebarProvider>
        <NavProjects />
      </SidebarProvider>
    ),
  })
  const projectOverviewStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId",
    component: () => (
      <SidebarProvider>
        <NavProjects />
      </SidebarProvider>
    ),
  })
  const routeTree = rootRoute.addChildren([
    indexStub,
    workflowStub,
    projectOverviewStub,
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
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

describe("NavProjects", () => {
  it("renders the project name as a link to its overview page", async () => {
    mockFetch()

    renderAt("/")

    const link = await screen.findByRole("link", { name: "Artemivo" })
    expect(link).toHaveAttribute("href", "/projects/project-1")
  })

  it("renders each workflow as a link to its overview page once expanded", async () => {
    mockFetch()
    const user = userEvent.setup()

    renderAt("/")

    const expandButton = await screen.findByRole("button", {
      name: "Expand workflows",
    })
    await user.click(expandButton)

    const link = await screen.findByRole("link", { name: "Daily activity" })
    expect(link).toHaveAttribute(
      "href",
      "/projects/project-1/workflows/workflow-1"
    )
  })

  it("marks the current workflow's link active and expands its group", async () => {
    mockFetch()

    renderAt("/projects/project-1/workflows/workflow-1")

    const link = await screen.findByRole("link", { name: "Daily activity" })
    expect(link).toHaveAttribute("data-active", "true")
  })
})
