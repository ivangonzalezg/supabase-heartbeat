import * as z from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  workflowRunStatuses,
  workflowRunTriggerTypes,
  stepRunStatuses,
} from "@supabase-heartbeat/validation"
import { workspaceSummaryQueryKey } from "@/shared/api"

const stepRunResponseSchema = z.object({
  id: z.string(),
  workflowRunId: z.string(),
  workflowStepId: z.string(),
  position: z.number(),
  status: z.enum(stepRunStatuses),
  inputSnapshot: z.record(z.string(), z.unknown()).nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
})

const workflowRunDetailSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  triggerType: z.enum(workflowRunTriggerTypes),
  status: z.enum(workflowRunStatuses),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  stepRuns: z.array(stepRunResponseSchema),
})

export type WorkflowRunDetail = z.infer<typeof workflowRunDetailSchema>

export interface RunWorkflowInput {
  projectId: string
  workflowId: string
}

async function runWorkflow({
  projectId,
  workflowId,
}: RunWorkflowInput): Promise<WorkflowRunDetail> {
  const response = await fetch(
    `/api/projects/${projectId}/workflows/${workflowId}/runs`,
    { method: "POST" }
  )

  if (!response.ok) {
    throw new Error(`Failed to run workflow: ${response.status}`)
  }

  return workflowRunDetailSchema.parse(await response.json())
}

export function useRunWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: runWorkflow,
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: workspaceSummaryQueryKey,
      })
      void queryClient.invalidateQueries({
        queryKey: [
          "workflow-overview",
          variables.projectId,
          variables.workflowId,
        ],
      })
    },
  })
}
