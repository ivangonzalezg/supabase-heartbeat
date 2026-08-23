import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConfiguredStepsPanel } from "./configured-steps-panel"
import type { WorkflowStepDetail } from "@/entities/workflow"

const steps: WorkflowStepDetail[] = [
  {
    id: "step-1",
    workflowId: "workflow-1",
    stepKey: "sign_in",
    type: "signin",
    position: 0,
    configuration: { email: "bot@example.com" },
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "step-2",
    workflowId: "workflow-1",
    stepKey: "wait_step",
    type: "wait",
    position: 1,
    configuration: { seconds: 30 },
    enabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

describe("ConfiguredStepsPanel", () => {
  it("renders the eyebrow with the step count", () => {
    render(<ConfiguredStepsPanel steps={steps} />)

    expect(screen.getByText("CONFIGURED STEPS · 2")).toBeInTheDocument()
  })

  it("renders each step's number, type, and enabled badge", () => {
    render(<ConfiguredStepsPanel steps={steps} />)

    expect(screen.getByText("01")).toBeInTheDocument()
    expect(screen.getByText("signin")).toBeInTheDocument()
    expect(screen.getByText("02")).toBeInTheDocument()
    expect(screen.getByText("wait")).toBeInTheDocument()
    expect(screen.getByText("Enabled")).toBeInTheDocument()
    expect(screen.getByText("Disabled")).toBeInTheDocument()
  })

  it("renders each step's summary fields with a label and a value", () => {
    render(<ConfiguredStepsPanel steps={steps} />)

    expect(screen.getByText("Email")).toBeInTheDocument()
    expect(screen.getByText("bot@example.com")).toBeInTheDocument()
    expect(screen.getByText("Duration")).toBeInTheDocument()
    expect(screen.getByText("30 seconds")).toBeInTheDocument()
  })

  it("renders each key/value pair on its own line for multi-value fields", () => {
    const insertStep: WorkflowStepDetail = {
      id: "step-3",
      workflowId: "workflow-1",
      stepKey: "insert_step",
      type: "insert",
      position: 2,
      configuration: {
        table: "waitlist",
        values: { name: "Ivan", email: "ivan@example.com" },
      },
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }

    render(<ConfiguredStepsPanel steps={[insertStep]} />)

    expect(screen.getByText("name = Ivan")).toBeInTheDocument()
    expect(screen.getByText("email = ivan@example.com")).toBeInTheDocument()
  })
})
