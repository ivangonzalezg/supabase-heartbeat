import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { SignInPage } from "./sign-in-page"

vi.mock("@/entities/session", () => ({
  authClient: { signIn: { email: vi.fn() } },
}))

describe("SignInPage", () => {
  it("renders the brand and the sign-in form", () => {
    render(<SignInPage />)

    expect(screen.getAllByAltText("Supabase Heartbeat")).toHaveLength(2)
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument()
    expect(
      screen.getByText("Access your projects and workflows.")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
  })
})
