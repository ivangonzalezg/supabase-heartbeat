import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { OverviewEmptyState } from "./overview-empty-state"

function renderEmptyState() {
  const rootRoute = createRootRoute({ component: () => <OverviewEmptyState /> })
  const createProjectStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/new",
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([createProjectStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

describe("OverviewEmptyState", () => {
  it("renders the empty state copy and a create-project link", async () => {
    renderEmptyState()

    expect(await screen.findByText("GET STARTED")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "No projects yet" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Create your first project before workflow activity can appear here."
      )
    ).toBeInTheDocument()

    const link = screen.getByRole("link", {
      name: "Create your first project",
    })
    expect(link).toHaveAttribute("href", "/projects/new")
  })
})
