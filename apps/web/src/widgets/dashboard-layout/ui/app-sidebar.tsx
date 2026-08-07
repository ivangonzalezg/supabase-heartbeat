import { Link, useRouterState } from "@tanstack/react-router"
import { LayoutDashboardIcon } from "lucide-react"
import { logoHorizontalDark, logoHorizontalLight } from "@/shared/images"
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
      <SidebarHeader className="mx-4 h-16 border-b">
        <Link to="/" className="flex h-full items-center py-0.5">
          <img
            src={logoHorizontalLight}
            alt="Supabase Heartbeat"
            className="h-full w-auto dark:hidden"
          />
          <img
            src={logoHorizontalDark}
            alt="Supabase Heartbeat"
            className="hidden h-full w-auto dark:block"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isOverviewActive}
                className="h-auto data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
              >
                <Link to="/">
                  <LayoutDashboardIcon />
                  <span>Overview</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="px-5">
          <SidebarGroupLabel className="px-0 font-mono text-muted-foreground">
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
