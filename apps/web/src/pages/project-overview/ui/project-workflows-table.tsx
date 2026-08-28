import { Link } from "@tanstack/react-router"
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui"
import { cn } from "@/shared/lib/utils"
import { formatRunTimestamp } from "@/entities/workflow"
import type { ProjectWorkflowSummary } from "@/entities/project"

const STATUS_LABEL: Record<string, string> = {
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  running: "Running",
  pending: "Pending",
}

export function ProjectWorkflowsTable({
  projectId,
  workflows,
}: {
  projectId: string
  workflows: ProjectWorkflowSummary[]
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Workflow</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead>Timezone</TableHead>
          <TableHead>Last run</TableHead>
          <TableHead>Next run</TableHead>
          <TableHead>Last status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {workflows.map((workflow) => (
          <TableRow key={workflow.id}>
            <TableCell className="py-3 font-semibold text-foreground">
              {workflow.name}
            </TableCell>
            <TableCell className="py-3">
              <Badge
                className={cn(
                  workflow.enabled
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {workflow.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </TableCell>
            <TableCell className="py-3 font-mono text-muted-foreground">
              {workflow.cronExpression}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {workflow.timezone}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {formatRunTimestamp(workflow.lastRun)}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {formatRunTimestamp(workflow.nextRun)}
            </TableCell>
            <TableCell
              className={cn(
                "py-3",
                workflow.lastStatus === "failed"
                  ? "text-destructive-subtle-foreground"
                  : workflow.lastStatus === "success"
                    ? "text-success-foreground"
                    : "text-muted-foreground"
              )}
            >
              {workflow.lastStatus ? STATUS_LABEL[workflow.lastStatus] : "—"}
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
                  params={{ projectId, workflowId: workflow.id }}
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
