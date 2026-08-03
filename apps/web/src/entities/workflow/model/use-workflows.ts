import { useWorkspaceSummaryQuery } from "@/shared/api"

export function useWorkflows(enabled: boolean) {
  return useWorkspaceSummaryQuery(enabled, { select: (data) => data.workflows })
}
