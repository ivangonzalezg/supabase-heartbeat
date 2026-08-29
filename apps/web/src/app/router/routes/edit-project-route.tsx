import { createRoute } from "@tanstack/react-router"
import { dashboardLayoutRoute } from "../dashboard-layout-route"
import { EditProjectPage } from "@/pages/edit-project"

export const editProjectRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/projects/$projectId/edit",
  component: EditProjectPage,
})
