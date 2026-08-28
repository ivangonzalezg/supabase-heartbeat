import * as z from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { workspaceSummaryQueryKey } from "@/shared/api"

const projectResponseSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  supabaseUrl: z.string(),
  publishableKey: z.string(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type ProjectResponse = z.infer<typeof projectResponseSchema>

export interface UpdateProjectInput {
  projectId: string
  name?: string
  description?: string
  supabaseUrl?: string
  publishableKey?: string
  enabled?: boolean
}

async function updateProject({
  projectId,
  ...body
}: UpdateProjectInput): Promise<ProjectResponse> {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Failed to update project: ${response.status}`)
  }

  return projectResponseSchema.parse(await response.json())
}

export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateProject,
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: workspaceSummaryQueryKey,
      })
      void queryClient.invalidateQueries({
        queryKey: ["project-overview", variables.projectId],
      })
    },
  })
}
