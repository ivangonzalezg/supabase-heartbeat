import { CalendarXIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui"
import { formatRunTimestamp } from "@/entities/workflow"
import type { OverviewUpcomingRun } from "@/entities/overview"

export function OverviewUpcomingRunsTable({
  runs,
}: {
  runs: OverviewUpcomingRun[]
}) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CalendarXIcon className="size-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          No upcoming runs
        </p>
        <p className="text-xs text-muted-foreground">
          Enable a scheduled workflow to see its next execution here.
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Workflow</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Scheduled for</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.workflowId}>
            <TableCell className="py-3 font-medium text-foreground">
              {run.workflowName}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {run.projectName}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {formatRunTimestamp(run.nextRun)}
            </TableCell>
            <TableCell className="py-3 font-mono text-muted-foreground">
              {run.cronExpression}
            </TableCell>
            <TableCell className="py-3">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-primary"
                asChild
              >
                <Link
                  to="/projects/$projectId/workflows/$workflowId"
                  params={{
                    projectId: run.projectId,
                    workflowId: run.workflowId,
                  }}
                >
                  View workflow
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
