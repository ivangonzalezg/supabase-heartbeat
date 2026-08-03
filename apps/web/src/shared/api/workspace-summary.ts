import * as z from "zod"
import { useQuery, type UseQueryOptions } from "@tanstack/react-query"

const projectSummarySchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  supabaseUrl: z.string(),
  publishableKey: z.string(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const workflowSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  cronExpression: z.string(),
  timezone: z.string(),
  enabled: z.boolean(),
  overlapPolicy: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const workspaceSummarySchema = z.object({
  projects: z.array(projectSummarySchema),
  workflows: z.array(workflowSummarySchema),
})

export type ProjectSummary = z.infer<typeof projectSummarySchema>
export type WorkflowSummary = z.infer<typeof workflowSummarySchema>
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>

export const workspaceSummaryQueryKey = ["workspace-summary"] as const

async function fetchWorkspaceSummary(): Promise<WorkspaceSummary> {
  const response = await fetch("/api/workspace-summary")

  if (!response.ok) {
    throw new Error(`Failed to fetch workspace summary: ${response.status}`)
  }

  return workspaceSummarySchema.parse(await response.json())
}

/**
 * `enabled` is the caller's responsibility (e.g. gating on authentication
 * status) — this hook only knows how to fetch and cache the summary, not
 * when it's appropriate to do so. `shared` cannot depend on `entities`, so
 * the auth check itself lives at the composition point (a widget/page)
 * that can see both `entities/session` and this hook.
 */
export function useWorkspaceSummaryQuery<T = WorkspaceSummary>(
  enabled: boolean,
  options?: Pick<UseQueryOptions<WorkspaceSummary, Error, T>, "select">
) {
  return useQuery({
    queryKey: workspaceSummaryQueryKey,
    queryFn: fetchWorkspaceSummary,
    enabled,
    ...options,
  })
}
