import { Skeleton } from "@/shared/ui"

export function ProjectSummarySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
        PROJECT SUMMARY
      </p>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-card px-6 py-4">
            <Skeleton className="h-2.75 w-16" />
            <Skeleton className="mt-2 h-6 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}
