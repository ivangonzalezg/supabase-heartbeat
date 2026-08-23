import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useWorkflowOverview } from "./use-workflow-overview"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

const overview = {
  id: "workflow-1",
  projectId: "project-1",
  name: "Daily activity",
  description: null,
  cronExpression: "0 9 * * *",
  timezone: "America/Bogota",
  enabled: true,
  overlapPolicy: "skip",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  steps: [
    {
      id: "step-1",
      workflowId: "workflow-1",
      stepKey: "wait_step",
      type: "wait",
      position: 0,
      configuration: { seconds: 30 },
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  metrics: {
    totalRuns: 12,
    successRate: 83.3,
    failedRuns: 1,
    avgDurationMs: 3600,
    lastRun: "2026-01-01T09:00:00.000Z",
    nextRun: "2026-01-02T09:00:00.000Z",
  },
  recentRuns: [
    {
      id: "run-1",
      status: "success",
      triggerType: "manual",
      startedAt: "2026-01-01T09:00:00.000Z",
      finishedAt: "2026-01-01T09:00:03.800Z",
      durationMs: 3800,
      failedStepKey: null,
    },
  ],
}

describe("useWorkflowOverview", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("does not fetch when enabled is false", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    renderHook(() => useWorkflowOverview("project-1", "workflow-1", false), {
      wrapper: createWrapper(),
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("fetches the workflow overview and returns parsed data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(overview), { status: 200 })
    )

    const { result } = renderHook(
      () => useWorkflowOverview("project-1", "workflow-1", true),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/projects/project-1/workflows/workflow-1/overview"
    )
    expect(result.current.data?.metrics.totalRuns).toBe(12)
    expect(result.current.data?.recentRuns).toHaveLength(1)
  })

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    )

    const { result } = renderHook(
      () => useWorkflowOverview("project-1", "workflow-1", true),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toBe(
      "Failed to fetch workflow overview: 404"
    )
  })
})
