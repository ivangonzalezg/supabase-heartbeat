import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import {
  useCreateWorkflow,
  type CreateWorkflowInput,
} from "./use-create-workflow"

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

const input: CreateWorkflowInput = {
  projectId: "project-1",
  name: "Daily content activity",
  cronExpression: "0 9 * * *",
  timezone: "America/Bogota",
  enabled: true,
  overlapPolicy: "skip",
  steps: [
    {
      stepKey: "wait_step",
      type: "wait",
      enabled: true,
      configuration: { seconds: 30 },
    },
  ],
}

describe("useCreateWorkflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("POSTs to /api/projects/:projectId/workflows without projectId in the body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "workflow-1" }), { status: 201 })
      )
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useCreateWorkflow(), {
      wrapper: Wrapper,
    })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/project-1/workflows",
      expect.objectContaining({ method: "POST" })
    )
    const [, requestInit] = fetchSpy.mock.calls[0]
    const sentBody = JSON.parse(requestInit?.body as string)
    expect(sentBody).not.toHaveProperty("projectId")
    expect(sentBody.name).toBe("Daily content activity")
  })

  it("invalidates the workspace summary query on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "workflow-1" }), { status: 201 })
    )
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useCreateWorkflow(), {
      wrapper: Wrapper,
    })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workspace-summary"],
    })
  })

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useCreateWorkflow(), {
      wrapper: Wrapper,
    })
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(
      new Error("Failed to create workflow: 500")
    )
  })
})
