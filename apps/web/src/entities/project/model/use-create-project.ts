import { useMutation, useQueryClient } from "@tanstack/react-query"
import { workspaceSummaryQueryKey } from "@/shared/api"

export interface CreateProjectInput {
  name: string
  description?: string
  supabaseUrl: string
  publishableKey: string
  enabled: boolean
}

async function createProject(input: CreateProjectInput) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(`Failed to create project: ${response.status}`)
  }

  return response.json()
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceSummaryQueryKey,
      })
    },
  })
}
