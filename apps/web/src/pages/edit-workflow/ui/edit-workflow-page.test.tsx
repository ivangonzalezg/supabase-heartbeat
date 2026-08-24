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
import { EditWorkflowPage } from "./edit-workflow-page"

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

const workflowOverview = {
  id: "workflow-1",
  projectId: "project-1",
  name: "Daily activity",
  description: "Existing description",
  cronExpression: "0 9 * * *",
  timezone: "America/Bogota",
  enabled: true,
  overlapPolicy: "skip",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
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
    totalRuns: 0,
    successRate: null,
    failedRuns: 0,
    avgDurationMs: null,
    lastRun: null,
    nextRun: null,
  },
  recentRuns: [],
}

function mockFetch({
  overviewResponse = jsonResponse(workflowOverview),
  replaceResponse = jsonResponse(workflowOverview),
}: {
  overviewResponse?: Response
  replaceResponse?: Response
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    void input
    if (init?.method === "PUT") {
      return Promise.resolve(replaceResponse.clone())
    }
    return Promise.resolve(overviewResponse.clone())
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderEditWorkflowPage() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const editStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/$workflowId/edit",
    component: () => <EditWorkflowPage />,
  })
  const overviewStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/$workflowId",
    component: () => <div>Workflow overview page</div>,
  })
  const routeTree = rootRoute.addChildren([editStub, overviewStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/projects/project-1/workflows/workflow-1/edit"],
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

describe("EditWorkflowPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(toast.error).mockReset()
  })

  it("prefills the form with the workflow's current values", async () => {
    mockFetch()
    renderEditWorkflowPage()

    expect(
      await screen.findByRole("heading", { name: "Edit workflow" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Workflow name")).toHaveValue("Daily activity")
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Existing description"
    )
    expect(screen.getByLabelText("Cron expression")).toHaveValue("0 9 * * *")
    // Steps prefilled from the workflow's current data start collapsed
    // by default — expand it to confirm its type was correctly loaded.
    expect(screen.getByRole("button", { name: "Step 1" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Step 1" }))
    expect(
      screen.getByRole("combobox", { name: "Step 1 type" })
    ).toHaveTextContent("Wait")
  })

  it("submits the full form state via PUT and navigates to the overview on success", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderEditWorkflowPage()
    await screen.findByRole("heading", { name: "Edit workflow" })

    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/workflows/workflow-1",
        expect.objectContaining({ method: "PUT" })
      )
    })
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/projects/project-1/workflows/workflow-1"
    )
    const body = JSON.parse(call?.[1]?.body as string)
    expect(body.steps[0].id).toBe("step-1")

    await waitFor(() =>
      expect(screen.getByText("Workflow overview page")).toBeInTheDocument()
    )
  })

  it("shows an error toast when the update request fails", async () => {
    const fetchMock = mockFetch({
      replaceResponse: new Response(null, { status: 500 }),
    })
    const user = userEvent.setup()
    renderEditWorkflowPage()
    await screen.findByRole("heading", { name: "Edit workflow" })

    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await vi.waitFor(() => toast.error)).toHaveBeenCalledWith(
      "Failed to update workflow",
      { description: "Check your workflow details and try again." }
    )
  })

  it("shows an error message when the workflow fails to load", async () => {
    mockFetch({ overviewResponse: new Response(null, { status: 500 }) })
    renderEditWorkflowPage()

    expect(
      await screen.findByText("Failed to load this workflow.")
    ).toBeInTheDocument()
  })
})
