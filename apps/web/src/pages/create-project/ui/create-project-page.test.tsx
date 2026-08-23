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
import { CreateProjectPage } from "./create-project-page"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}))

function mockFetch(response: Response) {
  const fetchMock = vi.fn(() => Promise.resolve(response))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function jsonResponse(body: unknown, status = 201) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function renderCreateProjectPage() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Overview page</div>,
  })
  const createProjectStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/new",
    component: () => <CreateProjectPage />,
  })
  const routeTree = rootRoute.addChildren([indexStub, createProjectStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/projects/new"] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { router }
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Project name"), "Artemivo")
  await user.type(
    screen.getByLabelText("Supabase URL"),
    "https://example.supabase.co"
  )
  await user.type(
    screen.getByLabelText("Publishable key"),
    "sb_publishable_example"
  )
}

describe("CreateProjectPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(toast.error).mockReset()
  })

  it("renders the page header", async () => {
    mockFetch(jsonResponse({}))
    renderCreateProjectPage()

    expect(
      await screen.findByRole("heading", { name: "Create project" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Connect a Supabase project before creating workflows and scheduling activity."
      )
    ).toBeInTheDocument()
  })

  it("renders the project details, connection, and status fields", async () => {
    mockFetch(jsonResponse({}))
    renderCreateProjectPage()
    await screen.findByRole("heading", { name: "Create project" })

    expect(screen.getByText("PROJECT DETAILS")).toBeInTheDocument()
    expect(screen.getByLabelText("Project name")).toBeInTheDocument()
    expect(screen.getByLabelText("Description")).toBeInTheDocument()

    expect(screen.getByText("SUPABASE CONNECTION")).toBeInTheDocument()
    expect(screen.getByLabelText("Supabase URL")).toBeInTheDocument()
    expect(screen.getByLabelText("Publishable key")).toBeInTheDocument()

    expect(screen.getByText("STATUS")).toBeInTheDocument()
    const toggle = screen.getByRole("switch")
    expect(toggle).toHaveAttribute("aria-checked", "true")
  })

  it("toggles the status switch when clicking its label or description", async () => {
    mockFetch(jsonResponse({}))
    const user = userEvent.setup()
    renderCreateProjectPage()
    await screen.findByRole("heading", { name: "Create project" })

    const toggle = screen.getByRole("switch")
    expect(toggle).toHaveAttribute("aria-checked", "true")

    await user.click(
      screen.getByText(
        "Enabled projects can contain active workflows and scheduled executions."
      )
    )
    expect(toggle).toHaveAttribute("aria-checked", "false")

    await user.click(screen.getByText("Enable project"))
    expect(toggle).toHaveAttribute("aria-checked", "true")
  })

  it("shows validation errors and does not submit when required fields are empty", async () => {
    const fetchMock = mockFetch(jsonResponse({}))
    const user = userEvent.setup()
    renderCreateProjectPage()
    await screen.findByRole("heading", { name: "Create project" })

    await user.click(screen.getByRole("button", { name: "Create project" }))

    expect(
      await screen.findByText("Project name is required.")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Enter a valid http or https URL.")
    ).toBeInTheDocument()
    expect(screen.getByText("Publishable key is required.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("submits the form and navigates to the overview on success", async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        id: "project-1",
        ownerId: "user-1",
        name: "Artemivo",
        description: null,
        supabaseUrl: "https://example.supabase.co",
        publishableKey: "sb_publishable_example",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    )
    const user = userEvent.setup()
    renderCreateProjectPage()
    await screen.findByRole("heading", { name: "Create project" })

    await fillValidForm(user)
    await user.click(screen.getByRole("button", { name: "Create project" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects",
        expect.objectContaining({ method: "POST" })
      )
    })
    await waitFor(() => {
      expect(screen.getByText("Overview page")).toBeInTheDocument()
    })
  })

  it("shows an error toast when the request fails", async () => {
    mockFetch(new Response(null, { status: 500 }))
    const user = userEvent.setup()
    renderCreateProjectPage()
    await screen.findByRole("heading", { name: "Create project" })

    await fillValidForm(user)
    await user.click(screen.getByRole("button", { name: "Create project" }))

    expect(await vi.waitFor(() => toast.error)).toHaveBeenCalledWith(
      "Failed to create project",
      { description: "Check your connection details and try again." }
    )
  })
})
