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
import { ProjectHeader } from "./project-header"

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
  props: React.ComponentProps<typeof ProjectHeader>
) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Overview page</div>,
  })
  const overviewStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId",
    component: () => <ProjectHeader {...props} />,
  })
  const newWorkflowStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/new",
    component: () => <div>Create workflow page</div>,
  })
  const editProjectStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/edit",
    component: () => <div>Edit project page</div>,
  })
  const routeTree = rootRoute.addChildren([
    indexStub,
    overviewStub,
    newWorkflowStub,
    editProjectStub,
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/projects/project-1"] }),
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
    expect(
      screen.getByRole("link", { name: /new workflow/i })
    ).toBeInTheDocument()
  )
  return result
}

describe("ProjectHeader", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(toast.error).mockReset()
    vi.mocked(toast.success).mockReset()
  })

  it("renders the project name", async () => {
    await renderWithRouter({
      projectId: "project-1",
      projectName: "Artemivo",
      description: null,
      enabled: true,
    })

    expect(
      screen.getByRole("heading", { name: "Artemivo" })
    ).toBeInTheDocument()
  })

  it("links the Edit project button to this project's edit route", async () => {
    await renderWithRouter({
      projectId: "project-1",
      projectName: "Artemivo",
      description: null,
      enabled: true,
    })

    expect(screen.getByRole("link", { name: /edit project/i })).toHaveAttribute(
      "href",
      "/projects/project-1/edit"
    )
  })

  it("shows the description when provided", async () => {
    await renderWithRouter({
      projectId: "project-1",
      projectName: "Artemivo",
      description: "Production project.",
      enabled: true,
    })

    expect(screen.getByText("Production project.")).toBeInTheDocument()
  })

  it("shows a Disabled badge when the project is disabled", async () => {
    await renderWithRouter({
      projectId: "project-1",
      projectName: "Artemivo",
      description: null,
      enabled: false,
    })

    expect(screen.getByText("Disabled")).toBeInTheDocument()
  })

  it("labels the toggle button Enable when the project is disabled", async () => {
    await renderWithRouter({
      projectId: "project-1",
      projectName: "Artemivo",
      description: null,
      enabled: false,
    })

    expect(
      screen.getByRole("button", { name: /^enable$/i })
    ).toBeInTheDocument()
  })

  it("PATCHes enabled: false when clicking Disable on an enabled project", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        id: "project-1",
        ownerId: "user-1",
        name: "Artemivo",
        description: null,
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "sb_publishable_example",
        enabled: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    )
    const user = userEvent.setup()

    await renderWithRouter({
      projectId: "project-1",
      projectName: "Artemivo",
      description: null,
      enabled: true,
    })

    await user.click(screen.getByRole("button", { name: /^disable$/i }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: /^disable$/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/projects/project-1",
        expect.objectContaining({ method: "PATCH" })
      )
    })
    const [, requestInit] = fetchSpy.mock.calls[0]
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      enabled: false,
    })
  })

  it("shows an error toast when the toggle request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )
    const user = userEvent.setup()

    await renderWithRouter({
      projectId: "project-1",
      projectName: "Artemivo",
      description: null,
      enabled: true,
    })

    await user.click(screen.getByRole("button", { name: /^disable$/i }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: /^disable$/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to disable project", {
        description: "Please try again.",
      })
    )
  })

  describe("delete project", () => {
    it("opens a confirmation dialog with a disabled, counting-down confirm button", async () => {
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        projectName: "Artemivo",
        description: null,
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete project/i })
      )

      const dialog = screen.getByRole("alertdialog")
      expect(
        within(dialog).getByText("Delete this project?")
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(/permanently delete this project/i)
      ).toBeInTheDocument()

      const confirmButton = within(dialog).getByRole("button", {
        name: /delete project \(5\)/i,
      })
      expect(confirmButton).toBeDisabled()

      await waitFor(
        () =>
          expect(
            within(dialog).getByRole("button", { name: /^delete project$/i })
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
        projectName: "Artemivo",
        description: null,
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete project/i })
      )
      const dialog = screen.getByRole("alertdialog")

      await waitFor(
        () =>
          expect(
            within(dialog).getByRole("button", { name: /^delete project$/i })
          ).toBeEnabled(),
        { timeout: 7000 }
      )
      await user.click(
        within(dialog).getByRole("button", { name: /^delete project$/i })
      )

      await waitFor(() =>
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/projects/project-1",
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
        projectName: "Artemivo",
        description: null,
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete project/i })
      )

      await user.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Cancel",
        })
      )
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
      expect(fetchSpy).not.toHaveBeenCalledWith(
        "/api/projects/project-1",
        expect.objectContaining({ method: "DELETE" })
      )

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete project/i })
      )
      const dialog = screen.getByRole("alertdialog")
      expect(
        within(dialog).getByRole("button", { name: /delete project \(5\)/i })
      ).toBeDisabled()
    })

    it("shows an error toast and does not navigate away when the delete request fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 500 })
      )
      const user = userEvent.setup()

      await renderWithRouter({
        projectId: "project-1",
        projectName: "Artemivo",
        description: null,
        enabled: true,
      })

      await user.click(screen.getByRole("button", { name: /^more actions$/i }))
      await user.click(
        screen.getByRole("menuitem", { name: /delete project/i })
      )
      const dialog = screen.getByRole("alertdialog")

      await waitFor(
        () =>
          expect(
            within(dialog).getByRole("button", { name: /^delete project$/i })
          ).toBeEnabled(),
        { timeout: 7000 }
      )
      await user.click(
        within(dialog).getByRole("button", { name: /^delete project$/i })
      )

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Failed to delete project", {
          description: "Please try again.",
        })
      )
      expect(screen.queryByText("Overview page")).not.toBeInTheDocument()
    }, 10000)
  })
})
