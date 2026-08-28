import * as z from "zod"
import { useQuery } from "@tanstack/react-query"
import {
  workflowRunStatuses,
  workflowRunTriggerTypes,
} from "@supabase-heartbeat/validation"

// Mirrors `entities/workflow`'s `workflowRunListItemSchema` field for
// field — duplicated rather than imported, since FSD forbids cross-slice
// imports between entities (`entities/project` may not import from
// `entities/workflow`, per `steiger`'s `fsd/forbidden-imports` rule).
const projectRunListItemFields = {
  id: z.string(),
  status: z.enum(workflowRunStatuses),
  triggerType: z.enum(workflowRunTriggerTypes),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  durationMs: z.number().nullable(),
  failedStepKey: z.string().nullable(),
}

const projectWorkflowSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  cronExpression: z.string(),
  timezone: z.string(),
  lastRun: z.iso.datetime().nullable(),
  lastStatus: z.enum(workflowRunStatuses).nullable(),
  nextRun: z.iso.datetime().nullable(),
})

const projectRecentRunItemSchema = z.object({
  ...projectRunListItemFields,
  workflowId: z.string(),
  workflowName: z.string(),
})

const projectSummaryMetricsSchema = z.object({
  totalWorkflows: z.number(),
  activeWorkflows: z.number(),
  totalRuns: z.number(),
  failedRuns: z.number(),
  lastActivity: z.iso.datetime().nullable(),
  nextRun: z.iso.datetime().nullable(),
})

const projectOverviewSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  supabaseUrl: z.string(),
  publishableKey: z.string(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  metrics: projectSummaryMetricsSchema,
  workflows: z.array(projectWorkflowSummarySchema),
  recentRuns: z.array(projectRecentRunItemSchema),
})

export type ProjectWorkflowSummary = z.infer<
  typeof projectWorkflowSummarySchema
>
export type ProjectRecentRunItem = z.infer<typeof projectRecentRunItemSchema>
export type ProjectSummaryMetrics = z.infer<typeof projectSummaryMetricsSchema>
export type ProjectOverview = z.infer<typeof projectOverviewSchema>

async function fetchProjectOverview(
  projectId: string
): Promise<ProjectOverview> {
  const response = await fetch(`/api/projects/${projectId}/overview`)

  if (!response.ok) {
    throw new Error(`Failed to fetch project overview: ${response.status}`)
  }

  return projectOverviewSchema.parse(await response.json())
}

export function useProjectOverview(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["project-overview", projectId] as const,
    queryFn: () => fetchProjectOverview(projectId),
    enabled,
  })
}
