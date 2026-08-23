import { Skeleton } from "@/shared/ui"

export function ConfiguredStepsPanelSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-2.5 w-36" />
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-md border bg-muted p-3.5">
            <div className="flex items-start gap-3">
              <Skeleton className="h-4 w-4" />
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
