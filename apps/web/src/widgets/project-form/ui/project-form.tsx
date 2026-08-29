import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
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
  Spinner,
  Switch,
  Textarea,
} from "@/shared/ui"
import {
  projectFormSchema,
  type ProjectFormValues,
} from "../lib/project-form-schema"

export function ProjectForm({
  title,
  description,
  defaultValues,
  onSubmit,
  submitLabel,
  cancelTo,
}: {
  title: string
  description: string
  defaultValues: ProjectFormValues
  onSubmit: (values: ProjectFormValues) => Promise<void>
  submitLabel: string
  cancelTo: { to: string; params?: Record<string, string> }
}) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues,
  })

  return (
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
        <SectionCard eyebrow="PROJECT DETAILS">
          <FieldGroup className="gap-5 md:flex-row md:*:flex-1">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                  <Input
                    {...field}
                    id="project-name"
                    placeholder="Production"
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
                  <FieldLabel htmlFor="project-description">
                    Description
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="project-description"
                    placeholder="Main production database for the app."
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Add context to help identify this project later.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </SectionCard>

        <SectionCard eyebrow="SUPABASE CONNECTION">
          <FieldGroup className="gap-5 md:flex-row md:*:flex-1">
            <Controller
              name="supabaseUrl"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-url">Supabase URL</FieldLabel>
                  <Input
                    {...field}
                    id="project-url"
                    placeholder="https://your-project.supabase.co"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Find this value in your Supabase project settings.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
            <Controller
              name="publishableKey"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="project-key">Publishable key</FieldLabel>
                  <Input
                    {...field}
                    id="project-key"
                    placeholder="sb_publishable_••••••••••••••••"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>
                      Use the public client key from your Supabase project
                      settings.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
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
                  id="project-enabled"
                  className="self-center"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  onClick={(event) => event.stopPropagation()}
                />
                <FieldContent>
                  <FieldLabel
                    htmlFor="project-enabled"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Enable project
                  </FieldLabel>
                  <FieldDescription>
                    Enabled projects can contain active workflows and scheduled
                    executions.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
        </SectionCard>

        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" asChild>
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
    </form>
  )
}
