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
  type WorkflowRunListItem,
} from "@/entities/workflow"

const TRIGGER_LABEL: Record<WorkflowRunListItem["triggerType"], string> = {
  manual: "Manual",
  scheduled: "Scheduled",
}

export function RecentRunsTable({
  runs,
  onViewDetails,
}: {
  runs: WorkflowRunListItem[]
  onViewDetails: (runId: string) => void
}) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CirclePlayIcon className="size-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">No runs yet</p>
        <p className="text-xs text-muted-foreground">
          Run this workflow to generate the first execution.
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
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
                onClick={() => onViewDetails(run.id)}
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
