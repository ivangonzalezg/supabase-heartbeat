import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { OverviewEmptyState } from "./overview-empty-state"

describe("OverviewEmptyState", () => {
  it("renders the empty state copy and a disabled create-project button", () => {
    render(<OverviewEmptyState />)

    expect(screen.getByText("GET STARTED")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "No projects yet" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Create your first project before workflow activity can appear here."
      )
    ).toBeInTheDocument()

    const button = screen.getByRole("button", {
      name: "Create your first project",
    })
    expect(button).toBeDisabled()
  })
})
