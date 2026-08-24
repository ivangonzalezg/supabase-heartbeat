import * as z from "zod"
import { workflowStepCreateSchema } from "@supabase-heartbeat/validation"

export const workflowFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Workflow name is required.")
      .max(200, "Workflow name must be at most 200 characters."),
    description: z.string().trim(),
    cronExpression: z.string().trim().min(1, "Cron expression is required."),
    timezone: z.string().trim().min(1, "Timezone is required."),
    enabled: z.boolean(),
    overlapPolicy: z.literal("skip"),
    steps: z
      .array(
        workflowStepCreateSchema.and(z.object({ id: z.string().optional() }))
      )
      .min(1, "Add at least one step."),
  })
  .superRefine((values, ctx) => {
    const seen = new Map<string, number>()
    values.steps.forEach((step, index) => {
      const firstIndex = seen.get(step.stepKey)
      if (firstIndex !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Step key must be unique within this workflow.",
          path: ["steps", index, "stepKey"],
        })
      } else {
        seen.set(step.stepKey, index)
      }
    })
  })

export type WorkflowFormValues = z.infer<typeof workflowFormSchema>
