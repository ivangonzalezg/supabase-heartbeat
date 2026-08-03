import { useWorkspaceSummaryQuery } from "@/shared/api"

export function useProjects(enabled: boolean) {
  return useWorkspaceSummaryQuery(enabled, { select: (data) => data.projects })
}
