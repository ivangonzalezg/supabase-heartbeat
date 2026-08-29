import * as z from "zod"
import { useQuery } from "@tanstack/react-query"
import {
  workflowRunStatuses,
  workflowRunTriggerTypes,
} from "@supabase-heartbeat/validation"

// Mirrors `entities/project`'s `projectRunListItemFields` field for field —
// duplicated rather than imported, since FSD forbids cross-slice imports
// between entities (`entities/overview` may not import from
// `entities/project`/`entities/workflow`, per `steiger`'s
// `fsd/forbidden-imports` rule).
const overviewRunListItemFields = {
  id: z.string(),
  status: z.enum(workflowRunStatuses),
  triggerType: z.enum(workflowRunTriggerTypes),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  durationMs: z.number().nullable(),
  failedStepKey: z.string().nullable(),
}

const overviewSummaryMetricsSchema = z.object({
  totalProjects: z.number(),
  activeWorkflows: z.number(),
  totalRuns: z.number(),
  failedRuns: z.number(),
  lastActivity: z.iso.datetime().nullable(),
  nextRun: z.iso.datetime().nullable(),
  nextRunWorkflowName: z.string().nullable(),
  nextRunProjectName: z.string().nullable(),
})

const overviewProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  totalWorkflows: z.number(),
  activeWorkflows: z.number(),
  lastActivity: z.iso.datetime().nullable(),
  nextRun: z.iso.datetime().nullable(),
})

const overviewRecentRunItemSchema = z.object({
  ...overviewRunListItemFields,
  workflowId: z.string(),
  workflowName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
})

const overviewUpcomingRunSchema = z.object({
  workflowId: z.string(),
  workflowName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  nextRun: z.iso.datetime(),
  cronExpression: z.string(),
})

const overviewSchema = z.object({
  metrics: overviewSummaryMetricsSchema,
  projects: z.array(overviewProjectSummarySchema),
  recentRuns: z.array(overviewRecentRunItemSchema),
  upcomingRuns: z.array(overviewUpcomingRunSchema),
})

export type OverviewSummaryMetrics = z.infer<
  typeof overviewSummaryMetricsSchema
>
export type OverviewProjectSummary = z.infer<
  typeof overviewProjectSummarySchema
>
export type OverviewRecentRunItem = z.infer<typeof overviewRecentRunItemSchema>
export type OverviewUpcomingRun = z.infer<typeof overviewUpcomingRunSchema>
export type Overview = z.infer<typeof overviewSchema>

async function fetchOverview(): Promise<Overview> {
  const response = await fetch("/api/overview")

  if (!response.ok) {
    throw new Error(`Failed to fetch overview: ${response.status}`)
  }

  return overviewSchema.parse(await response.json())
}

export function useOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["overview"] as const,
    queryFn: fetchOverview,
    enabled,
  })
}
