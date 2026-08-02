import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { SignInForm } from "./sign-in-form"

const { signInEmailMock } = vi.hoisted(() => ({
  signInEmailMock: vi.fn(),
}))

vi.mock("@/entities/session", () => ({
  authClient: {
    signIn: {
      email: signInEmailMock,
    },
  },
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe("SignInForm", () => {
  afterEach(() => {
    signInEmailMock.mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it("submits the entered credentials", async () => {
    const user = userEvent.setup()
    signInEmailMock.mockResolvedValue({ data: {}, error: null })

    render(<SignInForm />)

    await user.type(screen.getByLabelText("Email"), "admin@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(signInEmailMock).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "correct-horse",
    })
  })

  it("shows a toast when sign-in fails", async () => {
    const user = userEvent.setup()
    signInEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid email or password." },
    })

    render(<SignInForm />)

    await user.type(screen.getByLabelText("Email"), "admin@example.com")
    await user.type(screen.getByLabelText("Password"), "wrong-password")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await vi.waitFor(() => toast.error)).toHaveBeenCalledWith(
      "Invalid credentials",
      { description: "Invalid email or password." }
    )
  })

  it("shows validation errors instead of submitting when fields are invalid", async () => {
    const user = userEvent.setup()

    render(<SignInForm />)

    await user.type(screen.getByLabelText("Email"), "not-an-email")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("Enter a valid email address.")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Password must be at least 8 characters.")
    ).toBeInTheDocument()
    expect(signInEmailMock).not.toHaveBeenCalled()
  })

  it("toggles password visibility", async () => {
    const user = userEvent.setup()

    render(<SignInForm />)

    const passwordInput = screen.getByLabelText("Password")
    expect(passwordInput).toHaveAttribute("type", "password")

    await user.click(screen.getByRole("button", { name: "Show password" }))

    expect(passwordInput).toHaveAttribute("type", "text")

    await user.click(screen.getByRole("button", { name: "Hide password" }))

    expect(passwordInput).toHaveAttribute("type", "password")
  })

  it("shows a spinner and disables the button while submitting", async () => {
    const user = userEvent.setup()
    let resolveSignIn!: (value: { data: object; error: null }) => void
    signInEmailMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve
      })
    )

    render(<SignInForm />)

    await user.type(screen.getByLabelText("Email"), "admin@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByText("Signing in...")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Signing in/ })).toBeDisabled()

    resolveSignIn({ data: {}, error: null })
  })
})
