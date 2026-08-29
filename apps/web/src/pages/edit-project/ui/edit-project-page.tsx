import { useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { useProjectOverview, useUpdateProject } from "@/entities/project"
import { ProjectForm, type ProjectFormValues } from "@/widgets/project-form"
import { Spinner } from "@/shared/ui"

export function EditProjectPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string }
  const navigate = useNavigate()
  const overviewQuery = useProjectOverview(projectId, true)
  const updateProject = useUpdateProject()

  if (overviewQuery.isPending) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Spinner />
      </div>
    )
  }

  if (overviewQuery.isError) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6">
        <p className="text-sm text-destructive-subtle-foreground">
          Failed to load this project.
        </p>
      </div>
    )
  }

  const project = overviewQuery.data

  const onSubmit = async (values: ProjectFormValues) => {
    try {
      await updateProject.mutateAsync({
        projectId,
        ...values,
        description: values.description || undefined,
      })
      void navigate({ to: "/projects/$projectId", params: { projectId } })
    } catch {
      toast.error("Failed to update project", {
        description: "Check your connection details and try again.",
      })
    }
  }

  return (
    <ProjectForm
      title="Edit project"
      description="Update this project's details and Supabase connection."
      defaultValues={{
        name: project.name,
        description: project.description ?? "",
        supabaseUrl: project.supabaseUrl,
        publishableKey: project.publishableKey,
        enabled: project.enabled,
      }}
      onSubmit={onSubmit}
      submitLabel="Save changes"
      cancelTo={{ to: "/projects/$projectId", params: { projectId } }}
    />
  )
}
