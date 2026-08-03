import { useWorkspaceSummaryQuery } from "@/shared/api"

export function useWorkflowsByProject(projectId: string, enabled: boolean) {
  return useWorkspaceSummaryQuery(enabled, {
    select: (data) => data.workflows.filter((w) => w.projectId === projectId),
  })
}
