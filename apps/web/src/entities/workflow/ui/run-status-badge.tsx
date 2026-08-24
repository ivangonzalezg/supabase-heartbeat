import type { WorkflowRunStatus } from "@supabase-heartbeat/validation"
import { Badge } from "@/shared/ui"
import { cn } from "@/shared/lib/utils"

const STATUS_LABEL: Record<WorkflowRunStatus, string> = {
  pending: "Pending",
  running: "Running",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
}

const STATUS_CLASS: Record<WorkflowRunStatus, string> = {
  pending: "bg-secondary text-secondary-foreground",
  running: "bg-running text-running-foreground",
  success: "bg-success text-success-foreground",
  failed: "bg-destructive-subtle text-destructive-subtle-foreground",
  cancelled: "bg-secondary text-secondary-foreground",
  skipped: "bg-skipped text-skipped-foreground",
}

export function RunStatusBadge({
  status,
  className,
}: {
  status: WorkflowRunStatus
  className?: string
}) {
  return (
    <Badge className={cn(STATUS_CLASS[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
