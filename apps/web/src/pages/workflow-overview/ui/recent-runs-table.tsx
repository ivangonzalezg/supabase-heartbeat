import { CirclePlayIcon } from "lucide-react"
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui"
import { cn } from "@/shared/lib/utils"
import type { WorkflowRunListItem } from "@/entities/workflow"
import { formatDuration } from "../lib/format-duration"
import { formatRunTimestamp } from "../lib/format-run-timestamp"

const STATUS_LABEL: Record<WorkflowRunListItem["status"], string> = {
  pending: "Pending",
  running: "Running",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
}

const STATUS_CLASS: Record<WorkflowRunListItem["status"], string> = {
  pending: "bg-secondary text-secondary-foreground",
  running: "bg-running text-running-foreground",
  success: "bg-success text-success-foreground",
  failed: "bg-destructive-subtle text-destructive-subtle-foreground",
  cancelled: "bg-secondary text-secondary-foreground",
  skipped: "bg-skipped text-skipped-foreground",
}

const TRIGGER_LABEL: Record<WorkflowRunListItem["triggerType"], string> = {
  manual: "Manual",
  scheduled: "Scheduled",
}

export function RecentRunsTable({ runs }: { runs: WorkflowRunListItem[] }) {
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
              <Badge className={cn(STATUS_CLASS[run.status])}>
                {STATUS_LABEL[run.status]}
              </Badge>
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
              <span className="text-primary">View details</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
