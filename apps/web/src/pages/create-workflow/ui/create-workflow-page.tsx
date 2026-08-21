import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, FormProvider, useForm } from "react-hook-form"
import { ArrowLeftIcon } from "lucide-react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import * as z from "zod"
import { workflowStepCreateSchema } from "@supabase-heartbeat/validation"
import { useProjects } from "@/entities/project"
import { useCreateWorkflow } from "@/entities/workflow"
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
  Textarea,
  TimezoneCombobox,
} from "@/shared/ui"
import { emptyStepFor } from "./step-config-forms"
import { WorkflowStepsField } from "./workflow-steps-field"

const createWorkflowSchema = z
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
    steps: z.array(workflowStepCreateSchema).min(1, "Add at least one step."),
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

type CreateWorkflowValues = z.infer<typeof createWorkflowSchema>

export function CreateWorkflowPage() {
  const { projectId } = useParams({
    strict: false,
  }) as { projectId: string }
  const navigate = useNavigate()
  const projectsQuery = useProjects(true)
  const project = projectsQuery.data?.find((p) => p.id === projectId)
  const createWorkflow = useCreateWorkflow()

  const form = useForm({
    mode: "onBlur",
    reValidateMode: "onChange",
    resolver: zodResolver(createWorkflowSchema, {
      error: (issue) => {
        if (issue.code === "invalid_union" && issue.path?.at(-1) === "type") {
          return "Select a step type."
        }
        return undefined
      },
    }),
    defaultValues: {
      name: "",
      description: "",
      cronExpression: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      enabled: true,
      overlapPolicy: "skip",
      steps: [emptyStepFor("step_1")] as never[],
    },
  })

  const onSubmit = async (values: CreateWorkflowValues) => {
    try {
      await createWorkflow.mutateAsync({
        ...values,
        projectId,
        description: values.description || undefined,
      })
      void navigate({ to: "/" })
    } catch {
      toast.error("Failed to create workflow", {
        description: "Check your workflow details and try again.",
      })
    }
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        className="flex min-h-full flex-col gap-6 p-6"
      >
        <div className="flex flex-col gap-4">
          <Link
            to="/"
            className="flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to {project?.name ?? "overview"}
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Create workflow
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure when activity runs and the ordered steps it performs.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard eyebrow="WORKFLOW DETAILS">
            <FieldGroup className="gap-5 md:flex-row md:*:flex-1">
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="workflow-name">
                      Workflow name
                    </FieldLabel>
                    <Input
                      {...field}
                      id="workflow-name"
                      placeholder="Daily content activity"
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>
                        A recognizable name used only inside Supabase Heartbeat.
                      </FieldDescription>
                    )}
                  </Field>
                )}
              />
              <Controller
                name="description"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="workflow-description">
                      Description
                    </FieldLabel>
                    <Textarea
                      {...field}
                      id="workflow-description"
                      placeholder="Generate daily activity from recent content."
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Add context to help identify this workflow later.
                    </FieldDescription>
                  </Field>
                )}
              />
            </FieldGroup>
          </SectionCard>

          <SectionCard eyebrow="SCHEDULE">
            <FieldGroup className="gap-5 md:flex-row md:*:flex-1">
              <Controller
                name="cronExpression"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="workflow-cron">
                      Cron expression
                    </FieldLabel>
                    <Input
                      {...field}
                      id="workflow-cron"
                      placeholder="0 9 * * *"
                      className="font-mono"
                      aria-invalid={fieldState.invalid}
                      autoComplete="off"
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>
                        Standard cron syntax (minute hour day month weekday).
                      </FieldDescription>
                    )}
                  </Field>
                )}
              />
              <Controller
                name="timezone"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="workflow-timezone">
                      Timezone
                    </FieldLabel>
                    <TimezoneCombobox
                      id="workflow-timezone"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>
                        An IANA timezone used to evaluate the schedule.
                      </FieldDescription>
                    )}
                  </Field>
                )}
              />
              <Field>
                <FieldLabel htmlFor="workflow-overlap-policy">
                  Overlap policy
                </FieldLabel>
                <Select value="skip" disabled>
                  <SelectTrigger
                    id="workflow-overlap-policy"
                    className="h-10! w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip if running</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Only &quot;skip if running&quot; is supported today.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </SectionCard>

          <SectionCard eyebrow="STATUS">
            <Controller
              name="enabled"
              control={form.control}
              render={({ field }) => (
                <Field
                  orientation="horizontal"
                  onClick={() => field.onChange(!field.value)}
                  className="cursor-pointer"
                >
                  <Switch
                    id="workflow-enabled"
                    className="self-center"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <FieldContent>
                    <FieldLabel
                      htmlFor="workflow-enabled"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Enable workflow
                    </FieldLabel>
                    <FieldDescription>
                      Enabled workflows can run manually and on schedule.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </SectionCard>

          <WorkflowStepsField />

          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" className="bg-card" asChild>
              <Link to="/">Cancel</Link>
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              Create workflow
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}
