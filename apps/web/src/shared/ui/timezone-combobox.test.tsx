import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TimezoneCombobox } from "./timezone-combobox"

describe("TimezoneCombobox", () => {
  it("shows a placeholder when no value is selected", () => {
    render(<TimezoneCombobox value="" onChange={vi.fn()} />)

    expect(screen.getByRole("combobox")).toHaveTextContent("Select timezone")
  })

  it("shows the selected value on the trigger", () => {
    render(<TimezoneCombobox value="America/Bogota" onChange={vi.fn()} />)

    expect(screen.getByRole("combobox")).toHaveTextContent("America/Bogota")
  })

  it("filters options as the user types and calls onChange on selection", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimezoneCombobox value="" onChange={onChange} />)

    await user.click(screen.getByRole("combobox"))
    await user.type(
      screen.getByPlaceholderText("Search timezone..."),
      "America/Bogota"
    )

    const option = await screen.findByRole("option", {
      name: "America/Bogota",
    })
    await user.click(option)

    expect(onChange).toHaveBeenCalledWith("America/Bogota")
  })

  it("shows an empty state when no timezone matches the search", async () => {
    const user = userEvent.setup()
    render(<TimezoneCombobox value="" onChange={vi.fn()} />)

    await user.click(screen.getByRole("combobox"))
    await user.type(
      screen.getByPlaceholderText("Search timezone..."),
      "not-a-real-timezone"
    )

    expect(await screen.findByText("No timezone found.")).toBeInTheDocument()
  })
})
