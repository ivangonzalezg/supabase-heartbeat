import { ArrowRightIcon, WorkflowIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"
import type { Project } from "@/entities/project"

function ProjectRow({ project }: { project: Project }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold text-foreground">{project.name}</p>
        {project.description ? (
          <p className="text-muted-foreground">{project.description}</p>
        ) : null}
      </div>
      <Link
        to="/projects/$projectId/workflows/new"
        params={{ projectId: project.id }}
        className="flex items-center gap-1.5 font-semibold text-primary hover:underline"
      >
        Create workflow
        <ArrowRightIcon className="size-3.5" />
      </Link>
    </div>
  )
}

export function OverviewNoWorkflowsState({
  projects,
}: {
  projects: Project[]
}) {
  return (
    <div className="flex justify-center">
      <div className="flex w-full max-w-170 flex-col items-center gap-1 rounded-lg border bg-card px-16 py-10 text-center">
        <div className="mb-3 flex size-20.5 items-center justify-center rounded-[10px] bg-sidebar-primary">
          <WorkflowIcon className="size-8 text-primary" />
        </div>
        <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
          NEXT STEP
        </p>
        <h2 className="text-xl font-bold text-foreground">
          Choose a project to create its first workflow
        </h2>
        <p className="max-w-150 text-sm text-muted-foreground">
          Workflows define what activity runs and when. Select a project to
          begin.
        </p>

        <div className="mt-6 flex w-full flex-col gap-2 text-left">
          <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
            PROJECTS
          </p>
          <div className="flex flex-col gap-2">
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
