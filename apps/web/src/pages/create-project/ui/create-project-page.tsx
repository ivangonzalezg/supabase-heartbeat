import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { ArrowLeftIcon } from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import * as z from "zod"
import { useCreateProject } from "@/entities/project"
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

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(200, "Project name must be at most 200 characters."),
  description: z.string().trim(),
  supabaseUrl: z.url("Enter a valid http or https URL."),
  publishableKey: z
    .string()
    .trim()
    .min(1, "Publishable key is required.")
    .max(500, "Publishable key must be at most 500 characters."),
  enabled: z.boolean(),
})

type CreateProjectValues = z.infer<typeof createProjectSchema>

export function CreateProjectPage() {
  const navigate = useNavigate()
  const createProject = useCreateProject()
  const form = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      supabaseUrl: "",
      publishableKey: "",
      enabled: true,
    },
  })

  const onSubmit = async (values: CreateProjectValues) => {
    try {
      await createProject.mutateAsync({
        ...values,
        description: values.description || undefined,
      })
      void navigate({ to: "/" })
    } catch {
      toast.error("Failed to create project", {
        description: "Check your connection details and try again.",
      })
    }
  }

  return (
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
          Back to overview
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create project</h1>
          <p className="text-sm text-muted-foreground">
            Connect a Supabase project before creating workflows and scheduling
            activity.
          </p>
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
            <Link to="/">Cancel</Link>
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            Create project
          </Button>
        </div>
      </div>
    </form>
  )
}
