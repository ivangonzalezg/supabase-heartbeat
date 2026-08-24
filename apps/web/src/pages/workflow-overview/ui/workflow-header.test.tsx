import { describe, expect, it } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { WorkflowHeader } from "./workflow-header"

async function renderWithRouter(
  props: React.ComponentProps<typeof WorkflowHeader>
) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
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
  const routeTree = rootRoute.addChildren([overviewStub, editStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/projects/project-1/workflows/workflow-1"],
    }),
  })

  const result = render(<RouterProvider router={router} />)
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument()
  )
  return result
}

describe("WorkflowHeader", () => {
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

    expect(screen.getByRole("button", { name: "" })).toBeDisabled()
  })

  it("does not disable the more-actions trigger when isFetching is false", async () => {
    await renderWithRouter({
      projectId: "project-1",
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      enabled: true,
      isFetching: false,
    })

    expect(screen.getByRole("button", { name: "" })).toBeEnabled()
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
})
