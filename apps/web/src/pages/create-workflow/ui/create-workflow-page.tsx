import { useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { useCreateWorkflow } from "@/entities/workflow"
import {
  emptyStepFor,
  WorkflowForm,
  type WorkflowFormValues,
} from "@/widgets/workflow-form"

export function CreateWorkflowPage() {
  const { projectId } = useParams({
    strict: false,
  }) as { projectId: string }
  const navigate = useNavigate()
  const createWorkflow = useCreateWorkflow()

  const onSubmit = async (values: WorkflowFormValues) => {
    try {
      const created = await createWorkflow.mutateAsync({
        ...values,
        projectId,
        description: values.description || undefined,
      })
      void navigate({
        to: "/projects/$projectId/workflows/$workflowId",
        params: { projectId, workflowId: created.id },
      })
    } catch {
      toast.error("Failed to create workflow", {
        description: "Check your workflow details and try again.",
      })
    }
  }

  return (
    <WorkflowForm
      title="Create workflow"
      description="Configure when activity runs and the ordered steps it performs."
      defaultValues={{
        name: "",
        description: "",
        cronExpression: "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        enabled: true,
        overlapPolicy: "skip",
        steps: [emptyStepFor("step_1")] as never[],
      }}
      onSubmit={onSubmit}
      submitLabel="Create workflow"
      cancelTo={{ to: "/" }}
      initialStepsExpanded
    />
  )
}
