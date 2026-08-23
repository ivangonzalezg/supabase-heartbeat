import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { ConfiguredStepsPanelSkeleton } from "./configured-steps-panel-skeleton"

describe("ConfiguredStepsPanelSkeleton", () => {
  it("renders placeholder step cards", () => {
    const { container } = render(<ConfiguredStepsPanelSkeleton />)

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      1 + 3 * 4
    )
  })
})
