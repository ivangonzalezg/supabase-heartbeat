import { createRoute } from "@tanstack/react-router"
import { dashboardLayoutRoute } from "../dashboard-layout-route"
import { WorkflowOverviewPage } from "@/pages/workflow-overview"

export const workflowOverviewRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/projects/$projectId/workflows/$workflowId",
  component: WorkflowOverviewPage,
})
