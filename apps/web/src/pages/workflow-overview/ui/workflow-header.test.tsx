import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
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
import { WorkflowHeader } from "./workflow-header"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function renderWithRouter(
  props: React.ComponentProps<typeof WorkflowHeader>
) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Overview page</div>,
  })
  const overviewStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/$workflowId",
    component: () => <WorkflowHeader {...props} />,
  })
  const editStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/$workflowId/edit",
    component: () => <div>Edit workflow page</div>,
  })
  const routeTree = rootRoute.addChildren([indexStub, overviewStub, editStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/projects/project-1/workflows/workflow-1"],
    }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument()
  )
  return result
}

describe("WorkflowHeader", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(toast.error).mockReset()
    vi.mocked(toast.success).mockReset()
  })

  it("renders the workflow name", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
    })

    expect(
      screen.getByRole("heading", { name: "Daily activity" })
    ).toBeInTheDocument()
  })

  it("shows an Enabled badge when the workflow is enabled", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
    })

    expect(screen.getByText("Enabled")).toBeInTheDocument()
  })

  it("shows a Disabled badge when the workflow is disabled", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: false,
    })

    expect(screen.getByText("Disabled")).toBeInTheDocument()
  })

  it("renders the Run now, Edit, and Disable action buttons", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
    })

    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^edit$/i })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^disable$/i })
    ).toBeInTheDocument()
  })

  it("labels the toggle button Enable when the workflow is disabled", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: false,
    })

    expect(
      screen.getByRole("button", { name: /^enable$/i })
    ).toBeInTheDocument()
  })

  it("links the Edit button to this workflow's edit route", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
    })

    expect(screen.getByRole("link", { name: /^edit$/i })).toHaveAttribute(
      "href",
      "/projects/project-1/workflows/workflow-1/edit"
    )
  })

  it("disables the more-actions trigger while isFetching is true", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
      isFetching: true,
    })

    expect(screen.getByRole("button", { name: "More actions" })).toBeDisabled()
  })

  it("does not disable the more-actions trigger when isFetching is false", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
      isFetching: false,
    })

    expect(screen.getByRole("button", { name: "More actions" })).toBeEnabled()
  })

  it("shows a name/status skeleton, but still renders the action buttons, when data is not yet available", async () => {
    const { container } = await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: undefined,
      enabled: undefined,
    })

    expect(screen.queryByRole("heading")).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^edit$/i })).toBeInTheDocument()
  })

  it("PATCHes enabled: false when clicking Disable on an enabled workflow", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        id: "workflow-1",
        projectId: "project-1",
        name: "Daily activity",
        description: null,
        cronExpression: "0 9 * * *",
        timezone: "UTC",
        enabled: false,
        overlapPolicy: "skip",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    )
    const user = userEvent.setup()

    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
    })

    await user.click(screen.getByRole("button", { name: /^disable$/i }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: /^disable$/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/projects/project-1/workflows/workflow-1",
        expect.objectContaining({ method: "PATCH" })
      )
    })
    const [, requestInit] = fetchSpy.mock.calls[0]
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      enabled: false,
    })
  })

  it("PATCHes enabled: true when clicking Enable on a disabled workflow", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
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
      })
    )
    const user = userEvent.setup()

    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: false,
    })

    await user.click(screen.getByRole("button", { name: /^enable$/i }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: /^enable$/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/projects/project-1/workflows/workflow-1",
        expect.objectContaining({ method: "PATCH" })
      )
    })
    const [, requestInit] = fetchSpy.mock.calls[0]
    expect(JSON.parse(requestInit?.body as string)).toEqual({ enabled: true })
  })

  it("shows a confirmation dialog before disabling, and cancel does not send a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const user = userEvent.setup()

    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
    })

    await user.click(screen.getByRole("button", { name: /^disable$/i }))
    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByText("Disable this workflow?")
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "/api/projects/project-1/workflows/workflow-1",
      expect.objectContaining({ method: "PATCH" })
    )
  })

  it("shows an error toast when the toggle request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )
    const user = userEvent.setup()

    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
    })

    await user.click(screen.getByRole("button", { name: /^disable$/i }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: /^disable$/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to disable workflow", {
        description: "Please try again.",
      })
    )
  })

  describe("run now", () => {
    it("POSTs /api/projects/:projectId/workflows/:workflowId/runs when clicked", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          {
            id: "run-1",
            workflowId: "workflow-1",
            triggerType: "manual",
            status: "success",
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:00:01.000Z",
            error: null,
            stepRuns: [],
          },
          201
        )
      )
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /run now/i }))

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/projects/project-1/workflows/workflow-1/runs",
          expect.objectContaining({ method: "POST" })
        )
      })
    })

    it("shows a success toast when the run completes successfully", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          {
            id: "run-1",
            workflowId: "workflow-1",
            triggerType: "manual",
            status: "success",
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:00:01.000Z",
            error: null,
            stepRuns: [],
          },
          201
        )
      )
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /run now/i }))

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("Workflow run completed")
      )
    })

    it("shows an error toast using the run's error when the run fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          {
            id: "run-1",
            workflowId: "workflow-1",
            triggerType: "manual",
            status: "failed",
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:00:01.000Z",
            error: "Step 'signin' failed",
            stepRuns: [],
          },
          201
        )
      )
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /run now/i }))

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Workflow run failed", {
          description: "Step 'signin' failed",
        })
      )
    })

    it("shows a generic error toast when the request itself fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 500 })
      )
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /run now/i }))

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Failed to start workflow run",
          {
            description: "Please try again.",
          }
        )
      )
    })

    it("shows a spinner and disables the button while the run is pending", async () => {
      let resolveFetch: (value: Response) => void = () => {}
      vi.spyOn(globalThis, "fetch").mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
      )
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      const runButton = screen.getByRole("button", { name: /run now/i })
      await user.click(runButton)

      await waitFor(() => expect(runButton).toBeDisabled())

      resolveFetch(
        jsonResponse(
          {
            id: "run-1",
            workflowId: "workflow-1",
            triggerType: "manual",
            status: "success",
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:00:01.000Z",
            error: null,
            stepRuns: [],
          },
          201
        )
      )

      await waitFor(() => expect(runButton).toBeEnabled())
    })
  })

  describe("delete workflow", () => {
    it("opens a confirmation dialog with a disabled, counting-down confirm button", async () => {
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete workflow/i })
      )

      const dialog = screen.getByRole("alertdialog")
      expect(
        within(dialog).getByText("Delete this workflow?")
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(/permanently delete this workflow/i)
      ).toBeInTheDocument()

      const confirmButton = within(dialog).getByRole("button", {
        name: /delete workflow \(5\)/i,
      })
      expect(confirmButton).toBeDisabled()

      await waitFor(
        () =>
          expect(
            within(dialog).getByRole("button", {
              name: /^delete workflow$/i,
            })
          ).toBeEnabled(),
        { timeout: 7000 }
      )
    }, 10000)

    it("sends DELETE and navigates to / once the countdown finishes and confirm is clicked", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }))
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete workflow/i })
      )
      const dialog = screen.getByRole("alertdialog")

      await waitFor(
        () =>
          expect(
            within(dialog).getByRole("button", {
              name: /^delete workflow$/i,
            })
          ).toBeEnabled(),
        { timeout: 7000 }
      )
      await user.click(
        within(dialog).getByRole("button", { name: /^delete workflow$/i })
      )

      await waitFor(() =>
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/projects/project-1/workflows/workflow-1",
          expect.objectContaining({ method: "DELETE" })
        )
      )
      await waitFor(() =>
        expect(screen.getByText("Overview page")).toBeInTheDocument()
      )
    }, 10000)

    it("cancels without sending a request, and resets the countdown when reopened", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete workflow/i })
      )

      await user.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Cancel",
        })
      )
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
      expect(fetchSpy).not.toHaveBeenCalledWith(
        "/api/projects/project-1/workflows/workflow-1",
        expect.objectContaining({ method: "DELETE" })
      )

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete workflow/i })
      )
      const dialog = screen.getByRole("alertdialog")
      expect(
        within(dialog).getByRole("button", { name: /delete workflow \(5\)/i })
      ).toBeDisabled()
    })

    it("shows an error toast and does not navigate away when the delete request fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 500 })
      )
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        workflowId: "workflow-1",
        workflowName: "Daily activity",
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete workflow/i })
      )
      const dialog = screen.getByRole("alertdialog")

      await waitFor(
        () =>
          expect(
            within(dialog).getByRole("button", {
              name: /^delete workflow$/i,
            })
          ).toBeEnabled(),
        { timeout: 7000 }
      )
      await user.click(
        within(dialog).getByRole("button", { name: /^delete workflow$/i })
      )

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Failed to delete workflow", {
          description: "Please try again.",
        })
      )
      // The dialog stays open on failure (Radix hides the rest of the
      // page from the accessibility tree while it's open), and no
      // navigation to the index route happened.
      expect(screen.queryByText("Overview page")).not.toBeInTheDocument()
    }, 10000)
  })
})
