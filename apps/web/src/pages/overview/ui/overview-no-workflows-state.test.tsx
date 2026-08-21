import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import type { Project } from "@/entities/project"
import { OverviewNoWorkflowsState } from "./overview-no-workflows-state"

function project(overrides: Partial<Project>): Project {
  return {
    id: "project-1",
    ownerId: "user-1",
    name: "Demo",
    description: null,
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_example",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function renderState(projects: Project[]) {
  const rootRoute = createRootRoute({
    component: () => <OverviewNoWorkflowsState projects={projects} />,
  })
  const createWorkflowStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/workflows/new",
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([createWorkflowStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

describe("OverviewNoWorkflowsState", () => {
  it("renders the empty state copy", async () => {
    renderState([])

    expect(await screen.findByText("NEXT STEP")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Choose a project to create its first workflow",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Workflows define what activity runs and when. Select a project to begin."
      )
    ).toBeInTheDocument()
    expect(screen.getByText("PROJECTS")).toBeInTheDocument()
  })

  it("renders one row per project with its description and a create-workflow link", async () => {
    renderState([
      project({
        id: "project-1",
        name: "Artemivo",
        description: "Production project",
      }),
      project({ id: "project-2", name: "Internal API", description: null }),
    ])

    expect(await screen.findByText("Artemivo")).toBeInTheDocument()
    expect(screen.getByText("Production project")).toBeInTheDocument()
    expect(screen.getByText("Internal API")).toBeInTheDocument()

    const links = screen.getAllByRole("link", { name: /Create workflow/ })
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute(
      "href",
      "/projects/project-1/workflows/new"
    )
    expect(links[1]).toHaveAttribute(
      "href",
      "/projects/project-2/workflows/new"
    )
  })
})
