import * as React from "react"
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import { useSessionContext } from "@/entities/session"
import { useProjects, type Project } from "@/entities/project"
import { useWorkflows, type Workflow } from "@/entities/workflow"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/shared/ui"

function ProjectGroup({
  project,
  workflows,
}: {
  project: Project
  workflows: Workflow[]
}) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => setExpanded((e) => !e)}>
        {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <span className="truncate text-xs font-semibold">{project.name}</span>
      </SidebarMenuButton>
      {expanded ? (
        <SidebarMenuSub>
          {workflows.map((workflow) => (
            <SidebarMenuSubItem key={workflow.id}>
              {/* No route exists for a workflow yet — this row is
                  presentational only, no click handler, no href. */}
              <SidebarMenuSubButton className="text-[11px]">
                {workflow.name}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  )
}

export function NavProjects() {
  const { isAuthenticated } = useSessionContext()
  const projectsQuery = useProjects(isAuthenticated)
  const workflowsQuery = useWorkflows(isAuthenticated)
  const projects = projectsQuery.data ?? []
  const workflows = workflowsQuery.data ?? []

  return (
    <>
      <SidebarMenu>
        {projects.map((project) => (
          <ProjectGroup
            key={project.id}
            project={project}
            workflows={workflows.filter((w) => w.projectId === project.id)}
          />
        ))}
      </SidebarMenu>
      {projects.length === 0 && !projectsQuery.isLoading ? (
        <p className="px-2 py-2 font-mono text-[9px] font-semibold text-muted-foreground">
          NO PROJECTS YET · NEW PROJECT REMAINS AVAILABLE
        </p>
      ) : null}
      <SidebarMenuButton
        disabled
        className="mt-2 justify-center border border-dashed border-input text-xs font-semibold text-foreground"
      >
        <PlusIcon className="text-primary" />
        New project
      </SidebarMenuButton>
    </>
  )
}
