import { FolderPlusIcon, PlusIcon } from "lucide-react"
import { Button } from "@/shared/ui"

export function OverviewEmptyState() {
  return (
    <div className="flex justify-center">
      <div className="flex w-full max-w-155 flex-col items-center gap-1 rounded-lg border bg-card px-8 py-10 text-center">
        <div className="mb-3 flex size-20.5 items-center justify-center rounded-[10px] bg-sidebar-primary">
          <FolderPlusIcon className="size-8 text-primary" />
        </div>
        <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
          GET STARTED
        </p>
        <h2 className="text-[22px] font-bold text-foreground">
          No projects yet
        </h2>
        <p className="max-w-135 text-sm text-muted-foreground">
          Create your first project before workflow activity can appear here.
        </p>
        <Button disabled className="mt-4">
          <PlusIcon />
          Create your first project
        </Button>
      </div>
    </div>
  )
}
