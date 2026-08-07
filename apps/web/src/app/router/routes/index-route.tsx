import { createRoute } from "@tanstack/react-router"
import { dashboardLayoutRoute } from "../dashboard-layout-route"
import { OverviewPage } from "@/pages/overview"

export const indexRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/",
  component: OverviewPage,
})
