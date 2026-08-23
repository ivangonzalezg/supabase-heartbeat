import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { OperationalSummarySkeleton } from "./operational-summary-skeleton"

describe("OperationalSummarySkeleton", () => {
  it("renders the static eyebrow immediately", () => {
    render(<OperationalSummarySkeleton />)

    expect(screen.getByText("OPERATIONAL SUMMARY")).toBeInTheDocument()
  })

  it("renders 6 metric tile placeholders", () => {
    const { container } = render(<OperationalSummarySkeleton />)

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      12
    )
  })
})
