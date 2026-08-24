import * as React from "react"
import { EllipsisIcon, PlayIcon, Trash2Icon } from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { useDeleteWorkflow, useUpdateWorkflow } from "@/entities/workflow"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  Spinner,
} from "@/shared/ui"
import { cn } from "@/shared/lib/utils"

const DELETE_CONFIRMATION_SECONDS = 5

export function WorkflowHeader({
  projectId,
  workflowId,
  workflowName,
  enabled,
  isFetching = false,
}: {
  projectId: string
  workflowId: string
  /** `undefined` only in the brief moment before either data source
   * (the overview fetch, or the cheaper workflow prefill) has data —
   * renders a name/status skeleton in that case only. The rest of the
   * header (action buttons) always renders regardless. */
  workflowName: string | undefined
  enabled: boolean | undefined
  /**
   * True while the workflow-overview data is being (re)fetched. `Run
   * now` is not wired to a real mutation yet, so it stays hardcoded
   * `disabled`; the more-actions trigger is gated on this instead.
   */
  isFetching?: boolean
}) {
  const hasData = workflowName !== undefined && enabled !== undefined
  const updateWorkflow = useUpdateWorkflow()
  const deleteWorkflow = useDeleteWorkflow()
  const navigate = useNavigate()

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [deleteCountdown, setDeleteCountdown] = React.useState(
    DELETE_CONFIRMATION_SECONDS
  )

  React.useEffect(() => {
    if (!deleteDialogOpen || deleteCountdown <= 0) return
    const timer = setTimeout(() => setDeleteCountdown((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [deleteDialogOpen, deleteCountdown])

  async function handleToggleEnabled() {
    if (enabled === undefined) return
    try {
      await updateWorkflow.mutateAsync({
        projectId,
        workflowId,
        enabled: !enabled,
      })
    } catch {
      toast.error(
        enabled ? "Failed to disable workflow" : "Failed to enable workflow",
        { description: "Please try again." }
      )
    }
  }

  async function handleDelete() {
    try {
      await deleteWorkflow.mutateAsync({ projectId, workflowId })
      setDeleteDialogOpen(false)
      void navigate({ to: "/" })
    } catch {
      toast.error("Failed to delete workflow", {
        description: "Please try again.",
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {hasData ? (
            <>
              <h1 className="text-2xl font-semibold text-foreground">
                {workflowName}
              </h1>
              <Badge
                className={cn(
                  enabled
                    ? "bg-success text-success-foreground"
                    : "bg-destructive-subtle text-destructive-subtle-foreground"
                )}
              >
                <span
                  className={cn(
                    "mr-1.5 size-1.5 rounded-full",
                    enabled
                      ? "bg-success-foreground"
                      : "bg-destructive-subtle-foreground"
                  )}
                />
                {enabled ? "Enabled" : "Disabled"}
              </Badge>
            </>
          ) : (
            <>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled>
            <PlayIcon />
            Run now
          </Button>
          <Button variant="outline" className="bg-card" asChild>
            <Link
              to="/projects/$projectId/workflows/$workflowId/edit"
              params={{ projectId, workflowId }}
            >
              Edit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="bg-card"
                disabled={!hasData || updateWorkflow.isPending}
              >
                {updateWorkflow.isPending && <Spinner />}
                {enabled ? "Disable" : "Enable"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {enabled ? "Disable this workflow?" : "Enable this workflow?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {enabled
                    ? "It will stop running on its schedule until you enable it again."
                    : "It will resume running on its schedule."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleToggleEnabled()}>
                  {enabled ? "Disable" : "Enable"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="bg-card"
                disabled={isFetching}
                aria-label="More actions"
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-max">
              <DropdownMenuItem
                className="text-destructive-subtle-foreground"
                onSelect={() => setDeleteDialogOpen(true)}
              >
                <Trash2Icon />
                Delete workflow
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              setDeleteDialogOpen(open)
              if (open) setDeleteCountdown(DELETE_CONFIRMATION_SECONDS)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this workflow?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this workflow, all of its steps,
                  and its complete run history. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteCountdown > 0 || deleteWorkflow.isPending}
                  onClick={(event) => {
                    event.preventDefault()
                    void handleDelete()
                  }}
                >
                  {deleteWorkflow.isPending && <Spinner />}
                  Delete workflow
                  {deleteCountdown > 0 ? ` (${deleteCountdown})` : ""}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}
