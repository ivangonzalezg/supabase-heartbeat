import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import {
  useReplaceWorkflow,
  type ReplaceWorkflowInput,
} from "./use-replace-workflow"

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

const workflowDetail = {
  id: "workflow-1",
  projectId: "project-1",
  name: "Renamed workflow",
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
}

const input: ReplaceWorkflowInput = {
  projectId: "project-1",
  workflowId: "workflow-1",
  name: "Renamed workflow",
  cronExpression: "0 9 * * *",
  timezone: "America/Bogota",
  enabled: true,
  overlapPolicy: "skip",
  steps: [
    {
      id: "step-1",
      stepKey: "wait_step",
      type: "wait",
      enabled: true,
      configuration: { seconds: 30 },
    },
  ],
}

describe("useReplaceWorkflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("PUTs to /api/projects/:projectId/workflows/:workflowId without projectId/workflowId in the body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(workflowDetail)))
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useReplaceWorkflow(), {
      wrapper: Wrapper,
    })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.name).toBe("Renamed workflow")

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/project-1/workflows/workflow-1",
      expect.objectContaining({ method: "PUT" })
    )
    const [, requestInit] = fetchSpy.mock.calls[0]
    const sentBody = JSON.parse(requestInit?.body as string)
    expect(sentBody).not.toHaveProperty("projectId")
    expect(sentBody).not.toHaveProperty("workflowId")
    expect(sentBody.steps[0].id).toBe("step-1")
  })

  it("invalidates the workspace summary and workflow overview queries on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(workflowDetail))
    )
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useReplaceWorkflow(), {
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

    const { result } = renderHook(() => useReplaceWorkflow(), {
      wrapper: Wrapper,
    })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(
      new Error("Failed to update workflow: 500")
    )
  })
})
