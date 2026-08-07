import { createRoute } from "@tanstack/react-router"
import { dashboardLayoutRoute } from "../dashboard-layout-route"
import { CreateProjectPage } from "@/pages/create-project"

export const createProjectRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/projects/new",
  component: CreateProjectPage,
})
