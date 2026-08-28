import { createRoute } from "@tanstack/react-router"
import { dashboardLayoutRoute } from "../dashboard-layout-route"
import { ProjectOverviewPage } from "@/pages/project-overview"

export const projectOverviewRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/projects/$projectId",
  component: ProjectOverviewPage,
})
