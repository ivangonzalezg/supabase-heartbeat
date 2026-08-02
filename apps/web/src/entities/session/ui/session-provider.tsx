/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { authClient } from "@/entities/session/model/auth-client"

type ApplicationRole = "admin" | "viewer"

type SessionUser = {
  id: string
  email: string
  name: string
  role: ApplicationRole
}

type SessionStatus = "loading" | "authenticated" | "unauthenticated"

type SessionContextValue = {
  user: SessionUser | null
  role: ApplicationRole | null
  status: SessionStatus
  signOut: () => Promise<void>
}

const SessionContext = React.createContext<SessionContextValue | undefined>(
  undefined
)

function toApplicationRole(role: unknown): ApplicationRole {
  const value = Array.isArray(role) ? role[0] : role
  return value === "admin" ? "admin" : "viewer"
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession()

  const value = React.useMemo<SessionContextValue>(() => {
    const signOut = async () => {
      await authClient.signOut()
    }

    if (isPending) {
      return { user: null, role: null, status: "loading", signOut }
    }

    if (!data?.user) {
      return { user: null, role: null, status: "unauthenticated", signOut }
    }

    const role = toApplicationRole(data.user.role)

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role,
      },
      role,
      status: "authenticated",
      signOut,
    }
  }, [data, isPending])

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSessionContext() {
  const context = React.useContext(SessionContext)

  if (context === undefined) {
    throw new Error("useSessionContext must be used within a SessionProvider")
  }

  return context
}
