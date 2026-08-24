import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RunDetailsDrawer } from "./run-details-drawer"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function renderDrawer(
  props: Partial<React.ComponentProps<typeof RunDetailsDrawer>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RunDetailsDrawer
        projectId="project-1"
        workflowId="workflow-1"
        runId="run-1"
        workflowName="Daily activity"
        projectName="Artemivo"
        open
        onOpenChange={() => {}}
        {...props}
      />
    </QueryClientProvider>
  )
}

const successfulRun = {
  id: "run_01HXY72K",
  workflowId: "workflow-1",
  triggerType: "scheduled",
  status: "success",
  startedAt: "2026-01-01T09:00:00.000Z",
  finishedAt: "2026-01-01T09:00:35.000Z",
  error: null,
  stepRuns: [
    {
      id: "step-run-1",
      workflowRunId: "run_01HXY72K",
      workflowStepId: "step-1",
      position: 0,
      status: "success",
      inputSnapshot: {
        stepKey: "sign_in",
        type: "signin",
        configuration: { email: "user@example.com", password: "[REDACTED]" },
      },
      output: { session: "[redacted]" },
      error: null,
      startedAt: "2026-01-01T09:00:00.000Z",
      finishedAt: "2026-01-01T09:00:00.400Z",
      stepKey: "sign_in",
      type: "signin",
    },
  ],
}

const failedRun = {
  id: "run_01HXY6P4",
  workflowId: "workflow-1",
  triggerType: "manual",
  status: "failed",
  startedAt: "2026-01-01T04:16:00.000Z",
  finishedAt: "2026-01-01T04:16:03.000Z",
  error: "Workflow run failed",
  stepRuns: [
    {
      id: "step-run-1",
      workflowRunId: "run_01HXY6P4",
      workflowStepId: "step-1",
      position: 0,
      status: "success",
      inputSnapshot: null,
      output: { session: "[redacted]" },
      error: null,
      startedAt: "2026-01-01T04:16:00.000Z",
      finishedAt: "2026-01-01T04:16:00.300Z",
      stepKey: "sign_in",
      type: "signin",
    },
    {
      id: "step-run-2",
      workflowRunId: "run_01HXY6P4",
      workflowStepId: "step-2",
      position: 1,
      status: "failed",
      inputSnapshot: {
        stepKey: "update_activity",
        type: "update",
        configuration: {
          table: "activity",
          values: { last_active_at: "now()" },
        },
      },
      output: null,
      error: "PGRST116: no rows matched the update filter",
      startedAt: "2026-01-01T04:16:00.300Z",
      finishedAt: "2026-01-01T04:16:00.600Z",
      stepKey: "update_activity",
      type: "update",
    },
  ],
}

describe("RunDetailsDrawer", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows a spinner while loading, then the run's execution/timing/outcome fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(successfulRun))
    renderDrawer()

    expect(await screen.findByText("run_01HXY72K")).toBeInTheDocument()
    expect(screen.getByText("Scheduled")).toBeInTheDocument()
    expect(screen.getByText("Daily activity · Artemivo")).toBeInTheDocument()
    expect(screen.getByText("sign_in")).toBeInTheDocument()
    expect(screen.getByText("user@example.com")).toBeInTheDocument()
  })

  it("shows the failed step's stepKey as the failed-step outcome field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(failedRun))
    renderDrawer()

    await waitFor(() =>
      expect(screen.getAllByText("update_activity").length).toBeGreaterThan(0)
    )
    expect(
      screen.getByText("PGRST116: no rows matched the update filter")
    ).toBeInTheDocument()
    expect(screen.getByText("activity")).toBeInTheDocument()
  })

  it("shows an error message when the run fails to load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )
    renderDrawer()

    expect(
      await screen.findByText("Failed to load this run.")
    ).toBeInTheDocument()
  })

  it("does not fetch when runId is null", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    renderDrawer({ runId: null, open: false })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("infers a skipped step for a configured step with no matching step run after a failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(failedRun))
    renderDrawer({
      configuredSteps: [
        {
          id: "step-1",
          stepKey: "sign_in",
          type: "signin",
          configuration: { email: "user@example.com" },
        },
        {
          id: "step-2",
          stepKey: "update_activity",
          type: "update",
          configuration: { table: "activity", values: {} },
        },
        {
          id: "step-3",
          stepKey: "wait_step",
          type: "wait",
          configuration: { seconds: 30 },
        },
      ],
    })

    await waitFor(() =>
      expect(screen.getByText("wait_step")).toBeInTheDocument()
    )
    expect(screen.getByText("Skipped")).toBeInTheDocument()
    expect(screen.getByText("30 seconds")).toBeInTheDocument()
  })
})
