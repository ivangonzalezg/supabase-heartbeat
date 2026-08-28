import { useMutation, useQueryClient } from "@tanstack/react-query"
import { workspaceSummaryQueryKey } from "@/shared/api"

export interface DeleteProjectInput {
  projectId: string
}

async function deleteProject({ projectId }: DeleteProjectInput): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    throw new Error(`Failed to delete project: ${response.status}`)
  }
}

export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceSummaryQueryKey,
      })
    },
  })
}
