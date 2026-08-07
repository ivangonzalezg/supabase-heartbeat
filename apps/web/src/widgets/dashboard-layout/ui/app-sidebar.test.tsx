import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { AppSidebar } from "./app-sidebar"
import { SidebarProvider } from "@/shared/ui"

const { useSessionContextMock } = vi.hoisted(() => ({
  useSessionContextMock: vi.fn(),
}))

vi.mock("@/entities/session", () => ({
  useSessionContext: useSessionContextMock,
}))

const projectA = {
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

function workflow(overrides: { id: string; projectId: string; name: string }) {
  return {
    ...overrides,
    description: null,
    cronExpression: "0 * * * *",
    timezone: "UTC",
    enabled: true,
    overlapPolicy: "skip",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function mockFetch(body: unknown) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderSidebar() {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    ),
  })
  const indexStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexStub])
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

describe("AppSidebar", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      isAuthenticated: true,
      user: { id: "user-1", email: "admin@example.com", name: "Admin User" },
      role: "admin",
      signOut: vi.fn(),
    })
  })

  it("renders project names from the workspace summary", async () => {
    mockFetch({
      projects: [projectA],
      workflows: [
        workflow({ id: "wf-1", projectId: "project-1", name: "Weekly CRUD" }),
      ],
    })

    renderSidebar()

    expect(await screen.findByText("Artemivo")).toBeInTheDocument()
  })

  it("toggles workflow visibility when a project row is clicked", async () => {
    mockFetch({
      projects: [projectA],
      workflows: [
        workflow({ id: "wf-1", projectId: "project-1", name: "Weekly CRUD" }),
      ],
    })
    const user = userEvent.setup()

    renderSidebar()

    const projectButton = await screen.findByText("Artemivo")
    expect(screen.queryByText("Weekly CRUD")).not.toBeInTheDocument()

    await user.click(projectButton)
    expect(await screen.findByText("Weekly CRUD")).toBeInTheDocument()

    await user.click(projectButton)
    expect(screen.queryByText("Weekly CRUD")).not.toBeInTheDocument()
  })

  it("renders the empty state when there are no projects", async () => {
    mockFetch({ projects: [], workflows: [] })

    renderSidebar()

    expect(await screen.findByText(/NO PROJECTS YET/)).toBeInTheDocument()
  })

  it("renders a disabled New project button", async () => {
    mockFetch({ projects: [], workflows: [] })

    renderSidebar()

    const button = await screen.findByRole("button", { name: /New project/ })
    expect(button).toBeDisabled()
  })

  it("calls signOut when the sign out button is clicked", async () => {
    mockFetch({ projects: [], workflows: [] })
    const signOut = vi.fn()
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      isAuthenticated: true,
      user: { id: "user-1", email: "admin@example.com", name: "Admin User" },
      role: "admin",
      signOut,
    })
    const user = userEvent.setup()

    renderSidebar()

    await user.click(await screen.findByRole("button", { name: "Sign out" }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
