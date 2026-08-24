import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import {
  useDeleteWorkflow,
  type DeleteWorkflowInput,
} from "./use-delete-workflow"

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

const input: DeleteWorkflowInput = {
  projectId: "project-1",
  workflowId: "workflow-1",
}

describe("useDeleteWorkflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("DELETEs /api/projects/:projectId/workflows/:workflowId", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }))
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useDeleteWorkflow(), {
      wrapper: Wrapper,
    })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/project-1/workflows/workflow-1",
      expect.objectContaining({ method: "DELETE" })
    )
  })

  it("invalidates the workspace summary and workflow overview queries on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 })
    )
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useDeleteWorkflow(), {
      wrapper: Wrapper,
    })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workspace-summary"],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workflow-overview", "project-1", "workflow-1"],
    })
  })

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useDeleteWorkflow(), {
      wrapper: Wrapper,
    })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(
      new Error("Failed to delete workflow: 500")
    )
  })
})
