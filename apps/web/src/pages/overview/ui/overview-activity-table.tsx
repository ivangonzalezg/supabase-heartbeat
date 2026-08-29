import { CirclePlayIcon } from "lucide-react"
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui"
import { cn } from "@/shared/lib/utils"
import {
  formatDuration,
  formatRunTimestamp,
  RunStatusBadge,
} from "@/entities/workflow"
import type { OverviewRecentRunItem } from "@/entities/overview"

const TRIGGER_LABEL: Record<OverviewRecentRunItem["triggerType"], string> = {
  manual: "Manual",
  scheduled: "Scheduled",
}

export function OverviewActivityTable({
  runs,
  onViewDetails,
}: {
  runs: OverviewRecentRunItem[]
  onViewDetails: (run: OverviewRecentRunItem) => void
}) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CirclePlayIcon className="size-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">No runs yet</p>
        <p className="text-xs text-muted-foreground">
          Runs will appear after a workflow executes.
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Workflow</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Failed step</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="py-3">
              <RunStatusBadge status={run.status} />
            </TableCell>
            <TableCell className="py-3 font-medium text-foreground">
              {run.workflowName}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {run.projectName}
            </TableCell>
            <TableCell className="py-3">
              {TRIGGER_LABEL[run.triggerType]}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {formatRunTimestamp(run.startedAt)}
            </TableCell>
            <TableCell className="py-3 font-mono text-muted-foreground">
              {formatDuration(run.durationMs) ?? "—"}
            </TableCell>
            <TableCell
              className={cn(
                "py-3",
                run.failedStepKey
                  ? "text-destructive-subtle-foreground"
                  : "text-muted-foreground"
              )}
            >
              {run.failedStepKey ?? "—"}
            </TableCell>
            <TableCell className="py-3">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-primary"
                onClick={() => onViewDetails(run)}
              >
                View details
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
