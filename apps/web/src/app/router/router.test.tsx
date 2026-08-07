import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { rootRoute } from "./root-route"
import { dashboardLayoutRoute } from "./dashboard-layout-route"
import { indexRoute } from "./routes/index-route"
import { signInRoute } from "./routes/sign-in-route"
import { ThemeProvider } from "@/shared/lib/theme-provider"

const { useSessionContextMock } = vi.hoisted(() => ({
  useSessionContextMock: vi.fn(),
}))

vi.mock("@/entities/session", () => ({
  useSessionContext: useSessionContextMock,
}))

function mockFetch() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ projects: [], workflows: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderApp() {
  const routeTree = rootRoute.addChildren([
    dashboardLayoutRoute.addChildren([indexRoute]),
    signInRoute,
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

describe("router integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockFetch()
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      isAuthenticated: true,
      user: { id: "user-1", email: "admin@example.com", name: "Admin User" },
      role: "admin",
      signOut: vi.fn(),
    })
  })

  it("renders the sidebar and the overview page through the full route tree", async () => {
    renderApp()

    expect(await screen.findByText("Supabase Heartbeat")).toBeInTheDocument()
    expect(
      await screen.findByText("Welcome back, Admin User")
    ).toBeInTheDocument()
  })
})
