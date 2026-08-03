import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useProjects } from "./use-projects"

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

describe("useProjects", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns only the projects slice of the workspace summary", async () => {
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
    const workflow = {
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
    const body = { projects: [project], workflows: [workflow] }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 })
    )

    const { result } = renderHook(() => useProjects(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(body.projects)
  })

  it("does not fetch when disabled", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    renderHook(() => useProjects(false), { wrapper: createWrapper() })

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
