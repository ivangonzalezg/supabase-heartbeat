import type { WorkflowStepCreateInput } from "@supabase-heartbeat/validation"
import {
  summarizeStepFields,
  type WorkflowStepDetail,
} from "@/entities/workflow"
import { Badge } from "@/shared/ui"
import { cn } from "@/shared/lib/utils"

export function ConfiguredStepsPanel({
  steps,
}: {
  steps: WorkflowStepDetail[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
        CONFIGURED STEPS · {steps.length}
      </p>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        {steps.map((step, index) => {
          const fields = summarizeStepFields(
            step as unknown as WorkflowStepCreateInput
          )
          return (
            <div key={step.id} className="rounded-md border bg-muted p-3.5">
              <div className="flex items-start gap-3">
                <span className="w-4 shrink-0 font-mono text-sm text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <div className="flex">
                    <div className="flex flex-1 flex-col">
                      <p className="text-sm font-semibold text-foreground">
                        {step.stepKey}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {step.type}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        step.enabled
                          ? "bg-sidebar-primary text-primary"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          step.enabled ? "bg-primary" : "bg-muted-foreground"
                        )}
                      />
                      {step.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  {fields.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {fields.map((field) => (
                        <div
                          key={field.label}
                          className="flex flex-col gap-0.5 text-xs sm:flex-row sm:gap-2"
                        >
                          <span className="w-14 shrink-0 font-medium text-muted-foreground">
                            {field.label}
                          </span>
                          {Array.isArray(field.value) ? (
                            <div className="flex flex-col gap-0.5">
                              {field.value.map((line) => (
                                <span
                                  key={line}
                                  className="font-mono break-all text-foreground"
                                >
                                  {line}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-mono break-all text-foreground">
                              {field.value}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
