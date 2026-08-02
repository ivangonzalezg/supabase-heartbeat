import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Input } from "./input"

describe("Input", () => {
  it("renders with the given type", () => {
    render(<Input aria-label="Email" type="email" />)

    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument()
  })

  it("calls onChange as the user types", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Input aria-label="Email" onChange={onChange} />)

    await user.type(screen.getByRole("textbox", { name: "Email" }), "hi")

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it("is disabled when the disabled prop is set", () => {
    render(<Input aria-label="Email" disabled />)

    expect(screen.getByRole("textbox", { name: "Email" })).toBeDisabled()
  })
})
