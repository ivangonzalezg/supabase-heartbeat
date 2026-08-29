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
import type { OverviewProjectSummary } from "@/entities/overview"

export function OverviewProjectsTable({
  projects,
}: {
  projects: OverviewProjectSummary[]
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Total workflows</TableHead>
          <TableHead>Active</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead>Next run</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell className="py-3 font-semibold text-foreground">
              {project.name}
            </TableCell>
            <TableCell className="py-3">
              <Badge
                className={cn(
                  project.enabled
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {project.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </TableCell>
            <TableCell className="py-3 font-mono text-muted-foreground">
              {project.totalWorkflows}
            </TableCell>
            <TableCell className="py-3 font-mono text-muted-foreground">
              {project.activeWorkflows}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {formatRunTimestamp(project.lastActivity)}
            </TableCell>
            <TableCell className="py-3 text-muted-foreground">
              {formatRunTimestamp(project.nextRun)}
            </TableCell>
            <TableCell className="py-3">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-primary"
                asChild
              >
                <Link to="/projects/$projectId" params={{ projectId: project.id }}>
                  View project
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
