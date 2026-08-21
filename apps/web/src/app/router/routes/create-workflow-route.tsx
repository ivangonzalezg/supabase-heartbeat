import { createRoute } from "@tanstack/react-router"
import { dashboardLayoutRoute } from "../dashboard-layout-route"
import { CreateWorkflowPage } from "@/pages/create-workflow"

export const createWorkflowRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/projects/$projectId/workflows/new",
  component: CreateWorkflowPage,
})
