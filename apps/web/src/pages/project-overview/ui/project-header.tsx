import * as React from "react"
import { EllipsisIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { useDeleteProject, useUpdateProject } from "@/entities/project"
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

export function ProjectHeader({
  projectId,
  projectName,
  description,
  enabled,
  isFetching = false,
}: {
  projectId: string
  /** `undefined` only in the brief moment before either data source (the
   * overview fetch, or the cheaper project prefill) has data — renders a
   * name/status skeleton in that case only. The rest of the header
   * (action buttons) always renders regardless. */
  projectName: string | undefined
  description: string | null | undefined
  enabled: boolean | undefined
  /**
   * True while the project-overview data is being (re)fetched. Gates
   * the more-actions trigger.
   */
  isFetching?: boolean
}) {
  const hasData = projectName !== undefined && enabled !== undefined
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
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
      await updateProject.mutateAsync({ projectId, enabled: !enabled })
    } catch {
      toast.error(
        enabled ? "Failed to disable project" : "Failed to enable project",
        { description: "Please try again." }
      )
    }
  }

  async function handleDelete() {
    try {
      await deleteProject.mutateAsync({ projectId })
      setDeleteDialogOpen(false)
      void navigate({ to: "/" })
    } catch {
      toast.error("Failed to delete project", {
        description: "Please try again.",
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            {hasData ? (
              <>
                <h1 className="text-2xl font-semibold text-foreground">
                  {projectName}
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
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={!hasData} asChild>
            <Link
              to="/projects/$projectId/workflows/new"
              params={{ projectId }}
            >
              <PlusIcon />
              New workflow
            </Link>
          </Button>
          <Button type="button" variant="outline" className="bg-card" disabled>
            Edit project
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="bg-card"
                disabled={!hasData || updateProject.isPending}
              >
                {updateProject.isPending && <Spinner />}
                {enabled ? "Disable" : "Enable"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {enabled ? "Disable this project?" : "Enable this project?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {enabled
                    ? "Its workflows will stop running on their schedules until you enable it again."
                    : "Its enabled workflows will resume running on their schedules."}
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
                Delete project
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
                <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this project, all of its
                  workflows, steps, and run history. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteCountdown > 0 || deleteProject.isPending}
                  onClick={(event) => {
                    event.preventDefault()
                    void handleDelete()
                  }}
                >
                  {deleteProject.isPending && <Spinner />}
                  Delete project
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
