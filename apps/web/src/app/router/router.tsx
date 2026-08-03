import { createRouter } from "@tanstack/react-router"
import { rootRoute } from "./root-route"
import { indexRoute } from "./routes/index-route"
import { signInRoute } from "./routes/sign-in-route"

const routeTree = rootRoute.addChildren([indexRoute, signInRoute])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
