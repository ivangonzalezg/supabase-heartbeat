import { createRouter } from "@tanstack/react-router"
import { rootRoute } from "./root-route"
import { dashboardLayoutRoute } from "./dashboard-layout-route"
import { indexRoute } from "./routes/index-route"
import { createProjectRoute } from "./routes/create-project-route"
import { createWorkflowRoute } from "./routes/create-workflow-route"
import { workflowOverviewRoute } from "./routes/workflow-overview-route"
import { editWorkflowRoute } from "./routes/edit-workflow-route"
import { projectOverviewRoute } from "./routes/project-overview-route"
import { signInRoute } from "./routes/sign-in-route"

const routeTree = rootRoute.addChildren([
  dashboardLayoutRoute.addChildren([
    indexRoute,
    createProjectRoute,
    createWorkflowRoute,
    workflowOverviewRoute,
    editWorkflowRoute,
    projectOverviewRoute,
  ]),
  signInRoute,
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
