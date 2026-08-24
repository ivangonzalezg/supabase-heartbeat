import {
  formatDuration,
  formatRunTimestamp,
  RunStatusBadge,
  useWorkflowRunDetail,
  type WorkflowStepDetail,
} from "@/entities/workflow"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@/shared/ui"
import { SkippedStepCard, StepExecutionCard } from "./step-execution-card"

function MetaField({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

function MetaGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="flex gap-6">{children}</div>
    </div>
  )
}

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manual",
  scheduled: "Scheduled",
}

export function RunDetailsDrawer({
  projectId,
  workflowId,
  runId,
  workflowName,
  projectName,
  configuredSteps,
  open,
  onOpenChange,
}: {
  projectId: string
  workflowId: string
  /** `null` while no run is selected — the drawer stays closed in that
   * case regardless of `open`, since there is nothing to fetch/show. */
  runId: string | null
  workflowName: string
  projectName: string
  /** The workflow's currently configured steps, in position order — used
   * only to infer which steps were skipped after an earlier failure
   * (no step-run row exists for them, since execution stops at the
   * first failure and never persists a "skipped" row). Not required:
   * omit it and skipped steps are simply not shown. */
  configuredSteps?: Pick<
    WorkflowStepDetail,
    "id" | "stepKey" | "type" | "configuration"
  >[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const runQuery = useWorkflowRunDetail(
    projectId,
    workflowId,
    runId ?? "",
    open && runId !== null
  )

  const run = runQuery.data
  const failedIndex = run?.stepRuns.findIndex((s) => s.status === "failed")
  const skippedSteps =
    run && configuredSteps && failedIndex !== undefined && failedIndex !== -1
      ? configuredSteps.slice(run.stepRuns.length)
      : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-150">
        <SheetHeader className="gap-1 border-b p-6">
          <SheetTitle className="text-lg">Run details</SheetTitle>
          <SheetDescription>
            {workflowName} · {projectName}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-6">
          {runQuery.isPending ? (
            <div className="flex items-center justify-center py-16">
              <Spinner />
            </div>
          ) : runQuery.isError ? (
            <p className="text-sm text-destructive-subtle-foreground">
              Failed to load this run.
            </p>
          ) : run ? (
            <>
              <div className="flex flex-col gap-4 rounded-lg bg-muted p-4">
                <MetaGroup title="EXECUTION">
                  <MetaField
                    label="Run ID"
                    value={<span className="font-mono">{run.id}</span>}
                  />
                  <MetaField
                    label="Trigger"
                    value={TRIGGER_LABEL[run.triggerType] ?? run.triggerType}
                  />
                </MetaGroup>

                <div className="h-px bg-border" />

                <MetaGroup title="TIMING">
                  <MetaField
                    label="Started"
                    value={formatRunTimestamp(run.startedAt)}
                  />
                  <MetaField
                    label="Finished"
                    value={formatRunTimestamp(run.finishedAt)}
                  />
                  <MetaField
                    label="Duration"
                    value={
                      <span className="font-mono">
                        {formatDuration(
                          run.startedAt && run.finishedAt
                            ? new Date(run.finishedAt).getTime() -
                                new Date(run.startedAt).getTime()
                            : null
                        ) ?? "—"}
                      </span>
                    }
                  />
                </MetaGroup>

                <div className="h-px bg-border" />

                <MetaGroup title="OUTCOME">
                  <MetaField
                    label="Status"
                    value={<RunStatusBadge status={run.status} />}
                  />
                  <MetaField
                    label="Failed step"
                    value={
                      run.status === "failed"
                        ? (run.stepRuns.find((s) => s.status === "failed")
                            ?.stepKey ?? "—")
                        : "—"
                    }
                  />
                </MetaGroup>
              </div>

              <div className="flex flex-col gap-3">
                <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
                  STEP EXECUTION SEQUENCE
                </p>
                <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                  {run.stepRuns.map((step, index) => (
                    <StepExecutionCard
                      key={step.id}
                      index={index}
                      step={step}
                    />
                  ))}
                  {skippedSteps.map((step, offset) => (
                    <SkippedStepCard
                      key={step.id}
                      index={run.stepRuns.length + offset}
                      stepKey={step.stepKey}
                      type={step.type}
                      configuration={step.configuration}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
