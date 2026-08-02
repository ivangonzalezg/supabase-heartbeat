import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "./App"

const { useSessionContextMock } = vi.hoisted(() => ({
  useSessionContextMock: vi.fn(),
}))

vi.mock("@/entities/session", () => ({
  useSessionContext: useSessionContextMock,
  authClient: { signIn: { email: vi.fn() } },
}))

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      user: { id: "user-1", email: "admin@example.com", name: "Admin" },
      role: "admin",
      signOut: vi.fn(),
    })
  })

  it("requests /api/health and reports the API as online", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    expect(await screen.findByText("API online")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/health")
  })

  it("reports the API as unavailable when the request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"))
    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    expect(await screen.findByText("API unavailable")).toBeInTheDocument()
  })

  it("reports the API as unavailable when a 200 response has an unexpected body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<!doctype html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    expect(await screen.findByText("API unavailable")).toBeInTheDocument()
  })

  it("shows a loading state while the session is loading", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")))
    useSessionContextMock.mockReturnValue({
      status: "loading",
      user: null,
      role: null,
      signOut: vi.fn(),
    })

    render(<App />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("shows the sign-in form when unauthenticated", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")))
    useSessionContextMock.mockReturnValue({
      status: "unauthenticated",
      user: null,
      role: null,
      signOut: vi.fn(),
    })

    render(<App />)

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  })

  it("shows the signed-in user and calls signOut on click", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")))
    const signOut = vi.fn()
    useSessionContextMock.mockReturnValue({
      status: "authenticated",
      user: { id: "user-1", email: "admin@example.com", name: "Admin" },
      role: "admin",
      signOut,
    })

    render(<App />)

    expect(
      screen.getByText("Signed in as admin@example.com.")
    ).toBeInTheDocument()

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Sign out" }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
