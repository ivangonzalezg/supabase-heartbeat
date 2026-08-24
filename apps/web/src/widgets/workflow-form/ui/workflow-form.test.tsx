import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { WorkflowForm } from "./workflow-form"

function renderForm() {
  const rootRoute = createRootRoute({
    component: () => (
      <WorkflowForm
        title="Edit workflow"
        description="D"
        defaultValues={{
          name: "Name",
          description: "",
          cronExpression: "0 9 * * *",
          timezone: "UTC",
          enabled: true,
          overlapPolicy: "skip",
          steps: [
            {
              id: "step-a-id",
              stepKey: "step_a",
              type: "wait",
              configuration: { seconds: 1 },
              enabled: true,
            } as never,
            {
              id: "step-b-id",
              stepKey: "step_b",
              type: "wait",
              configuration: { seconds: "" as unknown as number },
              enabled: true,
            } as never,
          ],
        }}
        onSubmit={async () => {}}
        submitLabel="Save changes"
        cancelTo={{ to: "/" }}
      />
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

describe("WorkflowForm", () => {
  it("auto-expands a collapsed step that fails validation on submit, and shows a page-level error", async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByRole("heading", { name: "Edit workflow" })

    // Edit-workflow forms (no `initialStepsExpanded`) start with every
    // step collapsed — the invalid step 2 is closed by default here.
    expect(screen.queryByLabelText("Seconds")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByLabelText("Seconds")).toBeInTheDocument()
    expect(
      screen.getByText("Fix the highlighted fields before saving.")
    ).toBeInTheDocument()
  })
})
