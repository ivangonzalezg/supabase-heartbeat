import * as z from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { workspaceSummaryQueryKey } from "@/shared/api"

const workflowResponseSchema = z.object({
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

export type WorkflowResponse = z.infer<typeof workflowResponseSchema>

export interface UpdateWorkflowInput {
  projectId: string
  workflowId: string
  enabled?: boolean
}

async function updateWorkflow({
  projectId,
  workflowId,
  ...body
}: UpdateWorkflowInput): Promise<WorkflowResponse> {
  const response = await fetch(
    `/api/projects/${projectId}/workflows/${workflowId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to update workflow: ${response.status}`)
  }

  return workflowResponseSchema.parse(await response.json())
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateWorkflow,
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
