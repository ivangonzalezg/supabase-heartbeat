import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { RecentRunsTableSkeleton } from "./recent-runs-table-skeleton"

describe("RecentRunsTableSkeleton", () => {
  it("renders the static column headers", () => {
    render(<RecentRunsTableSkeleton />)

    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByText("Failed step")).toBeInTheDocument()
  })

  it("renders 5 skeleton rows", () => {
    render(<RecentRunsTableSkeleton />)

    expect(screen.getAllByRole("row")).toHaveLength(6) // 1 header + 5 body
  })
})
