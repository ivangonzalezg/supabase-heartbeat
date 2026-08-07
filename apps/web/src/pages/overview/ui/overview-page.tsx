import { useSessionContext } from "@/entities/session"
import { useProjects } from "@/entities/project"
import { useWorkflows } from "@/entities/workflow"
import { OverviewEmptyState } from "./overview-empty-state"

export function OverviewPage() {
  const { isAuthenticated } = useSessionContext()
  const projectsQuery = useProjects(isAuthenticated)
  const workflowsQuery = useWorkflows(isAuthenticated)
  const hasNoProjects =
    projectsQuery.isSuccess && projectsQuery.data.length === 0

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Monitor your projects, workflows, and recent activity from one place.
        </p>
      </div>

      {hasNoProjects ? (
        <div className="flex flex-1 items-center justify-center">
          <OverviewEmptyState />
        </div>
      ) : (
        <div className="flex gap-4">
          <div className="rounded-md border p-4">
            <p className="text-2xl font-semibold">
              {projectsQuery.data?.length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Projects</p>
          </div>
          <div className="rounded-md border p-4">
            <p className="text-2xl font-semibold">
              {workflowsQuery.data?.length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Workflows</p>
          </div>
        </div>
      )}
    </div>
  )
}
