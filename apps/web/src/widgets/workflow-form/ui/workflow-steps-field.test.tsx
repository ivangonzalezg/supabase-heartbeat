import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FormProvider, useForm } from "react-hook-form"
import type { DragEndEvent } from "@dnd-kit/react"

let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined

vi.mock("@dnd-kit/react", async () => {
  const actual =
    await vi.importActual<typeof import("@dnd-kit/react")>("@dnd-kit/react")
  return {
    ...actual,
    DragDropProvider: ({
      onDragEnd,
      children,
    }: {
      onDragEnd: (event: DragEndEvent) => void
      children: React.ReactNode
    }) => {
      capturedOnDragEnd = onDragEnd
      return children
    },
  }
})

vi.mock("@dnd-kit/react/sortable", async () => {
  const actual = await vi.importActual<
    typeof import("@dnd-kit/react/sortable")
  >("@dnd-kit/react/sortable")
  return {
    ...actual,
    isSortableOperation: () => true,
    useSortable: () => ({
      ref: () => {},
      handleRef: () => {},
      isDragging: false,
    }),
  }
})

const { WorkflowStepsField } = await import("./workflow-steps-field")

function renderField({
  initialExpanded = false,
}: { initialExpanded?: boolean } = {}) {
  function Wrapper() {
    const form = useForm({ defaultValues: { steps: [] } })
    return (
      <FormProvider {...form}>
        <WorkflowStepsField initialExpanded={initialExpanded} />
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

  it("starts with every step collapsed by default", async () => {
    function Wrapper() {
      const form = useForm({
        defaultValues: {
          steps: [
            {
              stepKey: "step_a",
              type: "wait",
              configuration: { seconds: 1 },
              enabled: true,
            },
            {
              stepKey: "step_b",
              type: "wait",
              configuration: { seconds: 2 },
              enabled: true,
            },
          ],
        },
      })
      return (
        <FormProvider {...form}>
          <WorkflowStepsField />
        </FormProvider>
      )
    }
    render(<Wrapper />)

    expect(screen.queryByLabelText("Seconds")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Step 1" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(screen.getByRole("button", { name: "Step 2" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  })

  it("starts with every step expanded when initialExpanded is true", async () => {
    function Wrapper() {
      const form = useForm({
        defaultValues: {
          steps: [
            {
              stepKey: "step_a",
              type: "wait",
              configuration: { seconds: 1 },
              enabled: true,
            },
          ],
        },
      })
      return (
        <FormProvider {...form}>
          <WorkflowStepsField initialExpanded />
        </FormProvider>
      )
    }
    render(<Wrapper />)

    expect(screen.getByLabelText("Seconds")).toBeInTheDocument()
  })

  it("adding a step collapses every other step, leaving only the new one expanded", async () => {
    const user = userEvent.setup()
    renderField({ initialExpanded: true })

    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 1, "Wait")
    await user.click(screen.getByRole("button", { name: "Add step" }))

    expect(screen.getByRole("button", { name: "Step 1" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(screen.getByRole("button", { name: "Step 2" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(screen.getByLabelText("Step 2 type")).toBeInTheDocument()
  })

  it("expands and collapses each step independently", async () => {
    const user = userEvent.setup()
    renderField({ initialExpanded: true })

    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 1, "Wait")

    const step1Trigger = screen.getByRole("button", { name: "Step 1" })
    expect(step1Trigger).toHaveAttribute("aria-expanded", "true")

    await user.click(step1Trigger)

    expect(step1Trigger).toHaveAttribute("aria-expanded", "false")
  })

  it("renders a collapsed summary for each step", async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole("button", { name: "Add step" }))
    await selectStepType(user, 1, "Wait")
    await user.type(screen.getByLabelText("Seconds"), "30")

    expect(screen.getByText("30 seconds")).toBeInTheDocument()
  })

  it("reorders steps using the sortable source's initialIndex/index, not source/target id comparison", async () => {
    function Wrapper() {
      const form = useForm({
        defaultValues: {
          steps: [
            {
              stepKey: "step_a",
              type: "wait",
              configuration: { seconds: 1 },
              enabled: true,
            },
            {
              stepKey: "step_b",
              type: "wait",
              configuration: { seconds: 2 },
              enabled: true,
            },
          ],
        },
      })
      return (
        <FormProvider {...form}>
          <WorkflowStepsField initialExpanded />
        </FormProvider>
      )
    }
    render(<Wrapper />)

    expect(
      screen
        .getAllByLabelText("Seconds")
        .map((el) => (el as HTMLInputElement).value)
    ).toEqual(["1", "2"])

    capturedOnDragEnd?.({
      canceled: false,
      operation: {
        source: { initialIndex: 1, index: 0 },
        target: null,
      },
    } as unknown as DragEndEvent)

    await waitFor(() =>
      expect(
        screen
          .getAllByLabelText("Seconds")
          .map((el) => (el as HTMLInputElement).value)
      ).toEqual(["2", "1"])
    )
  })

  it("does not reorder when the sortable source's index did not change (mirrors the same-id dragend case)", async () => {
    function Wrapper() {
      const form = useForm({
        defaultValues: {
          steps: [
            {
              stepKey: "step_a",
              type: "wait",
              configuration: { seconds: 1 },
              enabled: true,
            },
            {
              stepKey: "step_b",
              type: "wait",
              configuration: { seconds: 2 },
              enabled: true,
            },
          ],
        },
      })
      return (
        <FormProvider {...form}>
          <WorkflowStepsField initialExpanded />
        </FormProvider>
      )
    }
    render(<Wrapper />)

    capturedOnDragEnd?.({
      canceled: false,
      operation: {
        source: { initialIndex: 1, index: 1 },
        target: null,
      },
    } as unknown as DragEndEvent)

    expect(
      screen
        .getAllByLabelText("Seconds")
        .map((el) => (el as HTMLInputElement).value)
    ).toEqual(["1", "2"])
  })
})
