import { createRoute } from "@tanstack/react-router"
import { rootRoute } from "../root-route"
import { OverviewPage } from "@/pages/overview"

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
})
