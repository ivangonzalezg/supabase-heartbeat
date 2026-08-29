import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { useCreateProject } from "@/entities/project"
import { ProjectForm, type ProjectFormValues } from "@/widgets/project-form"

export function CreateProjectPage() {
  const navigate = useNavigate()
  const createProject = useCreateProject()

  const onSubmit = async (values: ProjectFormValues) => {
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
    <ProjectForm
      title="Create project"
      description="Connect a Supabase project before creating workflows and scheduling activity."
      defaultValues={{
        name: "",
        description: "",
        supabaseUrl: "",
        publishableKey: "",
        enabled: true,
      }}
      onSubmit={onSubmit}
      submitLabel="Create project"
      cancelTo={{ to: "/" }}
    />
  )
}
