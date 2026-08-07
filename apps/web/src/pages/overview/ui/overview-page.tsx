import { useSessionContext } from "@/entities/session"
import { useProjects } from "@/entities/project"
import { useWorkflows } from "@/entities/workflow"

export function OverviewPage() {
  const { user, isAuthenticated } = useSessionContext()
  const projectsQuery = useProjects(isAuthenticated)
  const workflowsQuery = useWorkflows(isAuthenticated)

  return (
    <div className="flex min-h-full flex-col gap-4 p-6 text-sm">
      <div>
        <h1 className="text-lg font-semibold">Welcome back, {user?.name}</h1>
        <p className="text-muted-foreground">{user?.email}</p>
      </div>
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
    </div>
  )
}
