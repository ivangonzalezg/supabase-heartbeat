import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useWorkflowRunDetail } from "./use-workflow-run-detail"

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

const runDetail = {
  id: "run-1",
  workflowId: "workflow-1",
  triggerType: "manual",
  status: "success",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:05.000Z",
  error: null,
  stepRuns: [
    {
      id: "step-run-1",
      workflowRunId: "run-1",
      workflowStepId: "step-1",
      position: 0,
      status: "success",
      inputSnapshot: { email: "user@example.com" },
      output: null,
      error: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      stepKey: "sign_in",
      type: "signin",
    },
  ],
}

describe("useWorkflowRunDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches /api/projects/:projectId/workflows/:workflowId/runs/:runId when enabled", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(runDetail)))

    const { result } = renderHook(
      () => useWorkflowRunDetail("project-1", "workflow-1", "run-1", true),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/project-1/workflows/workflow-1/runs/run-1"
    )
    expect(result.current.data?.stepRuns[0].stepKey).toBe("sign_in")
  })

  it("does not fetch when disabled", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    renderHook(
      () => useWorkflowRunDetail("project-1", "workflow-1", "run-1", false),
      { wrapper: createWrapper() }
    )

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )

    const { result } = renderHook(
      () => useWorkflowRunDetail("project-1", "workflow-1", "run-1", true),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(
      new Error("Failed to fetch workflow run: 500")
    )
  })
})
