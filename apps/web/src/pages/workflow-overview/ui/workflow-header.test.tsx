import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { WorkflowHeader } from "./workflow-header"

describe("WorkflowHeader", () => {
  it("renders the workflow name", () => {
    render(<WorkflowHeader workflowName="Daily activity" enabled={true} />)

    expect(
      screen.getByRole("heading", { name: "Daily activity" })
    ).toBeInTheDocument()
  })

  it("shows an Enabled badge when the workflow is enabled", () => {
    render(<WorkflowHeader workflowName="Daily activity" enabled={true} />)

    expect(screen.getByText("Enabled")).toBeInTheDocument()
  })

  it("shows a Disabled badge when the workflow is disabled", () => {
    render(<WorkflowHeader workflowName="Daily activity" enabled={false} />)

    expect(screen.getByText("Disabled")).toBeInTheDocument()
  })

  it("renders the Run now, Edit, and Disable action buttons", () => {
    render(<WorkflowHeader workflowName="Daily activity" enabled={true} />)

    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^disable$/i })
    ).toBeInTheDocument()
  })

  it("labels the toggle button Enable when the workflow is disabled", () => {
    render(<WorkflowHeader workflowName="Daily activity" enabled={false} />)

    expect(
      screen.getByRole("button", { name: /^enable$/i })
    ).toBeInTheDocument()
  })

  it("disables the more-actions trigger while isFetching is true", () => {
    render(
      <WorkflowHeader
        workflowName="Daily activity"
        enabled={true}
        isFetching={true}
      />
    )

    expect(screen.getByRole("button", { name: "" })).toBeDisabled()
  })

  it("does not disable the more-actions trigger when isFetching is false", () => {
    render(
      <WorkflowHeader
        workflowName="Daily activity"
        enabled={true}
        isFetching={false}
      />
    )

    expect(screen.getByRole("button", { name: "" })).toBeEnabled()
  })

  it("shows a name/status skeleton, but still renders the action buttons, when data is not yet available", () => {
    const { container } = render(
      <WorkflowHeader workflowName={undefined} enabled={undefined} />
    )

    expect(screen.queryByRole("heading")).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument()
  })
})
