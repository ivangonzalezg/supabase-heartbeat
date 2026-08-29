import { formatRunTimestamp } from "@/entities/workflow"
import type { OverviewSummaryMetrics } from "@/entities/overview"

const METRICS: {
  key: keyof OverviewSummaryMetrics
  label: string
}[] = [
  { key: "totalProjects", label: "Total projects" },
  { key: "activeWorkflows", label: "Active workflows" },
  { key: "totalRuns", label: "Runs · 7 days" },
  { key: "failedRuns", label: "Failed runs" },
  { key: "lastActivity", label: "Last activity" },
  { key: "nextRun", label: "Next run" },
]

function formatMetricValue(
  key: keyof OverviewSummaryMetrics,
  summary: OverviewSummaryMetrics
): string {
  switch (key) {
    case "lastActivity":
      return formatRunTimestamp(summary.lastActivity)
    case "nextRun":
      return formatRunTimestamp(summary.nextRun)
    default:
      return `${summary[key]}`
  }
}

export function OverviewSummaryCard({
  summary,
}: {
  summary: OverviewSummaryMetrics
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
        GLOBAL SUMMARY
      </p>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {METRICS.map(({ key, label }) => (
          <div key={key} className="bg-card px-6 py-4">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p
              className={
                key === "lastActivity" || key === "nextRun"
                  ? "mt-1 text-sm font-medium text-foreground"
                  : "mt-1 font-mono text-xl font-semibold text-foreground"
              }
            >
              {formatMetricValue(key, summary)}
            </p>
            {key === "nextRun" && summary.nextRunWorkflowName ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {summary.nextRunWorkflowName} · {summary.nextRunProjectName}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
