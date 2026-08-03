import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { rootRoute } from "./root-route"

const { useSessionContextMock } = vi.hoisted(() => ({
  useSessionContextMock: vi.fn(),
}))
vi.mock("@/entities/session", () => ({
  useSessionContext: useSessionContextMock,
}))

function renderAt(path: string) {
  const indexStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Overview</div>,
  })
  const signInStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    component: () => <div>Sign in</div>,
  })
  const routeTree = rootRoute.addChildren([indexStub, signInStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
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

describe("RootLayout guard", () => {
  it("redirects unauthenticated users from / to /sign-in", async () => {
    useSessionContextMock.mockReturnValue({
      status: "unauthenticated",
      isAuthenticated: false,
    })
    renderAt("/")
    expect(await screen.findByText("Sign in")).toBeInTheDocument()
  })

  it("redirects authenticated users away from /sign-in to /", async () => {
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      isAuthenticated: true,
    })
    renderAt("/sign-in")
    expect(await screen.findByText("Overview")).toBeInTheDocument()
  })

  it("shows a loading state while session is resolving", async () => {
    useSessionContextMock.mockReturnValue({
      status: "loading",
      isAuthenticated: false,
    })
    renderAt("/")
    expect(await screen.findByText("Loading...")).toBeInTheDocument()
  })

  it("renders the matched route when already authenticated on /", async () => {
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      isAuthenticated: true,
    })
    renderAt("/")
    expect(await screen.findByText("Overview")).toBeInTheDocument()
  })
})
