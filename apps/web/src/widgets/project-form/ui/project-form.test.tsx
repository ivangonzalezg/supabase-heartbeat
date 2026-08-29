import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { ProjectForm } from "./project-form"
import type { ProjectFormValues } from "../lib/project-form-schema"

const defaultValues: ProjectFormValues = {
  name: "Artemivo",
  description: "Existing description",
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "sb_publishable_example",
  enabled: true,
}

function renderProjectForm(
  props: Partial<React.ComponentProps<typeof ProjectForm>> = {}
) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined)
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const formStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ProjectForm
        title="Edit project"
        description="Update this project's details and Supabase connection."
        defaultValues={defaultValues}
        onSubmit={onSubmit}
        submitLabel="Save changes"
        cancelTo={{ to: "/cancel" }}
        {...props}
      />
    ),
  })
  const cancelStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/cancel",
    component: () => <div>Cancelled</div>,
  })
  const routeTree = rootRoute.addChildren([formStub, cancelStub])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  render(<RouterProvider router={router} />)
  return { onSubmit }
}

describe("ProjectForm", () => {
  it("prefills every field from defaultValues", async () => {
    renderProjectForm()

    expect(await screen.findByLabelText("Project name")).toHaveValue("Artemivo")
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

  it("renders the given title and description", async () => {
    renderProjectForm()

    expect(
      await screen.findByRole("heading", { name: "Edit project" })
    ).toBeInTheDocument()
    expect(
      screen.getByText("Update this project's details and Supabase connection.")
    ).toBeInTheDocument()
  })

  it("shows a validation error and does not submit when the name is cleared", async () => {
    const { onSubmit } = renderProjectForm()
    const user = userEvent.setup()

    await user.clear(await screen.findByLabelText("Project name"))
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(
      await screen.findByText("Project name is required.")
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("rejects URLs that do not use HTTP or HTTPS", async () => {
    const { onSubmit } = renderProjectForm()
    const user = userEvent.setup()

    const urlInput = await screen.findByLabelText("Supabase URL")
    await user.clear(urlInput)
    await user.type(urlInput, "ftp://example.supabase.co")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(
      await screen.findByText("Enter a valid http or https URL.")
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("calls onSubmit with the current form values", async () => {
    const { onSubmit } = renderProjectForm()
    const user = userEvent.setup()

    const nameInput = await screen.findByLabelText("Project name")
    await user.clear(nameInput)
    await user.type(nameInput, "Renamed")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ...defaultValues, name: "Renamed" }),
      expect.anything()
    )
  })

  it("links Cancel to the given cancelTo target", async () => {
    renderProjectForm()
    const user = userEvent.setup()

    await user.click(await screen.findByRole("link", { name: "Cancel" }))

    expect(await screen.findByText("Cancelled")).toBeInTheDocument()
  })
})
