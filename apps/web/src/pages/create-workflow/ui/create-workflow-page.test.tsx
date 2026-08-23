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
import { CreateWorkflowPage } from "./create-workflow-page"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function mockFetch({
  workspaceSummary = jsonResponse({ projects: [project], workflows: [] }),
  createWorkflow = jsonResponse({ id: "workflow-1" }, 201),
}: {
  workspaceSummary?: Response
  createWorkflow?: Response
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    void init
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("/api/workspace-summary")) {
      return Promise.resolve(workspaceSummary.clone())
    }
    return Promise.resolve(createWorkflow.clone())
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function renderCreateWorkflowPage() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Overview page</div>,
  })
  const createWorkflowStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/new",
    component: () => <CreateWorkflowPage />,
  })
  const workflowOverviewStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/$workflowId",
    component: () => <div>Workflow overview page</div>,
  })
  const routeTree = rootRoute.addChildren([
    indexStub,
    createWorkflowStub,
    workflowOverviewStub,
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/projects/project-1/workflows/new"],
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

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Workflow name"),
    "Daily content activity"
  )
  await user.type(screen.getByLabelText("Cron expression"), "0 9 * * *")
}

describe("CreateWorkflowPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(toast.error).mockReset()
  })

  it("renders the header", async () => {
    mockFetch()
    renderCreateWorkflowPage()

    expect(
      await screen.findByRole("heading", { name: "Create workflow" })
    ).toBeInTheDocument()
  })

  it("renders the details, schedule, and status cards", async () => {
    mockFetch()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    expect(screen.getByText("WORKFLOW DETAILS")).toBeInTheDocument()
    expect(screen.getByLabelText("Workflow name")).toBeInTheDocument()
    expect(screen.getByLabelText("Description")).toBeInTheDocument()

    expect(screen.getByText("SCHEDULE")).toBeInTheDocument()
    expect(screen.getByLabelText("Cron expression")).toBeInTheDocument()
    expect(screen.getByLabelText("Timezone")).toBeInTheDocument()
    const overlapPolicy = screen.getByRole("combobox", {
      name: "Overlap policy",
    })
    expect(overlapPolicy).toBeDisabled()
    expect(overlapPolicy).toHaveTextContent("Skip if running")

    expect(screen.getByText("STATUS")).toBeInTheDocument()
    const toggle = screen.getByLabelText("Enable workflow")
    expect(toggle).toHaveAttribute("aria-checked", "true")

    expect(screen.getByText("WORKFLOW STEPS")).toBeInTheDocument()
  })

  it("shows validation errors for empty required fields", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    await user.click(screen.getByRole("button", { name: "Create workflow" }))

    expect(
      await screen.findByText("Workflow name is required.")
    ).toBeInTheDocument()
    expect(screen.getByText("Cron expression is required.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/workflows"),
      expect.objectContaining({ method: "POST" })
    )
  })

  it("starts with one blank step already present", async () => {
    mockFetch()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    expect(
      screen.getByRole("combobox", { name: "Step 1 type" })
    ).toBeInTheDocument()
  })

  it("shows a validation error when a step has no type selected", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    await fillValidForm(user)
    await user.click(screen.getByRole("button", { name: "Create workflow" }))

    expect(await screen.findByText("Select a step type.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/workflows"),
      expect.objectContaining({ method: "POST" })
    )
  })

  it("does not show validation errors on a step's fresh empty fields after switching its type", async () => {
    mockFetch()
    const user = userEvent.setup()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    await user.click(screen.getByRole("combobox", { name: "Step 1 type" }))
    await user.click(screen.getByRole("option", { name: "Insert" }))

    await user.click(screen.getByRole("combobox", { name: "Step 1 type" }))
    await user.click(screen.getByRole("option", { name: "Read" }))

    expect(screen.getByLabelText("Table")).toHaveAttribute(
      "aria-invalid",
      "false"
    )
  })

  it("defaults the timezone field to the browser's resolved timezone", async () => {
    mockFetch()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    expect(
      screen.getByRole("combobox", { name: "Timezone" })
    ).toHaveTextContent(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it("submits the form with a step and navigates to the overview on success", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    await fillValidForm(user)
    await user.click(screen.getByRole("combobox", { name: "Step 1 type" }))
    await user.click(screen.getByRole("option", { name: "Wait" }))
    await user.clear(screen.getByLabelText("Seconds"))
    await user.type(screen.getByLabelText("Seconds"), "45")
    await user.click(screen.getByRole("button", { name: "Create workflow" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/workflows",
        expect.objectContaining({ method: "POST" })
      )
    })
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/projects/project-1/workflows"
    )
    const body = JSON.parse(call?.[1]?.body as string)
    expect(body.steps).toHaveLength(1)
    expect(body.steps[0].type).toBe("wait")
    expect(body.steps[0].configuration.seconds).toBe(45)

    await waitFor(() =>
      expect(screen.getByText("Workflow overview page")).toBeInTheDocument()
    )
  })

  it("sends a numeric filter value as a number, not a string", async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    await fillValidForm(user)
    await user.click(screen.getByRole("combobox", { name: "Step 1 type" }))
    await user.click(screen.getByRole("option", { name: "Update" }))
    await user.type(screen.getByLabelText("Table"), "activity")
    await user.click(screen.getByRole("button", { name: "Add value" }))
    await user.type(screen.getByLabelText("Key 1"), "last_active_at")
    await user.type(screen.getByLabelText("Value 1"), "now()")
    await user.type(screen.getByLabelText("Filter column"), "id")
    await user.type(screen.getByLabelText("Filter value"), "42")
    await user.click(screen.getByRole("button", { name: "Create workflow" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/workflows",
        expect.objectContaining({ method: "POST" })
      )
    })
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/projects/project-1/workflows"
    )
    const body = JSON.parse(call?.[1]?.body as string)
    expect(body.steps[0].configuration.filter.value).toBe(42)
  })

  it("shows an error toast when the request fails", async () => {
    const fetchMock = mockFetch({
      createWorkflow: new Response(null, { status: 500 }),
    })
    const user = userEvent.setup()
    renderCreateWorkflowPage()
    await screen.findByRole("heading", { name: "Create workflow" })

    await fillValidForm(user)
    await user.click(screen.getByRole("combobox", { name: "Step 1 type" }))
    await user.click(screen.getByRole("option", { name: "Wait" }))
    await user.clear(screen.getByLabelText("Seconds"))
    await user.type(screen.getByLabelText("Seconds"), "45")
    await user.click(screen.getByRole("button", { name: "Create workflow" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await vi.waitFor(() => toast.error)).toHaveBeenCalledWith(
      "Failed to create workflow",
      { description: "Check your workflow details and try again." }
    )
  })
})
