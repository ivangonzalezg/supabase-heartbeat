import { createRoute } from "@tanstack/react-router"
import { dashboardLayoutRoute } from "../dashboard-layout-route"
import { EditWorkflowPage } from "@/pages/edit-workflow"

export const editWorkflowRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/projects/$projectId/workflows/$workflowId/edit",
  component: EditWorkflowPage,
})
