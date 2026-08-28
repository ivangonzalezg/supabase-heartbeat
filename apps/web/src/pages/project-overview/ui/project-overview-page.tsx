import * as React from "react"
import { useParams } from "@tanstack/react-router"
import { useProjectOverview, useProjects } from "@/entities/project"
import { RunDetailsDrawer } from "@/widgets/run-details-drawer"
import { ProjectActivityTable } from "./project-activity-table"
import { ProjectActivityTableSkeleton } from "./project-activity-table-skeleton"
import { ProjectHeader } from "./project-header"
import { ProjectNoWorkflowsState } from "./project-no-workflows-state"
import { ProjectSummaryCard } from "./project-summary-card"
import { ProjectSummarySkeleton } from "./project-summary-skeleton"
import { ProjectWorkflowsTable } from "./project-workflows-table"
import { ProjectWorkflowsTableSkeleton } from "./project-workflows-table-skeleton"

export function ProjectOverviewPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string }
  // `useProjects` reads the same `/api/workspace-summary` cache the
  // sidebar (`NavProjects`) already populated — no extra network request
  // is made here, so the project's name/enabled/description can paint
  // instantly whenever the user navigated in from the sidebar.
  // `useProjectOverview` is the single complete data source for
  // everything else on this page (name/enabled again, metrics, the
  // per-workflow table, and recent activity across every workflow).
  const projectsQuery = useProjects(true)
  const overviewQuery = useProjectOverview(projectId, true)

  const [selectedRun, setSelectedRun] = React.useState<{
    workflowId: string
    runId: string
  } | null>(null)

  const prefilledProject = projectsQuery.data?.find((p) => p.id === projectId)

  // Prefer the overview response's fields once it lands (the complete,
  // authoritative source); fall back to the workspace-summary prefill in
  // the meantime. `ProjectHeader` itself always renders — it only shows
  // a brief name/status skeleton in the rare case neither source has
  // data yet, never hiding the whole header.
  const projectName = overviewQuery.data?.name ?? prefilledProject?.name
  const projectEnabled =
    overviewQuery.data?.enabled ?? prefilledProject?.enabled
  const projectDescription =
    overviewQuery.data?.description ?? prefilledProject?.description

  const selectedWorkflowName = overviewQuery.data?.workflows.find(
    (workflow) => workflow.id === selectedRun?.workflowId
  )?.name

  const hasNoWorkflows = overviewQuery.data?.workflows.length === 0

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <ProjectHeader
        projectId={projectId}
        projectName={projectName}
        description={projectDescription}
        enabled={projectEnabled}
        isFetching={overviewQuery.isFetching}
      />

      {projectName === undefined && overviewQuery.isError ? (
        <p className="text-sm text-destructive-subtle-foreground">
          Failed to load this project.
        </p>
      ) : null}

      {overviewQuery.isPending ? (
        <>
          <ProjectSummarySkeleton />
          <div className="rounded-lg border bg-card p-2">
            <ProjectWorkflowsTableSkeleton />
          </div>
          <div className="rounded-lg border bg-card p-2">
            <ProjectActivityTableSkeleton />
          </div>
        </>
      ) : overviewQuery.isError ? (
        <p className="text-sm text-destructive-subtle-foreground">
          Failed to load project overview.
        </p>
      ) : hasNoWorkflows ? (
        <ProjectNoWorkflowsState projectId={projectId} />
      ) : (
        <>
          <ProjectSummaryCard summary={overviewQuery.data.metrics} />

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
              WORKFLOWS · {overviewQuery.data.workflows.length}
            </p>
            <div className="rounded-lg border bg-card p-2">
              <ProjectWorkflowsTable
                projectId={projectId}
                workflows={overviewQuery.data.workflows}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
              RECENT PROJECT ACTIVITY
            </p>
            <div className="rounded-lg border bg-card p-2">
              <ProjectActivityTable
                runs={overviewQuery.data.recentRuns}
                onViewDetails={(workflowId, runId) =>
                  setSelectedRun({ workflowId, runId })
                }
              />
            </div>
          </div>
        </>
      )}

      <RunDetailsDrawer
        projectId={projectId}
        workflowId={selectedRun?.workflowId ?? ""}
        runId={selectedRun?.runId ?? null}
        workflowName={selectedWorkflowName ?? ""}
        projectName={projectName ?? ""}
        open={selectedRun !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRun(null)
        }}
      />
    </div>
  )
}
