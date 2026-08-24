import type { WorkflowStepCreateInput } from "@supabase-heartbeat/validation"
import {
  formatDuration,
  RunStatusBadge,
  summarizeStepFields,
  type StepRunDetail,
} from "@/entities/workflow"

function DetailRow({
  label,
  value,
  destructive,
}: {
  label: string
  value: string | string[]
  destructive?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:gap-2">
      <span className="w-14 shrink-0 font-medium text-muted-foreground">
        {label}
      </span>
      {Array.isArray(value) ? (
        <div className="flex flex-col gap-0.5">
          {value.map((line) => (
            <span key={line} className="font-mono break-all text-foreground">
              {line}
            </span>
          ))}
        </div>
      ) : (
        <span
          className={
            destructive
              ? "font-mono font-medium break-all text-destructive-subtle-foreground"
              : "font-mono break-all text-foreground"
          }
        >
          {value}
        </span>
      )}
    </div>
  )
}

function StepExecutionCardShell({
  index,
  title,
  type,
  status,
  duration,
  children,
}: {
  index: number
  title: string
  type: string
  status: StepRunDetail["status"]
  duration: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-md border bg-muted p-3.5">
      <div className="flex items-start gap-3">
        <span className="w-4 shrink-0 font-mono text-sm text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="font-mono text-xs text-muted-foreground">{type}</p>
            </div>
            <div className="flex items-center gap-2">
              <RunStatusBadge status={status} />
              <span className="font-mono text-xs text-muted-foreground">
                {duration}
              </span>
            </div>
          </div>
          {children ? (
            <div className="mt-2 flex flex-col gap-1">{children}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function StepExecutionCard({
  index,
  step,
}: {
  index: number
  step: StepRunDetail
}) {
  const fields = step.inputSnapshot
    ? summarizeStepFields(
        step.inputSnapshot as unknown as WorkflowStepCreateInput
      )
    : []

  return (
    <StepExecutionCardShell
      index={index}
      title={step.stepKey}
      type={step.type}
      status={step.status}
      duration={
        formatDuration(
          step.startedAt && step.finishedAt
            ? new Date(step.finishedAt).getTime() -
                new Date(step.startedAt).getTime()
            : null
        ) ?? "—"
      }
    >
      {fields.map((field) => (
        <DetailRow key={field.label} label={field.label} value={field.value} />
      ))}
      {step.error ? (
        <DetailRow label="Error" value={step.error} destructive />
      ) : null}
    </StepExecutionCardShell>
  )
}

export function SkippedStepCard({
  index,
  stepKey,
  type,
  configuration,
}: {
  index: number
  stepKey: string
  type: string
  configuration: Record<string, unknown>
}) {
  const fields = summarizeStepFields({
    stepKey,
    type,
    configuration,
  } as unknown as WorkflowStepCreateInput)

  return (
    <StepExecutionCardShell
      index={index}
      title={stepKey}
      type={type}
      status="skipped"
      duration="—"
    >
      {fields.map((field) => (
        <DetailRow key={field.label} label={field.label} value={field.value} />
      ))}
    </StepExecutionCardShell>
  )
}
