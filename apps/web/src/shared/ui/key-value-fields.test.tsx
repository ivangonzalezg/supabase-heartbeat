import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { KeyValueFields } from "./key-value-fields"

describe("KeyValueFields", () => {
  it("renders one row per entry", () => {
    render(
      <KeyValueFields
        rows={[
          { key: "last_active_at", value: "now()" },
          { key: "status", value: "active" },
        ]}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue("last_active_at")).toBeInTheDocument()
    expect(screen.getByDisplayValue("now()")).toBeInTheDocument()
    expect(screen.getByDisplayValue("status")).toBeInTheDocument()
    expect(screen.getByDisplayValue("active")).toBeInTheDocument()
  })

  it("renders a new empty row when Add value is clicked, without discarding it as unfilled", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KeyValueFields rows={[]} onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Add value" }))

    expect(screen.getByLabelText("Key 1")).toBeInTheDocument()
    expect(screen.getByLabelText("Value 1")).toBeInTheDocument()
  })

  it("calls onChange once the new row's key is filled in", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<KeyValueFields rows={[]} onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Add value" }))
    await user.type(screen.getByLabelText("Key 1"), "status")

    expect(onChange).toHaveBeenLastCalledWith([{ key: "status", value: "" }])
  })

  it("calls onChange with the row removed when its remove button is clicked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <KeyValueFields
        rows={[
          { key: "a", value: "1" },
          { key: "b", value: "2" },
        ]}
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole("button", { name: "Remove row 1" }))

    expect(onChange).toHaveBeenCalledWith([{ key: "b", value: "2" }])
  })

  it("calls onChange with the updated key or value when typing", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <KeyValueFields rows={[{ key: "", value: "" }]} onChange={onChange} />
    )

    await user.type(screen.getByLabelText("Key 1"), "x")

    expect(onChange).toHaveBeenLastCalledWith([{ key: "x", value: "" }])
  })
})
