import * as React from "react"
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import { Link, useMatches } from "@tanstack/react-router"
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

function useActiveWorkflowId() {
  const matches = useMatches()
  const match = matches.find(
    (m) => typeof (m.params as Record<string, unknown>).workflowId === "string"
  )
  return (match?.params as { workflowId?: string } | undefined)?.workflowId
}

function ProjectGroup({
  project,
  workflows,
  activeWorkflowId,
}: {
  project: Project
  workflows: Workflow[]
  activeWorkflowId: string | undefined
}) {
  const hasActiveWorkflow = workflows.some((w) => w.id === activeWorkflowId)
  const [expandedOverride, setExpandedOverride] = React.useState<
    boolean | null
  >(null)
  const expanded = expandedOverride ?? hasActiveWorkflow

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => setExpandedOverride(!expanded)}
        className="h-auto"
      >
        {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <span className="truncate">{project.name}</span>
      </SidebarMenuButton>
      {expanded && workflows.length ? (
        <SidebarMenuSub className="mr-0 pr-0">
          {workflows.map((workflow) => (
            <SidebarMenuSubItem key={workflow.id}>
              <SidebarMenuSubButton
                asChild
                isActive={workflow.id === activeWorkflowId}
                className="h-auto p-2.5 text-sm data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
              >
                <Link
                  to="/projects/$projectId/workflows/$workflowId"
                  params={{ projectId: project.id, workflowId: workflow.id }}
                >
                  {workflow.name}
                </Link>
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
  const activeWorkflowId = useActiveWorkflowId()

  return (
    <>
      <SidebarMenu>
        {projects.map((project) => (
          <ProjectGroup
            key={project.id}
            project={project}
            workflows={workflows.filter((w) => w.projectId === project.id)}
            activeWorkflowId={activeWorkflowId}
          />
        ))}
      </SidebarMenu>
      {projects.length === 0 && !projectsQuery.isLoading ? (
        <p className="py-2 font-mono text-[9px] font-semibold text-muted-foreground">
          NO PROJECTS YET
        </p>
      ) : null}
      <SidebarMenuButton
        asChild
        className="mt-2 justify-center border border-dashed border-input text-foreground"
      >
        <Link to="/projects/new">
          <PlusIcon className="text-primary" />
          New project
        </Link>
      </SidebarMenuButton>
    </>
  )
}
