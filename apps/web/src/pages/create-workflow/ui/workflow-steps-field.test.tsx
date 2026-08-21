import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FormProvider, useForm } from "react-hook-form"
import { WorkflowStepsField } from "./workflow-steps-field"

function renderField() {
  function Wrapper() {
    const form = useForm({ defaultValues: { steps: [] } })
    return (
      <FormProvider {...form}>
        <WorkflowStepsField />
      </FormProvider>
    )
  }
  return render(<Wrapper />)
}

async function selectStepType(
  user: ReturnType<typeof userEvent.setup>,
  stepNumber: number,
  typeLabel: string
) {
  await user.click(
    screen.getByRole("combobox", { name: `Step ${stepNumber} type` })
  )
  await user.click(screen.getByRole("option", { name: typeLabel }))
}

describe("WorkflowStepsField", () => {
  it("adds a step with no type selected and expands it", async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole("button", { name: "Add step" }))

    expect(
      screen.getByRole("combobox", { name: "Step 1 type" })
    ).toBeInTheDocument()
    expect(screen.getByText("step_1")).toBeInTheDocument()
    expect(screen.queryByLabelText("Seconds")).not.toBeInTheDocument()
  })

  it("shows the matching config fields once a type is selected", async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 1, "Wait")

    expect(screen.getByLabelText("Seconds")).toBeInTheDocument()
  })

  it("switching a step's type fully replaces its configuration fields", async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 1, "Wait")
    expect(screen.getByLabelText("Seconds")).toBeInTheDocument()

    await selectStepType(user, 1, "Sign in")

    expect(screen.queryByLabelText("Seconds")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
  })

  it("removes exactly the targeted step", async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 1, "Wait")
    await user.click(screen.getByRole("button", { name: "Remove step 1" }))

    expect(screen.queryByLabelText("Seconds")).not.toBeInTheDocument()
  })

  it("expands and collapses each step independently", async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 1, "Wait")
    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 2, "Wait")

    expect(screen.getAllByLabelText("Seconds")).toHaveLength(2)

    const step1Trigger = screen.getByRole("button", { name: "Step 1" })
    expect(step1Trigger).toHaveAttribute("aria-expanded", "true")

    await user.click(step1Trigger)

    expect(step1Trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("button", { name: "Step 2" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })

  it("renders a collapsed summary for each step", async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 1, "Wait")
    await user.type(screen.getByLabelText("Seconds"), "30")

    expect(screen.getByText("30 seconds")).toBeInTheDocument()
  })
})
