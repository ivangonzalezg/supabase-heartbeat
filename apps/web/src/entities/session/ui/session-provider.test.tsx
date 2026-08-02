import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SessionProvider, useSessionContext } from "./session-provider"

const { useSessionMock, signOutMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signOutMock: vi.fn(),
}))

vi.mock("@/entities/session/model/auth-client", () => ({
  authClient: {
    useSession: useSessionMock,
    signOut: signOutMock,
  },
}))

function SessionProbe() {
  const { user, role, status, signOut } = useSessionContext()

  return (
    <div>
      <p>status: {status}</p>
      <p>user: {user ? user.email : "none"}</p>
      <p>role: {role ?? "none"}</p>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  )
}

describe("SessionProvider", () => {
  it("reports loading while the session is pending", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true })

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    )

    expect(screen.getByText("status: loading")).toBeInTheDocument()
  })

  it("reports unauthenticated when there is no session", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false })

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    )

    expect(screen.getByText("status: unauthenticated")).toBeInTheDocument()
  })

  it("exposes the user and role when authenticated", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: {
          id: "user-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
        },
      },
      isPending: false,
    })

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    )

    expect(screen.getByText("status: authenticated")).toBeInTheDocument()
    expect(screen.getByText("user: admin@example.com")).toBeInTheDocument()
    expect(screen.getByText("role: admin")).toBeInTheDocument()
  })

  it("defaults to the viewer role when no role is present", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: { id: "user-1", email: "viewer@example.com", name: "Viewer" },
      },
      isPending: false,
    })

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    )

    expect(screen.getByText("role: viewer")).toBeInTheDocument()
  })

  it("calls the auth client's signOut", async () => {
    const user = userEvent.setup()
    useSessionMock.mockReturnValue({
      data: {
        user: {
          id: "user-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
        },
      },
      isPending: false,
    })

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    )

    await user.click(screen.getByRole("button", { name: "Sign out" }))

    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it("throws when used outside a SessionProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => render(<SessionProbe />)).toThrow(
      "useSessionContext must be used within a SessionProvider"
    )

    consoleError.mockRestore()
  })
})
