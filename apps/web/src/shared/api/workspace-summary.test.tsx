import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useWorkspaceSummaryQuery } from "./workspace-summary"

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

const sampleProject = {
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

const sampleWorkflow = {
  id: "workflow-1",
  projectId: "project-1",
  name: "Workflow",
  description: null,
  cronExpression: "0 * * * *",
  timezone: "UTC",
  enabled: true,
  overlapPolicy: "skip",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

describe("useWorkspaceSummaryQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("does not fetch when enabled is false", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    renderHook(() => useWorkspaceSummaryQuery(false), {
      wrapper: createWrapper(),
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("fetches /api/workspace-summary when enabled and returns parsed data", async () => {
    const body = { projects: [sampleProject], workflows: [sampleWorkflow] }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 })
    )

    const { result } = renderHook(() => useWorkspaceSummaryQuery(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/workspace-summary")
    expect(result.current.data).toEqual(body)
  })

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    )

    const { result } = renderHook(() => useWorkspaceSummaryQuery(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toBe(
      "Failed to fetch workspace summary: 500"
    )
  })

  it("throws when the response fails schema validation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ projects: "not-an-array" }), {
        status: 200,
      })
    )

    const { result } = renderHook(() => useWorkspaceSummaryQuery(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it("applies a select function to derive a slice of the data", async () => {
    const body = { projects: [sampleProject], workflows: [] }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 })
    )

    const { result } = renderHook(
      () => useWorkspaceSummaryQuery(true, { select: (data) => data.projects }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(body.projects)
  })
})
