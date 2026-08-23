import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { RecentRunsTable } from "./recent-runs-table"
import type { WorkflowRunListItem } from "@/entities/workflow"

const runs: WorkflowRunListItem[] = [
  {
    id: "run-1",
    status: "success",
    triggerType: "scheduled",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 3800,
    failedStepKey: null,
  },
  {
    id: "run-2",
    status: "failed",
    triggerType: "manual",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 2100,
    failedStepKey: "update_activity",
  },
]

describe("RecentRunsTable", () => {
  it("renders the empty state when given no runs", () => {
    render(<RecentRunsTable runs={[]} />)

    expect(screen.getByText("No runs yet")).toBeInTheDocument()
    expect(
      screen.getByText("Run this workflow to generate the first execution.")
    ).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("renders a table row per run when populated", () => {
    render(<RecentRunsTable runs={runs} />)

    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("Success")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("update_activity")).toBeInTheDocument()
    expect(screen.getAllByText("View details")).toHaveLength(2)
  })

  it("renders an em dash for a null duration or failed step", () => {
    render(
      <RecentRunsTable
        runs={[
          {
            id: "run-3",
            status: "skipped",
            triggerType: "scheduled",
            startedAt: new Date().toISOString(),
            finishedAt: null,
            durationMs: null,
            failedStepKey: null,
          },
        ]}
      />
    )

    expect(screen.getAllByText("—")).toHaveLength(2)
  })
})
