import { Link, useRouterState } from "@tanstack/react-router"
import { ActivityIcon, LayoutDashboardIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/shared/ui"
import { NavProjects } from "./nav-projects"
import { SidebarUserFooter } from "./sidebar-user-footer"

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isOverviewActive = pathname === "/"

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex size-8.5 items-center justify-center rounded-[7px] bg-foreground text-background">
                  <ActivityIcon className="size-4 stroke-primary" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-sm font-bold text-foreground">
                    Supabase Heartbeat
                  </span>
                  <span className="font-mono text-[8px] font-semibold tracking-wide text-muted-foreground">
                    WORKFLOW OPERATIONS
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isOverviewActive}
                className="data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
              >
                <Link to="/">
                  <LayoutDashboardIcon />
                  <span>Overview</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-muted-foreground">
            PROJECTS
          </SidebarGroupLabel>
          <NavProjects />
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
