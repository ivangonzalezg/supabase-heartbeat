/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useSessionContext } from "@/entities/session"

const SIGN_IN_PATH = "/sign-in"

function RootLayout() {
  const { status, isAuthenticated } = useSessionContext()
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  React.useEffect(() => {
    if (status === "loading") {
      return
    }
    if (!isAuthenticated && pathname !== SIGN_IN_PATH) {
      void navigate({ to: SIGN_IN_PATH, replace: true })
    }
    if (isAuthenticated && pathname === SIGN_IN_PATH) {
      void navigate({ to: "/", replace: true })
    }
  }, [status, isAuthenticated, pathname, navigate])

  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-sm">
        Loading...
      </div>
    )
  }

  // Avoid rendering the wrong page for one tick while the redirect effect fires.
  if (!isAuthenticated && pathname !== SIGN_IN_PATH) {
    return null
  }
  if (isAuthenticated && pathname === SIGN_IN_PATH) {
    return null
  }

  return <Outlet />
}

export const rootRoute = createRootRoute({ component: RootLayout })
