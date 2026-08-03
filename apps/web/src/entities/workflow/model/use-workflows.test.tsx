import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useWorkflows } from "./use-workflows"
import { useWorkflowsByProject } from "./use-workflows-by-project"

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

const project = {
  id: "project-1",
  ownerId: "user-1",
  name: "Project",
  description: null,
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "sb_publishable_example",
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function sampleWorkflow(overrides: {
  id: string
  projectId: string
  name: string
}) {
  return {
    ...overrides,
    description: null,
    cronExpression: "0 * * * *",
    timezone: "UTC",
    enabled: true,
    overlapPolicy: "skip",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

const body = {
  projects: [project],
  workflows: [
    sampleWorkflow({ id: "workflow-1", projectId: "project-1", name: "A" }),
    sampleWorkflow({ id: "workflow-2", projectId: "project-2", name: "B" }),
  ],
}

describe("useWorkflows", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns only the workflows slice of the workspace summary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 })
    )

    const { result } = renderHook(() => useWorkflows(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(body.workflows)
  })

  it("does not fetch when disabled", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    renderHook(() => useWorkflows(false), { wrapper: createWrapper() })

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("useWorkflowsByProject", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("filters workflows down to the given project", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 })
    )

    const { result } = renderHook(
      () => useWorkflowsByProject("project-2", true),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([body.workflows[1]])
  })
})

describe("shared cache within entities/workflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches only once when useWorkflows and useWorkflowsByProject are both mounted", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))

    const { result } = renderHook(
      () => ({
        all: useWorkflows(true),
        byProject: useWorkflowsByProject("project-1", true),
      }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.all.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.byProject.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
