import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  WorkflowOverlapPolicy,
  WorkflowStepCreateInput,
} from "@supabase-heartbeat/validation"
import { workspaceSummaryQueryKey } from "@/shared/api"

export interface CreateWorkflowInput {
  projectId: string
  name: string
  description?: string
  cronExpression: string
  timezone: string
  enabled: boolean
  overlapPolicy?: WorkflowOverlapPolicy
  steps: WorkflowStepCreateInput[]
}

async function createWorkflow({ projectId, ...body }: CreateWorkflowInput) {
  const response = await fetch(`/api/projects/${projectId}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Failed to create workflow: ${response.status}`)
  }

  return response.json()
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceSummaryQueryKey,
      })
    },
  })
}
