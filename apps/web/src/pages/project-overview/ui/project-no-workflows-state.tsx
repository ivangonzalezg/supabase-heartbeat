import { ActivityIcon, PlusIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/shared/ui"

export function ProjectNoWorkflowsState({ projectId }: { projectId: string }) {
  return (
    <div className="flex justify-center">
      <div className="flex w-full max-w-155 flex-col items-center gap-1 rounded-lg border bg-card px-16 py-10 text-center">
        <div className="mb-3 flex size-20.5 items-center justify-center rounded-[10px] bg-sidebar-primary">
          <ActivityIcon className="size-8 text-primary" />
        </div>
        <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
          GET STARTED
        </p>
        <h2 className="text-[22px] font-bold text-foreground">
          No workflows yet
        </h2>
        <p className="max-w-135 text-sm text-muted-foreground">
          Create a workflow to define what activity should run and when. This
          project is connected. Executions and metrics will appear after your
          first workflow is created.
        </p>
        <Button asChild className="mt-4">
          <Link to="/projects/$projectId/workflows/new" params={{ projectId }}>
            <PlusIcon />
            Create your first workflow
          </Link>
        </Button>
      </div>
    </div>
  )
}
