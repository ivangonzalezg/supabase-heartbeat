import * as React from "react"
import { useParams } from "@tanstack/react-router"
import { useProjects } from "@/entities/project"
import { useWorkflowOverview, useWorkflows } from "@/entities/workflow"
import { RunDetailsDrawer } from "@/widgets/run-details-drawer"
import { ConfiguredStepsPanel } from "./configured-steps-panel"
import { ConfiguredStepsPanelSkeleton } from "./configured-steps-panel-skeleton"
import { OperationalSummaryCard } from "./operational-summary-card"
import { OperationalSummarySkeleton } from "./operational-summary-skeleton"
import { RecentRunsTable } from "./recent-runs-table"
import { RecentRunsTableSkeleton } from "./recent-runs-table-skeleton"
import { WorkflowHeader } from "./workflow-header"

export function WorkflowOverviewPage() {
  const { projectId, workflowId } = useParams({ strict: false }) as {
    projectId: string
    workflowId: string
  }
  // `useWorkflows` reads the same `/api/workspace-summary` cache the
  // sidebar (`NavProjects`) already populated — no extra network request
  // is made here, so the matching workflow's name/enabled can paint
  // instantly whenever the user navigated in from the sidebar or the
  // post-create redirect. It never includes `steps`, so it's a prefill
  // for the header only. `useWorkflowOverview` is the single complete
  // data source for everything else on this page (name/enabled again,
  // steps, operational-summary metrics, and recent runs).
  const workflowsQuery = useWorkflows(true)
  const projectsQuery = useProjects(true)
  const overviewQuery = useWorkflowOverview(projectId, workflowId, true)

  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null)

  const prefilledWorkflow = workflowsQuery.data?.find(
    (workflow) => workflow.id === workflowId
  )
  const project = projectsQuery.data?.find((p) => p.id === projectId)

  // Prefer the overview response's name/enabled once it lands (the
  // complete, authoritative source); fall back to the workspace-summary
  // prefill in the meantime. `WorkflowHeader` itself always renders — it
  // only shows a brief name/status skeleton in the rare case neither
  // source has data yet, never hiding the whole header.
  const workflowName = overviewQuery.data?.name ?? prefilledWorkflow?.name
  const workflowEnabled =
    overviewQuery.data?.enabled ?? prefilledWorkflow?.enabled

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <WorkflowHeader
        projectId={projectId}
        workflowId={workflowId}
        workflowName={workflowName}
        enabled={workflowEnabled}
        isFetching={overviewQuery.isFetching}
      />

      {workflowName === undefined && overviewQuery.isError ? (
        <p className="text-sm text-destructive-subtle-foreground">
          Failed to load this workflow.
        </p>
      ) : null}

      {overviewQuery.isPending ? (
        <OperationalSummarySkeleton />
      ) : overviewQuery.isError ? (
        <p className="text-sm text-destructive-subtle-foreground">
          Failed to load operational summary.
        </p>
      ) : (
        <OperationalSummaryCard summary={overviewQuery.data.metrics} />
      )}

      {overviewQuery.isPending ? (
        <ConfiguredStepsPanelSkeleton />
      ) : overviewQuery.isError ? null : (
        <ConfiguredStepsPanel steps={overviewQuery.data.steps} />
      )}

      <div className="flex flex-col gap-3">
        <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
          RECENT RUNS
        </p>
        <div className="rounded-lg border bg-card p-2">
          {overviewQuery.isPending ? (
            <RecentRunsTableSkeleton />
          ) : overviewQuery.isError ? (
            <p className="p-4 text-sm text-destructive-subtle-foreground">
              Failed to load recent runs.
            </p>
          ) : (
            <RecentRunsTable
              runs={overviewQuery.data.recentRuns}
              onViewDetails={setSelectedRunId}
            />
          )}
        </div>
      </div>

      <RunDetailsDrawer
        projectId={projectId}
        workflowId={workflowId}
        runId={selectedRunId}
        workflowName={workflowName ?? ""}
        projectName={project?.name ?? ""}
        configuredSteps={overviewQuery.data?.steps}
        open={selectedRunId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRunId(null)
        }}
      />
    </div>
  )
}
