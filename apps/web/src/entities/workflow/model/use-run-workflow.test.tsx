import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useRunWorkflow, type RunWorkflowInput } from "./use-run-workflow"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return {
    queryClient,
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    },
  }
}

const input: RunWorkflowInput = {
  projectId: "project-1",
  workflowId: "workflow-1",
}

function jsonResponse(body: unknown, status = 201) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const runDetail = {
  id: "run-1",
  workflowId: "workflow-1",
  triggerType: "manual",
  status: "success",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:01.000Z",
  error: null,
  stepRuns: [],
}

describe("useRunWorkflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("POSTs /api/projects/:projectId/workflows/:workflowId/runs with no body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(runDetail))
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useRunWorkflow(), { wrapper: Wrapper })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/project-1/workflows/workflow-1/runs",
      expect.objectContaining({ method: "POST" })
    )
    const [, requestInit] = fetchSpy.mock.calls[0]
    expect(requestInit?.body).toBeUndefined()
  })

  it("resolves with the parsed run detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(runDetail))
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useRunWorkflow(), { wrapper: Wrapper })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(runDetail)
  })

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useRunWorkflow(), { wrapper: Wrapper })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(
      new Error("Failed to run workflow: 500")
    )
  })

  it("invalidates the workspace summary and workflow overview queries on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(runDetail))
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useRunWorkflow(), { wrapper: Wrapper })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workspace-summary"],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workflow-overview", "project-1", "workflow-1"],
    })
  })
})
