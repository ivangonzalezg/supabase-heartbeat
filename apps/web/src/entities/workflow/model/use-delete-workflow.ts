import { useMutation, useQueryClient } from "@tanstack/react-query"
import { workspaceSummaryQueryKey } from "@/shared/api"

export interface DeleteWorkflowInput {
  projectId: string
  workflowId: string
}

async function deleteWorkflow({
  projectId,
  workflowId,
}: DeleteWorkflowInput): Promise<void> {
  const response = await fetch(
    `/api/projects/${projectId}/workflows/${workflowId}`,
    { method: "DELETE" }
  )

  if (!response.ok) {
    throw new Error(`Failed to delete workflow: ${response.status}`)
  }
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteWorkflow,
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
