import * as React from "react"
import { PlusIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { useSessionContext } from "@/entities/session"
import { useProjects } from "@/entities/project"
import { useWorkflows } from "@/entities/workflow"
import { useOverview, type OverviewRecentRunItem } from "@/entities/overview"
import { RunDetailsDrawer } from "@/widgets/run-details-drawer"
import { Button } from "@/shared/ui"
import { OverviewNoProjectsState } from "./overview-no-projects-state"
import { OverviewNoWorkflowsState } from "./overview-no-workflows-state"
import { OverviewSummaryCard } from "./overview-summary-card"
import { OverviewSummarySkeleton } from "./overview-summary-skeleton"
import { OverviewProjectsTable } from "./overview-projects-table"
import { OverviewProjectsTableSkeleton } from "./overview-projects-table-skeleton"
import { OverviewActivityTable } from "./overview-activity-table"
import { OverviewActivityTableSkeleton } from "./overview-activity-table-skeleton"
import { OverviewUpcomingRunsTable } from "./overview-upcoming-runs-table"
import { OverviewUpcomingRunsTableSkeleton } from "./overview-upcoming-runs-table-skeleton"

export function OverviewPage() {
  const { isAuthenticated } = useSessionContext()
  const projectsQuery = useProjects(isAuthenticated)
  const workflowsQuery = useWorkflows(isAuthenticated)
  const hasNoProjects =
    projectsQuery.isSuccess && projectsQuery.data.length === 0
  const hasNoWorkflows =
    projectsQuery.isSuccess &&
    workflowsQuery.isSuccess &&
    projectsQuery.data.length > 0 &&
    workflowsQuery.data.length === 0

  // The heavier aggregation request is only fired once we know it's
  // actually needed — i.e. neither whole-page empty state applies — so it
  // never fires and gets discarded on the empty-state paths.
  const overviewEnabled =
    isAuthenticated &&
    projectsQuery.isSuccess &&
    workflowsQuery.isSuccess &&
    !hasNoProjects &&
    !hasNoWorkflows
  const overviewQuery = useOverview(overviewEnabled)

  const [selectedRun, setSelectedRun] = React.useState<{
    projectId: string
    workflowId: string
    runId: string
    workflowName: string
    projectName: string
  } | null>(null)

  function handleViewDetails(run: OverviewRecentRunItem) {
    setSelectedRun({
      projectId: run.projectId,
      workflowId: run.workflowId,
      runId: run.id,
      workflowName: run.workflowName,
      projectName: run.projectName,
    })
  }

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Monitor your projects, workflows, and recent activity from one
            place.
          </p>
        </div>
        {!hasNoProjects ? (
          <Button asChild>
            <Link to="/projects/new">
              <PlusIcon />
              New project
            </Link>
          </Button>
        ) : null}
      </div>

      {hasNoProjects ? (
        <div className="flex flex-1 items-center justify-center">
          <OverviewNoProjectsState />
        </div>
      ) : hasNoWorkflows ? (
        <div className="flex flex-1 items-center justify-center">
          <OverviewNoWorkflowsState projects={projectsQuery.data} />
        </div>
      ) : overviewQuery.isPending ? (
        <>
          <OverviewSummarySkeleton />
          <div className="rounded-lg border bg-card p-2">
            <OverviewProjectsTableSkeleton />
          </div>
          <div className="rounded-lg border bg-card p-2">
            <OverviewUpcomingRunsTableSkeleton />
          </div>
          <div className="rounded-lg border bg-card p-2">
            <OverviewActivityTableSkeleton />
          </div>
        </>
      ) : overviewQuery.isError ? (
        <p className="text-sm text-destructive-subtle-foreground">
          Failed to load overview.
        </p>
      ) : (
        <>
          <OverviewSummaryCard summary={overviewQuery.data.metrics} />

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
              PROJECTS · {overviewQuery.data.projects.length}
            </p>
            <div className="rounded-lg border bg-card p-2">
              <OverviewProjectsTable projects={overviewQuery.data.projects} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
              UPCOMING RUNS
            </p>
            <div className="rounded-lg border bg-card p-2">
              <OverviewUpcomingRunsTable
                runs={overviewQuery.data.upcomingRuns}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
              RECENT ACTIVITY
            </p>
            <div className="rounded-lg border bg-card p-2">
              <OverviewActivityTable
                runs={overviewQuery.data.recentRuns}
                onViewDetails={handleViewDetails}
              />
            </div>
          </div>
        </>
      )}

      <RunDetailsDrawer
        projectId={selectedRun?.projectId ?? ""}
        workflowId={selectedRun?.workflowId ?? ""}
        runId={selectedRun?.runId ?? null}
        workflowName={selectedRun?.workflowName ?? ""}
        projectName={selectedRun?.projectName ?? ""}
        open={selectedRun !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRun(null)
        }}
      />
    </div>
  )
}
