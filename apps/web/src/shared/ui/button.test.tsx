import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "./button"

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Click me</Button>)

    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
  })

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click me</Button>)

    await user.click(screen.getByRole("button", { name: "Click me" }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Click me</Button>)

    expect(screen.getByRole("button", { name: "Click me" })).toBeDisabled()
  })
})
