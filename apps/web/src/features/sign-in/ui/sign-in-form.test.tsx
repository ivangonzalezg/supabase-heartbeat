import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

describe("SignInForm", () => {
  afterEach(() => {
    signInEmailMock.mockReset()
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

  it("shows an error message when sign-in fails", async () => {
    const user = userEvent.setup()
    signInEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid email or password." },
    })

    render(<SignInForm />)

    await user.type(screen.getByLabelText("Email"), "admin@example.com")
    await user.type(screen.getByLabelText("Password"), "wrong-password")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("Invalid email or password.")
    ).toBeInTheDocument()
  })

  it("shows validation errors instead of submitting when fields are invalid", async () => {
    const user = userEvent.setup()

    render(<SignInForm />)

    await user.type(screen.getByLabelText("Email"), "not-an-email")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("Enter a valid email address.")
    ).toBeInTheDocument()
    expect(screen.getByText("Password is required.")).toBeInTheDocument()
    expect(signInEmailMock).not.toHaveBeenCalled()
  })
})
