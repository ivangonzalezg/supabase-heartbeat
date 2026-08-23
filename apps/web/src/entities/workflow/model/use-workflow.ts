import * as z from "zod"
import { useQuery } from "@tanstack/react-query"
import { workflowStepTypes } from "@supabase-heartbeat/validation"

const workflowStepSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  stepKey: z.string(),
  type: z.enum(workflowStepTypes),
  position: z.number(),
  configuration: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const workflowDetailSchema = z.object({
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
  steps: z.array(workflowStepSchema),
})

export type WorkflowStepDetail = z.infer<typeof workflowStepSchema>
export type WorkflowDetail = z.infer<typeof workflowDetailSchema>

async function fetchWorkflow(
  projectId: string,
  workflowId: string
): Promise<WorkflowDetail> {
  const response = await fetch(
    `/api/projects/${projectId}/workflows/${workflowId}`
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch workflow: ${response.status}`)
  }

  return workflowDetailSchema.parse(await response.json())
}

export function useWorkflow(
  projectId: string,
  workflowId: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["workflow", projectId, workflowId] as const,
    queryFn: () => fetchWorkflow(projectId, workflowId),
    enabled,
  })
}
