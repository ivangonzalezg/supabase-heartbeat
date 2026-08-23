import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { OperationalSummaryCard } from "./operational-summary-card"
import type { WorkflowRunSummaryMetrics } from "@/entities/workflow"

const summary: WorkflowRunSummaryMetrics = {
  totalRuns: 12,
  successRate: 83.3,
  failedRuns: 1,
  avgDurationMs: 3600,
  lastRun: new Date("2026-01-15T09:00:00.000Z").toISOString(),
  nextRun: new Date("2026-01-15T10:00:00.000Z").toISOString(),
}

describe("OperationalSummaryCard", () => {
  it("renders each metric's label and formatted value", () => {
    render(<OperationalSummaryCard summary={summary} />)

    expect(screen.getByText("Total runs")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("Success rate")).toBeInTheDocument()
    expect(screen.getByText("83.3%")).toBeInTheDocument()
    expect(screen.getByText("Failed runs")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("Avg duration")).toBeInTheDocument()
    expect(screen.getByText("3.6s")).toBeInTheDocument()
  })

  it("renders an em dash for each nullable field when null", () => {
    render(
      <OperationalSummaryCard
        summary={{
          totalRuns: 0,
          successRate: null,
          failedRuns: 0,
          avgDurationMs: null,
          lastRun: null,
          nextRun: null,
        }}
      />
    )

    expect(screen.getAllByText("—")).toHaveLength(4)
  })
})
