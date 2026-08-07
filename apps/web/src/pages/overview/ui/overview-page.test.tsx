import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage />
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

  it("shows a welcome message for the signed-in user", async () => {
    mockFetch()

    renderOverviewPage()

    expect(await screen.findByText("Welcome back, Admin")).toBeInTheDocument()
    expect(screen.getByText("admin@example.com")).toBeInTheDocument()
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
  })
})
