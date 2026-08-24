import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  WorkflowOverlapPolicy,
  WorkflowStepCreateInput,
} from "@supabase-heartbeat/validation"
import { workspaceSummaryQueryKey } from "@/shared/api"
import { workflowDetailSchema, type WorkflowDetail } from "./use-workflow"

export type ReplaceWorkflowStepInput = WorkflowStepCreateInput & {
  id?: string
}

export interface ReplaceWorkflowInput {
  projectId: string
  workflowId: string
  name: string
  description?: string
  cronExpression: string
  timezone: string
  enabled: boolean
  overlapPolicy?: WorkflowOverlapPolicy
  steps: ReplaceWorkflowStepInput[]
}

async function replaceWorkflow({
  projectId,
  workflowId,
  ...body
}: ReplaceWorkflowInput): Promise<WorkflowDetail> {
  const response = await fetch(
    `/api/projects/${projectId}/workflows/${workflowId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to update workflow: ${response.status}`)
  }

  return workflowDetailSchema.parse(await response.json())
}

export function useReplaceWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: replaceWorkflow,
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
