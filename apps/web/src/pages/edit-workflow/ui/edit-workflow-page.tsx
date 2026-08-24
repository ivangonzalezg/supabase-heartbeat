import { useNavigate, useParams } from "@tanstack/react-router"
import { toast } from "sonner"
import { useReplaceWorkflow, useWorkflowOverview } from "@/entities/workflow"
import { WorkflowForm, type WorkflowFormValues } from "@/widgets/workflow-form"
import { Spinner } from "@/shared/ui"

export function EditWorkflowPage() {
  const { projectId, workflowId } = useParams({ strict: false }) as {
    projectId: string
    workflowId: string
  }
  const navigate = useNavigate()
  const overviewQuery = useWorkflowOverview(projectId, workflowId, true)
  const replaceWorkflow = useReplaceWorkflow()

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
          Failed to load this workflow.
        </p>
      </div>
    )
  }

  const workflow = overviewQuery.data

  const onSubmit = async (values: WorkflowFormValues) => {
    try {
      await replaceWorkflow.mutateAsync({
        projectId,
        workflowId,
        ...values,
        description: values.description || undefined,
      })
      void navigate({
        to: "/projects/$projectId/workflows/$workflowId",
        params: { projectId, workflowId },
      })
    } catch {
      toast.error("Failed to update workflow", {
        description: "Check your workflow details and try again.",
      })
    }
  }

  return (
    <WorkflowForm
      title="Edit workflow"
      description="Update the schedule and steps this workflow performs."
      defaultValues={{
        name: workflow.name,
        description: workflow.description ?? "",
        cronExpression: workflow.cronExpression,
        timezone: workflow.timezone,
        enabled: workflow.enabled,
        overlapPolicy: "skip",
        steps: workflow.steps.map((step) => ({
          id: step.id,
          stepKey: step.stepKey,
          type: step.type,
          configuration: step.configuration,
          enabled: step.enabled,
        })) as never[],
      }}
      onSubmit={onSubmit}
      submitLabel="Save changes"
      cancelTo={{
        to: "/projects/$projectId/workflows/$workflowId",
        params: { projectId, workflowId },
      }}
    />
  )
}
