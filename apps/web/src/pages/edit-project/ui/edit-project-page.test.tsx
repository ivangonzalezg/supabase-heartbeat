import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
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
import { toast } from "sonner"
import { EditProjectPage } from "./edit-project-page"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const projectOverview = {
  id: "project-1",
  ownerId: "user-1",
  name: "Artemivo",
  description: "Existing description",
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "sb_publishable_example",
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  metrics: {
    totalWorkflows: 0,
    activeWorkflows: 0,
    totalRuns: 0,
    failedRuns: 0,
    lastActivity: null,
    nextRun: null,
  },
  workflows: [],
  recentRuns: [],
}

function mockFetch({
  overviewResponse = jsonResponse(projectOverview),
  updateResponse = jsonResponse(projectOverview),
}: {
  overviewResponse?: Response
  updateResponse?: Response
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    void input
    if (init?.method === "PATCH") {
      return Promise.resolve(updateResponse.clone())
    }
    return Promise.resolve(overviewResponse.clone())
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderEditProjectPage() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const editStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/edit",
    component: () => <EditProjectPage />,
  })
  const overviewStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId",
    component: () => <div>Project overview page</div>,
  })
  const routeTree = rootRoute.addChildren([editStub, overviewStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/projects/project-1/edit"],
    }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { router }
}

describe("EditProjectPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(toast.error).mockReset()
  })

  it("prefills the form with the project's current values", async () => {
    mockFetch()
    renderEditProjectPage()

    expect(
      await screen.findByRole("heading", { name: "Edit project" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Project name")).toHaveValue("Artemivo")
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Existing description"
    )
    expect(screen.getByLabelText("Supabase URL")).toHaveValue(
      "https://example.supabase.co"
    )
    expect(screen.getByLabelText("Publishable key")).toHaveValue(
      "sb_publishable_example"
    )
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  })

  it("submits the edited fields via PATCH and navigates to the overview on success", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderEditProjectPage()
    await screen.findByRole("heading", { name: "Edit project" })

    await user.clear(screen.getByLabelText("Project name"))
    await user.type(screen.getByLabelText("Project name"), "Renamed project")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1",
        expect.objectContaining({ method: "PATCH" })
      )
    })
    const call = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH"
    )
    const body = JSON.parse(call?.[1]?.body as string)
    expect(body.name).toBe("Renamed project")

    await waitFor(() =>
      expect(screen.getByText("Project overview page")).toBeInTheDocument()
    )
  })

  it("shows an error toast when the update request fails", async () => {
    const fetchMock = mockFetch({
      updateResponse: new Response(null, { status: 500 }),
    })
    const user = userEvent.setup()
    renderEditProjectPage()
    await screen.findByRole("heading", { name: "Edit project" })

    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await vi.waitFor(() => toast.error)).toHaveBeenCalledWith(
      "Failed to update project",
      { description: "Check your connection details and try again." }
    )
  })

  it("shows an error message when the project fails to load", async () => {
    mockFetch({ overviewResponse: new Response(null, { status: 500 }) })
    renderEditProjectPage()

    expect(
      await screen.findByText("Failed to load this project.")
    ).toBeInTheDocument()
  })
})
