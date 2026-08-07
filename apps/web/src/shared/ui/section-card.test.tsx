import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { SectionCard } from "./section-card"

describe("SectionCard", () => {
  it("renders the eyebrow and children", () => {
    render(
      <SectionCard eyebrow="PROJECT DETAILS">
        <p>Content</p>
      </SectionCard>
    )

    expect(screen.getByText("PROJECT DETAILS")).toBeInTheDocument()
    expect(screen.getByText("Content")).toBeInTheDocument()
  })
})
