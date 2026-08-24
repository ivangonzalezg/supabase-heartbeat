import * as z from "zod"
import { useQuery } from "@tanstack/react-query"
import {
  workflowRunStatuses,
  workflowRunTriggerTypes,
  workflowStepTypes,
} from "@supabase-heartbeat/validation"
import { stepRunResponseSchema } from "./use-run-workflow"

const stepRunDetailSchema = stepRunResponseSchema.extend({
  stepKey: z.string(),
  type: z.enum(workflowStepTypes),
})

const workflowRunDetailWithStepsSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  triggerType: z.enum(workflowRunTriggerTypes),
  status: z.enum(workflowRunStatuses),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  stepRuns: z.array(stepRunDetailSchema),
})

export type StepRunDetail = z.infer<typeof stepRunDetailSchema>
export type WorkflowRunDetailWithSteps = z.infer<
  typeof workflowRunDetailWithStepsSchema
>

async function fetchWorkflowRunDetail(
  projectId: string,
  workflowId: string,
  runId: string
): Promise<WorkflowRunDetailWithSteps> {
  const response = await fetch(
    `/api/projects/${projectId}/workflows/${workflowId}/runs/${runId}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch workflow run: ${response.status}`)
  }

  return workflowRunDetailWithStepsSchema.parse(await response.json())
}

export function useWorkflowRunDetail(
  projectId: string,
  workflowId: string,
  runId: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["workflow-run-detail", projectId, workflowId, runId] as const,
    queryFn: () => fetchWorkflowRunDetail(projectId, workflowId, runId),
    enabled,
  })
}
