import {
  formatDuration,
  formatRunTimestamp,
  type WorkflowRunSummaryMetrics,
} from "@/entities/workflow"

const METRICS: {
  key: keyof WorkflowRunSummaryMetrics
  label: string
}[] = [
  { key: "totalRuns", label: "Total runs" },
  { key: "successRate", label: "Success rate" },
  { key: "failedRuns", label: "Failed runs" },
  { key: "avgDurationMs", label: "Avg duration" },
  { key: "lastRun", label: "Last run" },
  { key: "nextRun", label: "Next run" },
]

function formatMetricValue(
  key: keyof WorkflowRunSummaryMetrics,
  summary: WorkflowRunSummaryMetrics
): string {
  switch (key) {
    case "successRate":
      return summary.successRate === null ? "—" : `${summary.successRate}%`
    case "avgDurationMs":
      return formatDuration(summary.avgDurationMs) ?? "—"
    case "lastRun":
      return formatRunTimestamp(summary.lastRun)
    case "nextRun":
      return formatRunTimestamp(summary.nextRun)
    default:
      return `${summary[key]}`
  }
}

export function OperationalSummaryCard({
  summary,
}: {
  summary: WorkflowRunSummaryMetrics
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
        OPERATIONAL SUMMARY
      </p>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {METRICS.map(({ key, label }) => (
          <div key={key} className="bg-card px-6 py-4">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p
              className={
                key === "lastRun" || key === "nextRun"
                  ? "mt-1 text-sm font-medium text-foreground"
                  : "mt-1 font-mono text-xl font-semibold text-foreground"
              }
            >
              {formatMetricValue(key, summary)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
