import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeToggle } from "./theme-toggle"

const { useThemeMock } = vi.hoisted(() => ({
  useThemeMock: vi.fn(),
}))

vi.mock("@/shared/lib/theme-provider", () => ({
  useTheme: useThemeMock,
}))

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("calls setTheme with the opposite theme when clicked", async () => {
    const setTheme = vi.fn()
    useThemeMock.mockReturnValue({ theme: "light", setTheme })
    const user = userEvent.setup()

    render(<ThemeToggle />)

    await user.click(screen.getByRole("button", { name: "Toggle theme" }))

    expect(setTheme).toHaveBeenCalledWith("dark")
  })

  it("switches back to light when currently dark", async () => {
    const setTheme = vi.fn()
    useThemeMock.mockReturnValue({ theme: "dark", setTheme })
    const user = userEvent.setup()

    render(<ThemeToggle />)

    await user.click(screen.getByRole("button", { name: "Toggle theme" }))

    expect(setTheme).toHaveBeenCalledWith("light")
  })
})
