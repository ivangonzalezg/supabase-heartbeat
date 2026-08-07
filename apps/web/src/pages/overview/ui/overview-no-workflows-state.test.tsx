import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import type { Project } from "@/entities/project"
import { OverviewNoWorkflowsState } from "./overview-no-workflows-state"

function project(overrides: Partial<Project>): Project {
  return {
    id: "project-1",
    ownerId: "user-1",
    name: "Demo",
    description: null,
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_example",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("OverviewNoWorkflowsState", () => {
  it("renders the empty state copy", () => {
    render(<OverviewNoWorkflowsState projects={[]} />)

    expect(screen.getByText("NEXT STEP")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Choose a project to create its first workflow",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Workflows define what activity runs and when. Select a project to begin."
      )
    ).toBeInTheDocument()
    expect(screen.getByText("PROJECTS")).toBeInTheDocument()
  })

  it("renders one row per project with its description", () => {
    render(
      <OverviewNoWorkflowsState
        projects={[
          project({
            id: "project-1",
            name: "Artemivo",
            description: "Production project",
          }),
          project({ id: "project-2", name: "Internal API", description: null }),
        ]}
      />
    )

    expect(screen.getByText("Artemivo")).toBeInTheDocument()
    expect(screen.getByText("Production project")).toBeInTheDocument()

    expect(screen.getByText("Internal API")).toBeInTheDocument()

    expect(screen.getAllByText("Create workflow")).toHaveLength(2)
  })
})
