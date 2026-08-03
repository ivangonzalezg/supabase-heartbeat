import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useProjects } from "@/entities/project"
import { useWorkflows } from "@/entities/workflow"

/**
 * `entities/project` and `entities/workflow` both read from the same
 * `/api/workspace-summary` endpoint through the shared query key defined in
 * `shared/api`. This is where both entities are legitimately composed
 * together (the future sidebar widget will do the same), so it's the right
 * place to verify the cache is actually shared rather than doubly fetched.
 */
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

describe("workspace summary cache sharing", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches only once when useProjects and useWorkflows are both mounted", async () => {
    const body = {
      projects: [
        {
          id: "project-1",
          ownerId: "user-1",
          name: "Project",
          description: null,
          supabaseUrl: "https://example.supabase.co",
          publishableKey: "sb_publishable_example",
          enabled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      workflows: [
        {
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
        },
      ],
    }
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))

    const { result } = renderHook(
      () => ({ projects: useProjects(true), workflows: useWorkflows(true) }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.projects.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.workflows.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
