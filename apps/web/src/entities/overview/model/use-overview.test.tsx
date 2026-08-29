import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useOverview } from "./use-overview"

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

const sampleOverview = {
  metrics: {
    totalProjects: 1,
    activeWorkflows: 1,
    totalRuns: 5,
    failedRuns: 1,
    lastActivity: "2026-01-01T00:00:00.000Z",
    nextRun: "2026-01-01T01:00:00.000Z",
    nextRunWorkflowName: "Daily activity",
    nextRunProjectName: "Artemivo",
  },
  projects: [
    {
      id: "project-1",
      name: "Artemivo",
      enabled: true,
      totalWorkflows: 2,
      activeWorkflows: 2,
      lastActivity: "2026-01-01T00:00:00.000Z",
      nextRun: "2026-01-01T01:00:00.000Z",
    },
  ],
  recentRuns: [
    {
      id: "run-1",
      status: "success",
      triggerType: "scheduled",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:34.600Z",
      durationMs: 34600,
      failedStepKey: null,
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      projectId: "project-1",
      projectName: "Artemivo",
    },
  ],
  upcomingRuns: [
    {
      workflowId: "workflow-1",
      workflowName: "Daily activity",
      projectId: "project-1",
      projectName: "Artemivo",
      nextRun: "2026-01-01T01:00:00.000Z",
      cronExpression: "0 * * * *",
    },
  ],
}

describe("useOverview", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches and parses the overview payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(sampleOverview), { status: 200 })
    )

    const { result } = renderHook(() => useOverview(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(sampleOverview)
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/overview")
  })

  it("does not fetch when disabled", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    renderHook(() => useOverview(false), { wrapper: createWrapper() })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("surfaces a fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )

    const { result } = renderHook(() => useOverview(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
