import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Label } from "./label"
import { Input } from "./input"

describe("Label", () => {
  it("associates with its input via htmlFor", () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" />
      </>
    )

    expect(screen.getByLabelText("Email")).toBeInTheDocument()
  })
})
