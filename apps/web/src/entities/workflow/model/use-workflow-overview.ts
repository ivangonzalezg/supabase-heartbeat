import * as z from "zod"
import { useQuery } from "@tanstack/react-query"
import {
  workflowRunStatuses,
  workflowRunTriggerTypes,
} from "@supabase-heartbeat/validation"
import { workflowDetailSchema } from "./use-workflow"

const workflowRunSummaryMetricsSchema = z.object({
  totalRuns: z.number(),
  successRate: z.number().nullable(),
  failedRuns: z.number(),
  avgDurationMs: z.number().nullable(),
  lastRun: z.iso.datetime().nullable(),
  nextRun: z.iso.datetime().nullable(),
})

const workflowRunListItemSchema = z.object({
  id: z.string(),
  status: z.enum(workflowRunStatuses),
  triggerType: z.enum(workflowRunTriggerTypes),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  durationMs: z.number().nullable(),
  failedStepKey: z.string().nullable(),
})

const workflowOverviewSchema = workflowDetailSchema.extend({
  metrics: workflowRunSummaryMetricsSchema,
  recentRuns: z.array(workflowRunListItemSchema),
})

export type WorkflowRunSummaryMetrics = z.infer<
  typeof workflowRunSummaryMetricsSchema
>
export type WorkflowRunListItem = z.infer<typeof workflowRunListItemSchema>
export type WorkflowOverview = z.infer<typeof workflowOverviewSchema>

async function fetchWorkflowOverview(
  projectId: string,
  workflowId: string
): Promise<WorkflowOverview> {
  const response = await fetch(
    `/api/projects/${projectId}/workflows/${workflowId}/overview`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch workflow overview: ${response.status}`)
  }

  return workflowOverviewSchema.parse(await response.json())
}

export function useWorkflowOverview(
  projectId: string,
  workflowId: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["workflow-overview", projectId, workflowId] as const,
    queryFn: () => fetchWorkflowOverview(projectId, workflowId),
    enabled,
  })
}
