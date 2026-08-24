import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, FormProvider, useForm } from "react-hook-form"
import { Link } from "@tanstack/react-router"
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
import {
  workflowFormSchema,
  type WorkflowFormValues,
} from "../lib/workflow-form-schema"
import { WorkflowStepsField } from "./workflow-steps-field"

export function WorkflowForm({
  title,
  description,
  defaultValues,
  onSubmit,
  submitLabel,
  cancelTo,
  initialStepsExpanded = false,
}: {
  title: string
  description: string
  defaultValues: WorkflowFormValues
  onSubmit: (values: WorkflowFormValues) => Promise<void>
  submitLabel: string
  cancelTo: { to: string; params?: Record<string, string> }
  /**
   * Whether every step's accordion starts expanded. Create-workflow
   * starts with one empty step the user needs to fill in immediately, so
   * it opts in; edit-workflow prefills already-configured steps, which
   * should start collapsed so the form isn't overwhelming on load.
   */
  initialStepsExpanded?: boolean
}) {
  const form = useForm({
    mode: "onBlur",
    reValidateMode: "onChange",
    resolver: zodResolver(workflowFormSchema, {
      error: (issue) => {
        if (issue.code === "invalid_union" && issue.path?.at(-1) === "type") {
          return "Select a step type."
        }
        return undefined
      },
    }),
    defaultValues: defaultValues as never,
  })

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        className="flex min-h-full flex-col gap-6 p-6"
      >
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
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

          <WorkflowStepsField initialExpanded={initialStepsExpanded} />

          <div className="flex flex-col items-end gap-3">
            {form.formState.isSubmitted &&
            !form.formState.isSubmitSuccessful &&
            Object.keys(form.formState.errors).length > 0 ? (
              <p className="text-sm text-destructive-subtle-foreground">
                Fix the highlighted fields before saving.
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                type="button"
                className="bg-card"
                asChild
              >
                <Link to={cancelTo.to} params={cancelTo.params}>
                  Cancel
                </Link>
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Spinner />}
                {submitLabel}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}
